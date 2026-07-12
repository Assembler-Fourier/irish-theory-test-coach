import assert from "node:assert/strict";
import {
  detectPriceMode,
  detectRuntimeEnvironment,
  detectStripeSecretMode,
  validatePaymentEnvironment,
} from "../lib/payment-environment.js";
import { appendPaymentIntentTrace } from "../server/api/create-checkout-session.js";

testModeDetection();
testLiveSecretRejectsTestPrices();
testTestSecretRejectsLivePrices();
testProductionRequiresWebhookAndLiveMode();
testLocalRejectsProductionSiteUrl();
testCheckoutPaymentIntentTrace();

console.log("Payment environment policy tests passed.");

function testModeDetection() {
  assert.equal(detectRuntimeEnvironment({ PAYMENT_ENVIRONMENT: "production" }), "production");
  assert.equal(detectRuntimeEnvironment({ VERCEL_ENV: "preview" }), "preview");
  assert.equal(detectRuntimeEnvironment({ NODE_ENV: "test" }), "local");
  assert.equal(detectStripeSecretMode("sk_live_placeholder"), "live");
  assert.equal(detectStripeSecretMode("sk_test_placeholder"), "test");
  assert.equal(detectPriceMode("price_test_placeholder"), "test");
  assert.equal(detectPriceMode("price_live_placeholder"), "live");
}

function testLiveSecretRejectsTestPrices() {
  const result = validatePaymentEnvironment({
    PAYMENT_ENVIRONMENT: "production",
    STRIPE_SECRET_KEY: "sk_live_placeholder",
    STRIPE_PRICE_ID_FULL: "price_test_full_placeholder",
    STRIPE_WEBHOOK_SECRET: "whsec_placeholder",
    PUBLIC_SITE_URL: "https://example.com",
  });
  assert.equal(result.ok, false);
  assert.ok(result.invalid.includes("STRIPE_PRICE_ID_FULL"));
}

function testTestSecretRejectsLivePrices() {
  const result = validatePaymentEnvironment({
    PAYMENT_ENVIRONMENT: "preview",
    STRIPE_SECRET_KEY: "sk_test_placeholder",
    STRIPE_PRICE_ID_FULL: "price_live_full_placeholder",
    STRIPE_WEBHOOK_SECRET: "whsec_placeholder",
    PUBLIC_SITE_URL: "https://preview.example.com",
  });
  assert.equal(result.ok, false);
  assert.ok(result.invalid.includes("STRIPE_PRICE_ID_FULL"));
}

function testProductionRequiresWebhookAndLiveMode() {
  const result = validatePaymentEnvironment({
    PAYMENT_ENVIRONMENT: "production",
    STRIPE_SECRET_KEY: "sk_test_placeholder",
    STRIPE_PRICE_ID_FULL: "price_test_full_placeholder",
    PUBLIC_SITE_URL: "https://example.com",
  });
  assert.equal(result.ok, false);
  assert.ok(result.invalid.includes("STRIPE_SECRET_KEY"));
  assert.ok(result.invalid.includes("STRIPE_WEBHOOK_SECRET"));
}

function testLocalRejectsProductionSiteUrl() {
  const result = validatePaymentEnvironment({
    PAYMENT_ENVIRONMENT: "local",
    STRIPE_SECRET_KEY: "sk_test_placeholder",
    STRIPE_PRICE_ID_FULL: "price_test_full_placeholder",
    PUBLIC_SITE_URL: "https://irish-theory-test-coach.vercel.app",
  });
  assert.equal(result.ok, false);
  assert.ok(result.invalid.includes("PUBLIC_SITE_URL"));
}

function testCheckoutPaymentIntentTrace() {
  const params = appendPaymentIntentTrace(
    new URLSearchParams(),
    "5e3974c7-266d-4cf8-91a6-543266bde6f7",
    "full_study_pass",
  );
  assert.equal(
    params.get("payment_intent_data[metadata][checkout_attempt_id]"),
    "5e3974c7-266d-4cf8-91a6-543266bde6f7",
  );
  assert.equal(
    params.get("payment_intent_data[metadata][plan_key]"),
    "full_study_pass",
  );
}
