import assert from "node:assert/strict";
import createCheckoutSession from "../server/api/create-checkout-session.js";
import verifySession from "../server/api/verify-session.js";
import stripeWebhook from "../server/api/stripe-webhook.js";

const ENV_KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_ID",
  "STRIPE_WEBHOOK_SECRET",
  "DATABASE_URL",
  "PUBLIC_SITE_URL",
];

const tests = [
  ["create checkout rejects missing env safely", testCreateCheckoutMissingEnv],
  ["verify session rejects invalid session safely", testVerifySessionInvalidSession],
  ["webhook rejects invalid signature safely", testWebhookInvalidSignature],
];

for (const [name, test] of tests) {
  await test();
  console.log(`API smoke passed: ${name}`);
}

async function testCreateCheckoutMissingEnv() {
  await withEnv({}, async () => {
    const res = await withSuppressedExpectedErrors(() =>
      callHandler(createCheckoutSession, {
        method: "POST",
        headers: { "content-type": "application/json" },
      })
    );

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: "Server configuration error" });
    assertSafePayload(res.body);
  });
}

async function testVerifySessionInvalidSession() {
  await withEnv(validEnv(), async () => {
    const res = await callHandler(verifySession, {
      method: "GET",
      query: { session_id: "invalid_session" },
      headers: {},
    });

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: "Missing checkout session" });
    assertSafePayload(res.body);
  });
}

async function testWebhookInvalidSignature() {
  await withEnv(validEnv({ STRIPE_WEBHOOK_SECRET: "whsec_test_placeholder" }), async () => {
    const res = await withSuppressedExpectedErrors(() =>
      callHandler(stripeWebhook, {
        method: "POST",
        headers: {
          "stripe-signature": `t=${Math.floor(Date.now() / 1000)},v1=bad-signature`,
        },
        body: JSON.stringify({
          id: "evt_smoke_invalid",
          type: "checkout.session.completed",
          data: { object: {} },
        }),
      })
    );

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: "Invalid webhook payload" });
    assertSafePayload(res.body);
  });
}

async function callHandler(handler, req) {
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

async function withSuppressedExpectedErrors(callback) {
  const original = console.error;
  console.error = () => {};
  try {
    return await callback();
  } finally {
    console.error = original;
  }
}

function validEnv(overrides = {}) {
  return {
    STRIPE_SECRET_KEY: "sk_test_placeholder",
    STRIPE_PRICE_ID: "price_test_placeholder",
    DATABASE_URL: "postgresql://localhost:5432/irish_theory_test_coach",
    PUBLIC_SITE_URL: "http://localhost:5173",
    ...overrides,
  };
}

function assertSafePayload(payload) {
  const text = JSON.stringify(payload);
  assert.doesNotMatch(text, /sk_(live|test)_[a-zA-Z0-9]+/);
  assert.doesNotMatch(text, /whsec_[a-zA-Z0-9]+/);
  assert.doesNotMatch(text, /postgresql:\/\/[^"]+/);
}
