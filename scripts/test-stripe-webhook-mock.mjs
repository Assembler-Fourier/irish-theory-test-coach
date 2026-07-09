import assert from "node:assert/strict";
import { handleStripeEvent } from "../api/stripe-webhook.js";
import { getCheckoutSessionEmail } from "../lib/stripe-entitlements.js";

const sampleEvent = {
  id: "evt_mock_checkout_completed",
  object: "event",
  type: "checkout.session.completed",
  data: {
    object: {
      id: "cs_test_mock_123",
      object: "checkout.session",
      status: "complete",
      payment_status: "paid",
      customer: "cus_mock_123",
      payment_intent: "pi_mock_123",
      amount_total: 99,
      currency: "eur",
      customer_details: {
        email: "Learner@example.com",
      },
      metadata: {
        product: "irish-theory-test-coach",
      },
    },
  },
};

const recordedSessions = [];

const result = await handleStripeEvent(
  sampleEvent,
  { databaseUrl: "mock-database-url" },
  {
    recordCheckoutSession: async (session, databaseUrl) => {
      recordedSessions.push({
        databaseUrl,
        email: getCheckoutSessionEmail(session),
        paymentIntent: session.payment_intent,
        sessionId: session.id,
      });
      return true;
    },
  }
);

assert.deepEqual(result, { handled: true, recorded: true });
assert.deepEqual(recordedSessions, [
  {
    databaseUrl: "mock-database-url",
    email: "learner@example.com",
    paymentIntent: "pi_mock_123",
    sessionId: "cs_test_mock_123",
  },
]);

console.log("Mock Stripe webhook handler test passed.");
