import assert from "node:assert/strict";
import webhookEntrypoint from "../api/stripe-webhook.js";
import {
  handleStripeEvent,
  normalizeStripeDisputeId,
} from "../server/api/stripe-webhook.js";
import { getCheckoutSessionEmail } from "../lib/stripe-entitlements.js";

assert.equal(typeof webhookEntrypoint.fetch, "function", "Stripe must use the Web Standard raw-body entrypoint.");
assert.equal(normalizeStripeDisputeId("du_current_sandbox"), "du_current_sandbox");
assert.equal(normalizeStripeDisputeId("dp_legacy_sandbox"), "dp_legacy_sandbox");
assert.equal(normalizeStripeDisputeId("evt_not_a_dispute"), "");

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
const eventStore = createMemoryEventStore();

const result = await handleStripeEvent(
  sampleEvent,
  { databaseUrl: "mock-database-url" },
  {
    eventStore,
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

assert.equal(result.handled, true);
assert.equal(result.recorded, true);
assert.deepEqual(recordedSessions, [
  {
    databaseUrl: "mock-database-url",
    email: "learner@example.com",
    paymentIntent: "pi_mock_123",
    sessionId: "cs_test_mock_123",
  },
]);

const duplicateResult = await handleStripeEvent(
  sampleEvent,
  { databaseUrl: "mock-database-url" },
  {
    eventStore,
    recordCheckoutSession: async () => {
      throw new Error("Duplicate event should not fulfill twice.");
    },
  }
);

assert.equal(duplicateResult.duplicate, true);
assert.equal(recordedSessions.length, 1);

const expiredFirst = await handleStripeEvent(
  {
    id: "evt_mock_checkout_expired",
    object: "event",
    type: "checkout.session.expired",
    data: { object: { id: "cs_test_mock_out_of_order", object: "checkout.session" } },
  },
  { databaseUrl: "mock-database-url" },
  { eventStore }
);

assert.equal(expiredFirst.handled, true);
assert.equal(expiredFirst.recorded, false);

const completedAfterExpired = await handleStripeEvent(
  {
    ...sampleEvent,
    id: "evt_mock_checkout_completed_after_expired",
    data: {
      object: {
        ...sampleEvent.data.object,
        id: "cs_test_mock_out_of_order",
        payment_intent: "pi_mock_out_of_order",
      },
    },
  },
  { databaseUrl: "mock-database-url" },
  {
    eventStore,
    recordCheckoutSession: async (session) => {
      recordedSessions.push({ sessionId: session.id, paymentIntent: session.payment_intent });
      return true;
    },
  }
);

assert.equal(completedAfterExpired.handled, true);
assert.equal(completedAfterExpired.recorded, true);
assert.equal(recordedSessions.at(-1).sessionId, "cs_test_mock_out_of_order");

console.log("Mock Stripe webhook handler test passed.");

function createMemoryEventStore() {
  const events = new Map();
  return {
    async begin(event, options = {}) {
      const id = event.id;
      const existing = events.get(id);
      if (existing?.status === "processed" && !options.forceReplay) {
        return { eventId: id, alreadyProcessed: true };
      }
      events.set(id, {
        status: "processing",
        replayCount: existing ? existing.replayCount + 1 : 0,
      });
      return { eventId: id, alreadyProcessed: false };
    },
    async markProcessed(eventId) {
      events.set(eventId, { ...(events.get(eventId) || {}), status: "processed" });
    },
    async markFailed(eventId, error) {
      events.set(eventId, { ...(events.get(eventId) || {}), status: "failed", error: error?.message || String(error) });
    },
  };
}
