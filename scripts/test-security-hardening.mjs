import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import apiRouter from "../api/[...route].js";
import createCheckoutSession from "../server/api/create-checkout-session.js";
import {
  buildSessionCookie,
  classifyLoginToken,
  readJsonBody,
} from "../lib/auth.js";
import { requireAdmin } from "../lib/admin.js";
import { classifyAccess } from "../lib/account-data.js";
import {
  checkRateLimit,
  hashedClientIdentifier,
  rateLimitKey,
  resetRateLimitBucketsForTests,
} from "../lib/rate-limit.js";
import {
  applyApiSecurityHeaders,
  verifyStateChangingRequest,
} from "../lib/security.js";
import {
  fieldEnum,
  fieldNumber,
  fieldString,
  validateObject,
} from "../lib/request-validation.js";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const ENV_KEYS = [
  "DATABASE_URL",
  "PUBLIC_SITE_URL",
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_ID_FULL",
  "STRIPE_WEBHOOK_SECRET",
  "PAYMENT_ENVIRONMENT",
  "STRIPE_PRICE_MODE",
  "NODE_ENV",
  "VERCEL_ENV",
  "VERCEL_URL",
  "RATE_LIMIT_SALT",
];

await testRequestValidation();
await testBodyValidation();
testOriginAndCsrfProtection();
testSecurityHeaders();
testRateLimitHashing();
testSecureCookies();
await testCheckoutOriginBlock();
await testAdminOriginBlock();
await testRouterRejectsLargeBodies();
await testRoleBypassFails();
testSessionReplayAndExpiryModels();
testSqlLevelConcurrencyAndWebhookReplayGuards();

console.log("Security hardening tests passed.");

async function testRequestValidation() {
  assert.throws(
    () => validateObject({ planKey: "full_study_pass", extra: "nope" }, {
      fields: { planKey: fieldString({ max: 80, pattern: /^[a-z0-9_-]+$/ }) },
    }),
    /unknown_fields/
  );

  assert.throws(
    () => validateObject({ comment: "<script>alert(1)</script>" }, {
      fields: { comment: fieldString({ max: 200 }) },
    }),
    /unsafe_string/
  );

  assert.throws(
    () => validateObject({ count: 9999 }, {
      fields: { count: fieldNumber({ min: 1, max: 100, integer: true }) },
    }),
    /impossible_value/
  );

  assert.throws(
    () => validateObject({ mode: "admin" }, {
      fields: { mode: fieldEnum(["revise", "signs", "exam"]) },
    }),
    /invalid_enum/
  );

  assert.equal(validateObject({ code: "launch_offer" }, {
    fields: { code: fieldString({ max: 80, pattern: /^[a-z0-9_-]+$/ }) },
  }).code, "launch_offer");
}

async function testBodyValidation() {
  await assert.rejects(
    () => readJsonBody({ body: "{bad json" }, { maxBytes: 1024 }),
    /malformed_json/
  );

  await assert.rejects(
    () => readJsonBody({ body: JSON.stringify({ value: "x".repeat(2048) }) }, { maxBytes: 128 }),
    /request_body_too_large/
  );
}

function testOriginAndCsrfProtection() {
  const env = { publicSiteUrl: "https://coach.example", isProduction: true };
  assert.equal(
    verifyStateChangingRequest({
      method: "POST",
      headers: { origin: "https://coach.example", host: "coach.example" },
    }, env).ok,
    true
  );
  assert.equal(
    verifyStateChangingRequest({
      method: "POST",
      headers: { origin: "https://attacker.example", host: "coach.example" },
    }, env).ok,
    false
  );
  assert.equal(
    verifyStateChangingRequest({
      method: "POST",
      headers: { host: "coach.example" },
    }, env).ok,
    false
  );
  assert.equal(
    verifyStateChangingRequest({
      method: "GET",
      headers: { origin: "https://attacker.example", host: "coach.example" },
    }, env).ok,
    true
  );

  const previewEnv = {
    publicSiteUrl: "https://stable-preview.example",
    isProduction: false,
    vercelEnvironment: "preview",
    vercelUrl: "coach-git-feature-team.vercel.app",
  };
  assert.equal(
    verifyStateChangingRequest({
      method: "POST",
      headers: {
        origin: "https://coach-git-feature-team.vercel.app",
        host: "coach-git-feature-team.vercel.app",
      },
    }, previewEnv).ok,
    true,
    "The exact Vercel Preview deployment origin should be accepted."
  );
  assert.equal(
    verifyStateChangingRequest({
      method: "POST",
      headers: {
        origin: "https://attacker-preview.vercel.app",
        host: "coach-git-feature-team.vercel.app",
      },
    }, previewEnv).ok,
    false,
    "An arbitrary Vercel origin must not be trusted."
  );
  assert.equal(
    verifyStateChangingRequest({
      method: "POST",
      headers: { host: "coach-git-feature-team.vercel.app" },
    }, previewEnv).ok,
    false,
    "A deployed Preview must not accept a missing browser origin."
  );
}

function testSecurityHeaders() {
  const res = createMockResponse();
  applyApiSecurityHeaders(res, { requestId: "req_test" });
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  assert.equal(res.headers["cache-control"], "no-store");
  assert.equal(res.headers["x-frame-options"], "DENY");
  assert.equal(res.headers["x-request-id"], "req_test");
}

function testRateLimitHashing() {
  resetRateLimitBucketsForTests();
  process.env.RATE_LIMIT_SALT = "unit-test-salt";
  const req = {
    headers: { "x-forwarded-for": "203.0.113.10" },
    socket: { remoteAddress: "203.0.113.10" },
  };
  const hashed = hashedClientIdentifier(req);
  assert.doesNotMatch(hashed, /203\.0\.113\.10/);
  assert.match(rateLimitKey(req, "checkout"), /^checkout:[a-f0-9]{32}$/);

  const key = rateLimitKey(req, "unit-limit");
  assert.equal(checkRateLimit({ key, limit: 1, windowMs: 60_000 }).allowed, true);
  assert.equal(checkRateLimit({ key, limit: 1, windowMs: 60_000 }).allowed, false);
}

function testSecureCookies() {
  const cookie = buildSessionCookie("opaque_session_token", {
    isProduction: true,
    publicSiteUrl: "https://coach.example",
  });
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
}

async function testCheckoutOriginBlock() {
  await withEnv(validEnv({ NODE_ENV: "production", VERCEL_ENV: "production", PAYMENT_ENVIRONMENT: "production" }), async () => {
    const res = await callHandler(createCheckoutSession, {
      method: "POST",
      headers: {
        origin: "https://attacker.example",
        host: "coach.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({ planKey: "full_study_pass" }),
    });
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: "Request could not be verified" });
  });
}

async function testAdminOriginBlock() {
  await withEnv(validEnv({ NODE_ENV: "production", VERCEL_ENV: "production" }), async () => {
    const res = await callHandler(apiRouter, {
      method: "POST",
      query: { route: ["admin", "users"] },
      url: "/api/admin/users",
      headers: {
        origin: "https://attacker.example",
        host: "coach.example",
      },
    });
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: "Request could not be verified" });
  });
}

async function testRouterRejectsLargeBodies() {
  await withEnv(validEnv({ NODE_ENV: "production", VERCEL_ENV: "production" }), async () => {
    const res = await callHandler(apiRouter, {
      method: "POST",
      query: { route: ["events"] },
      url: "/api/events",
      headers: {
        origin: "https://coach.example",
        host: "coach.example",
        "content-length": "999999",
      },
    });
    assert.equal(res.statusCode, 413);
    assert.deepEqual(res.body, { error: "Request body too large" });
  });
}

async function testRoleBypassFails() {
  await assert.rejects(
    () => requireAdmin({
      __testSessionUser: {
        userId: "00000000-0000-4000-8000-000000000001",
        email: "learner@example.com",
        role: "user",
      },
      headers: {},
    }, "postgresql://localhost:5432/test", { permission: "manage_payments" }),
    /Admin access required/
  );
}

function testSessionReplayAndExpiryModels() {
  const now = new Date("2026-07-11T12:00:00.000Z");
  assert.equal(
    classifyLoginToken({ expires_at: "2026-07-11T12:10:00.000Z", consumed_at: now.toISOString() }, now),
    "used_link"
  );
  assert.equal(
    classifyAccess({ active: true, expires_at: "2026-07-01T12:00:00.000Z" }, now).status,
    "expired"
  );
}

function testSqlLevelConcurrencyAndWebhookReplayGuards() {
  const instructorCodes = fs.readFileSync(path.join(root, "lib", "instructor-codes.js"), "utf8");
  assert.match(instructorCodes, /for update/i, "Instructor code redemption should lock the row.");
  assert.match(instructorCodes, /redemption_count = redemption_count \+ 1/);

  const paymentLedger = fs.readFileSync(path.join(root, "lib", "payment-ledger.js"), "utf8");
  assert.match(paymentLedger, /on conflict \(stripe_event_id\) do update/i);
  assert.match(paymentLedger, /replay_count = stripe_events\.replay_count \+ \$6/i);
}

async function callHandler(handler, request) {
  const req = {
    method: request.method || "GET",
    query: request.query || {},
    headers: request.headers || {},
    body: request.body,
    url: request.url || "/api/test",
    socket: { remoteAddress: "127.0.0.1" },
    async *[Symbol.asyncIterator]() {
      if (typeof request.body === "string") yield Buffer.from(request.body);
    },
  };
  const res = createMockResponse();
  await handler(req, res);
  return res;
}

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
    end(payload = "") {
      this.body = payload;
      return this;
    },
  };
}

async function withEnv(values, callback) {
  const previous = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) {
    if (Object.hasOwn(values, key)) {
      process.env[key] = values[key];
    } else {
      delete process.env[key];
    }
  }

  try {
    return await callback();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function validEnv(overrides = {}) {
  return {
    DATABASE_URL: "postgresql://localhost:5432/irish_theory_test_coach",
    PUBLIC_SITE_URL: "https://coach.example",
    STRIPE_SECRET_KEY: "sk_live_placeholder",
    STRIPE_PRICE_ID_FULL: "price_live_full_placeholder",
    STRIPE_WEBHOOK_SECRET: "whsec_placeholder",
    PAYMENT_ENVIRONMENT: "production",
    STRIPE_PRICE_MODE: "live",
    RATE_LIMIT_SALT: "unit-test-salt",
    ...overrides,
  };
}
