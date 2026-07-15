import assert from "node:assert/strict";
import adminAudit from "../server/api/admin/audit.js";
import adminContentQuality from "../server/api/admin/content-quality.js";
import adminEntitlements from "../server/api/admin/entitlements.js";
import adminExport from "../server/api/admin/export.js";
import adminGenerateQuestions from "../server/api/admin/generate-questions.js";
import adminInstructors from "../server/api/admin/instructors.js";
import adminPayments from "../server/api/admin/payments.js";
import adminQuestions from "../server/api/admin/questions.js";
import adminReferrals from "../server/api/admin/referrals.js";
import adminStats from "../server/api/admin/stats.js";
import adminSupport from "../server/api/admin/support.js";
import adminUsers from "../server/api/admin/users.js";

const ENV_KEYS = ["DATABASE_URL", "PUBLIC_SITE_URL", "NODE_ENV", "VERCEL_ENV"];

const endpointCases = [
  ["stats GET", adminStats, { method: "GET" }, "owner"],
  ["users GET", adminUsers, { method: "GET" }, "support"],
  ["users POST", adminUsers, { method: "POST" }, "support"],
  ["entitlements GET", adminEntitlements, { method: "GET" }, "support"],
  ["entitlements POST", adminEntitlements, { method: "POST" }, "admin"],
  ["payments GET", adminPayments, { method: "GET" }, "admin"],
  ["payments POST", adminPayments, { method: "POST" }, "admin"],
  ["referrals GET", adminReferrals, { method: "GET" }, "admin"],
  ["referrals POST", adminReferrals, { method: "POST" }, "admin"],
  ["export GET", adminExport, { method: "GET", query: { type: "purchases" } }, "admin"],
  ["questions GET", adminQuestions, { method: "GET" }, "content_editor"],
  ["questions POST", adminQuestions, { method: "POST" }, "content_editor"],
  ["content-quality GET", adminContentQuality, { method: "GET" }, "content_editor"],
  ["content-quality POST", adminContentQuality, { method: "POST" }, "content_editor"],
  ["generate-questions GET", adminGenerateQuestions, { method: "GET" }, "content_editor"],
  ["generate-questions POST", adminGenerateQuestions, { method: "POST" }, "content_editor"],
  ["support GET", adminSupport, { method: "GET" }, "support"],
  ["support POST", adminSupport, { method: "POST" }, "support"],
  ["instructors GET", adminInstructors, { method: "GET" }, "admin"],
  ["instructors POST", adminInstructors, { method: "POST" }, "admin"],
  ["audit GET", adminAudit, { method: "GET" }, "admin"],
];

await withEnv(validEnv(), async () => {
  for (const [name, handler, request, allowedRole] of endpointCases) {
    await assertLoggedOutRejected(name, handler, request);
    await assertWrongRoleRejected(name, handler, request);
    await assertAllowedRoleAccepted(name, handler, request, allowedRole);
    console.log(`Admin authz passed: ${name}`);
  }
});

async function assertLoggedOutRejected(name, handler, request) {
  const res = await withSuppressedExpectedErrors(() => callHandler(handler, request));
  assert.equal(res.statusCode, 401, `${name} should reject logged-out requests`);
  assert.deepEqual(res.body, { error: "Login required" });
}

async function assertWrongRoleRejected(name, handler, request) {
  const res = await withSuppressedExpectedErrors(() =>
    callHandler(handler, {
      ...request,
      __testSessionUser: sessionUser("learner@example.com", "user"),
    })
  );
  assert.equal(res.statusCode, 403, `${name} should reject non-admin roles`);
  assert.deepEqual(res.body, { error: "Admin access required" });
}

async function assertAllowedRoleAccepted(name, handler, request, role) {
  const res = await callHandler(handler, {
    ...request,
    __testAuthzOnly: true,
    __testSessionUser: sessionUser(`${role}@example.com`, role),
  });
  assert.equal(res.statusCode, 200, `${name} should accept ${role}`);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.role, role);
  assertSafePayload(res.body);
}

async function callHandler(handler, request) {
  const req = {
    method: request.method || "GET",
    query: request.query || {},
    headers: request.headers || {},
    body: request.body,
    url: request.url || "/api/admin-test",
    __testAuthzOnly: request.__testAuthzOnly,
    __testSessionUser: request.__testSessionUser,
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

function sessionUser(email, role) {
  return {
    userId: "00000000-0000-4000-8000-000000000001",
    email,
    role,
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

async function withSuppressedExpectedErrors(callback) {
  const original = console.error;
  console.error = () => {};
  try {
    return await callback();
  } finally {
    console.error = original;
  }
}

function validEnv() {
  return {
    DATABASE_URL: "postgresql://localhost:5432/irish_theory_test_coach",
    PUBLIC_SITE_URL: "http://localhost:5173",
    NODE_ENV: "test",
  };
}

function assertSafePayload(payload) {
  const text = JSON.stringify(payload);
  assert.doesNotMatch(text, /sk_(live|test)_[a-zA-Z0-9]+/);
  assert.doesNotMatch(text, /whsec_[a-zA-Z0-9]+/);
  assert.doesNotMatch(text, /postgresql:\/\/[^"]+/);
}
