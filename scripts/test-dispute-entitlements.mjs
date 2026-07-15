import assert from "node:assert/strict";
import {
  applyDisputeEntitlementAction,
  disputeEntitlementAction,
} from "../lib/dispute-entitlements.js";

assert.equal(disputeEntitlementAction("needs_response", "charge.dispute.created"), "revoke");
assert.equal(disputeEntitlementAction("lost", "charge.dispute.closed"), "revoke");
assert.equal(disputeEntitlementAction("won", "charge.dispute.closed"), "restore");
assert.equal(disputeEntitlementAction("warning_closed", "charge.dispute.updated"), "restore");
assert.equal(disputeEntitlementAction("under_review", "charge.dispute.funds_withdrawn"), "revoke");
assert.equal(disputeEntitlementAction("under_review", "charge.dispute.funds_reinstated"), "restore");

const state = createState();
const client = createClient(state);
const dispute = state.dispute;

const opened = await applyDisputeEntitlementAction(client, dispute);
assert.deepEqual(opened, { action: "revoke", changed: true, reason: "applied" });
assert.equal(state.entitlement.active, false);
assert.equal(state.entitlement.revoked_by_dispute_id, dispute.stripe_dispute_id);

const duplicate = await applyDisputeEntitlementAction(client, dispute);
assert.equal(duplicate.changed, false);
assert.equal(duplicate.reason, "no_active_entitlement");

dispute.status = "won";
dispute.entitlement_effect = "restore";
const restored = await applyDisputeEntitlementAction(client, dispute);
assert.deepEqual(restored, { action: "restore", changed: true, reason: "applied" });
assert.equal(state.entitlement.active, true);
assert.equal(state.entitlement.revoked_at, null);
assert.equal(state.entitlement.revoked_by_dispute_id, null);

const restoredAgain = await applyDisputeEntitlementAction(client, dispute);
assert.equal(restoredAgain.changed, false);
assert.equal(restoredAgain.reason, "no_reversible_revocation");

const refundBlocked = createState();
const refundClient = createClient(refundBlocked);
await applyDisputeEntitlementAction(refundClient, refundBlocked.dispute);
refundBlocked.dispute.entitlement_effect = "restore";
refundBlocked.hasFullRefund = true;
const noRefundRestore = await applyDisputeEntitlementAction(refundClient, refundBlocked.dispute);
assert.equal(noRefundRestore.reason, "full_refund_blocks_restore");
assert.equal(refundBlocked.entitlement.active, false);

const manualBlocked = createState();
const manualClient = createClient(manualBlocked);
await applyDisputeEntitlementAction(manualClient, manualBlocked.dispute);
manualBlocked.dispute.entitlement_effect = "restore";
manualBlocked.entitlement.revoked_reason = "manual_refund";
manualBlocked.entitlement.revoked_by_dispute_id = null;
const noManualRestore = await applyDisputeEntitlementAction(manualClient, manualBlocked.dispute);
assert.equal(noManualRestore.reason, "entitlement_no_longer_reversible");

const lost = createState();
lost.dispute.status = "lost";
lost.dispute.entitlement_effect = disputeEntitlementAction("lost", "charge.dispute.closed");
await applyDisputeEntitlementAction(createClient(lost), lost.dispute);
assert.equal(lost.entitlement.active, false, "lost dispute remains revoked");

console.log("Dispute entitlement transition tests passed.");

function createState() {
  const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
  return {
    hasFullRefund: false,
    hasOtherOpenDispute: false,
    entitlement: {
      id: "11111111-1111-4111-8111-111111111111",
      email: "learner@example.test",
      active: true,
      source: "stripe",
      expires_at: expiresAt,
      revoked_at: null,
      revoked_reason: null,
      revoked_by_dispute_id: null,
    },
    dispute: {
      id: "22222222-2222-4222-8222-222222222222",
      purchase_id: "33333333-3333-4333-8333-333333333333",
      email: "learner@example.test",
      stripe_dispute_id: "dp_test_redacted",
      status: "needs_response",
      entitlement_effect: "revoke",
      revoked_entitlement_id: null,
      revoked_entitlement_active: null,
      revoked_entitlement_source: null,
      revoked_entitlement_expires_at: null,
      revocation_applied_at: null,
      restoration_applied_at: null,
    },
  };
}

function createClient(state) {
  return {
    async query(sql, params = []) {
      const query = sql.replace(/\s+/g, " ").trim().toLowerCase();
      if (query.startsWith("select id, active, source, expires_at, revoked_at from entitlements")) {
        return { rows: [{ ...state.entitlement }], rowCount: 1 };
      }
      if (query.startsWith("update payment_disputes") && query.includes("revoked_entitlement_id")) {
        if (state.dispute.revocation_applied_at) return { rows: [], rowCount: 0 };
        state.dispute.revoked_entitlement_id = params[1];
        state.dispute.revoked_entitlement_active = params[2];
        state.dispute.revoked_entitlement_source = params[3];
        state.dispute.revoked_entitlement_expires_at = params[4];
        state.dispute.revocation_applied_at = new Date().toISOString();
        state.dispute.restoration_applied_at = null;
        return { rows: [{ revocation_applied_at: state.dispute.revocation_applied_at }], rowCount: 1 };
      }
      if (query.startsWith("update entitlements") && query.includes("set active = false")) {
        if (!state.entitlement.active || state.entitlement.revoked_at) return { rows: [], rowCount: 0 };
        state.entitlement.active = false;
        state.entitlement.revoked_at = new Date().toISOString();
        state.entitlement.revoked_reason = "stripe_dispute";
        state.entitlement.revoked_by_dispute_id = params[1];
        state.entitlement.source = "stripe_dispute";
        return { rows: [{ id: state.entitlement.id }], rowCount: 1 };
      }
      if (query.startsWith("select id, purchase_id, email, stripe_dispute_id,")) {
        return { rows: [{ ...state.dispute }], rowCount: 1 };
      }
      if (query.startsWith("select exists (")) {
        return { rows: [{ has_full_refund: state.hasFullRefund, has_other_open_dispute: state.hasOtherOpenDispute }], rowCount: 1 };
      }
      if (query.startsWith("update entitlements") && query.includes("revoked_by_dispute_id = null")) {
        const reversible = !state.entitlement.active &&
          state.entitlement.revoked_reason === "stripe_dispute" &&
          state.entitlement.revoked_by_dispute_id === params[6];
        if (!reversible) return { rows: [], rowCount: 0 };
        state.entitlement.active = true;
        state.entitlement.source = params[3] || "stripe";
        state.entitlement.revoked_at = null;
        state.entitlement.revoked_reason = null;
        state.entitlement.revoked_by_dispute_id = null;
        return { rows: [{ id: state.entitlement.id }], rowCount: 1 };
      }
      if (query.startsWith("update payment_disputes") && query.includes("restoration_applied_at = now()")) {
        state.dispute.restoration_applied_at = new Date().toISOString();
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL in dispute test: ${query.slice(0, 160)}`);
    },
  };
}
