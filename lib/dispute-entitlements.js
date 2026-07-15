const PRODUCT = "irish-theory-test-coach";
const RESTORING_STATUSES = new Set(["won", "warning_closed"]);

export function disputeEntitlementAction(status, eventType = "") {
  if (eventType === "charge.dispute.funds_reinstated") return "restore";
  if (eventType === "charge.dispute.funds_withdrawn") return "revoke";
  return RESTORING_STATUSES.has(String(status || "").toLowerCase()) ? "restore" : "revoke";
}

export async function applyDisputeEntitlementAction(client, disputeRow) {
  if (!disputeRow?.stripe_dispute_id || !disputeRow?.email) {
    return { action: "none", changed: false, reason: "missing_purchase_or_email" };
  }
  const action = disputeRow.entitlement_effect === "restore" ? "restore" : "revoke";
  return action === "restore"
    ? restoreDisputeEntitlement(client, disputeRow)
    : revokeForDispute(client, disputeRow);
}

async function revokeForDispute(client, dispute) {
  const entitlementResult = await client.query(
    `
      select id, active, source, expires_at, revoked_at
      from entitlements
      where lower(email) = lower($1)
        and product = $2
      for update
    `,
    [dispute.email, PRODUCT]
  );
  const entitlement = entitlementResult.rows[0];
  if (!entitlement || !entitlement.active || entitlement.revoked_at) {
    return { action: "revoke", changed: false, reason: "no_active_entitlement" };
  }
  if (entitlement.expires_at && new Date(entitlement.expires_at).getTime() <= Date.now()) {
    return { action: "revoke", changed: false, reason: "entitlement_expired" };
  }

  const snapshot = await client.query(
    `
      update payment_disputes
      set revoked_entitlement_id = $2,
          revoked_entitlement_active = $3,
          revoked_entitlement_source = $4,
          revoked_entitlement_expires_at = $5,
          revocation_applied_at = now(),
          restoration_applied_at = null,
          updated_at = now()
      where stripe_dispute_id = $1
        and revocation_applied_at is null
      returning revocation_applied_at
    `,
    [
      dispute.stripe_dispute_id,
      entitlement.id,
      Boolean(entitlement.active),
      entitlement.source,
      entitlement.expires_at,
    ]
  );
  if (!snapshot.rowCount) {
    return { action: "revoke", changed: false, reason: "already_applied" };
  }

  const revoked = await client.query(
    `
      update entitlements
      set active = false,
          revoked_at = now(),
          revoked_reason = 'stripe_dispute',
          revoked_by_dispute_id = $2,
          source = 'stripe_dispute',
          updated_at = now()
      where id = $1
        and active = true
        and revoked_at is null
      returning id
    `,
    [entitlement.id, dispute.stripe_dispute_id]
  );
  return { action: "revoke", changed: revoked.rowCount === 1, reason: revoked.rowCount ? "applied" : "state_changed" };
}

async function restoreDisputeEntitlement(client, dispute) {
  const stateResult = await client.query(
    `
      select id, purchase_id, email, stripe_dispute_id,
             revoked_entitlement_id, revoked_entitlement_active,
             revoked_entitlement_source, revoked_entitlement_expires_at,
             revocation_applied_at, restoration_applied_at
      from payment_disputes
      where stripe_dispute_id = $1
      for update
    `,
    [dispute.stripe_dispute_id]
  );
  const state = stateResult.rows[0];
  if (!state?.revocation_applied_at || state.restoration_applied_at || !state.revoked_entitlement_active) {
    return { action: "restore", changed: false, reason: "no_reversible_revocation" };
  }

  const blockers = await client.query(
    `
      select
        exists (
          select 1
          from payment_refunds
          where purchase_id = $1
            and entitlement_effect = 'revoke'
            and status in ('succeeded', 'paid')
        ) as has_full_refund,
        exists (
          select 1
          from payment_disputes
          where purchase_id = $1
            and stripe_dispute_id <> $2
            and revocation_applied_at is not null
            and restoration_applied_at is null
            and status not in ('won', 'warning_closed')
        ) as has_other_open_dispute
    `,
    [state.purchase_id, state.stripe_dispute_id]
  );
  if (blockers.rows[0]?.has_full_refund) {
    return { action: "restore", changed: false, reason: "full_refund_blocks_restore" };
  }
  if (blockers.rows[0]?.has_other_open_dispute) {
    return { action: "restore", changed: false, reason: "other_dispute_blocks_restore" };
  }

  const restored = await client.query(
    `
      update entitlements
      set active = true,
          source = coalesce($4, 'stripe'),
          expires_at = case
            when $5::timestamptz is null then null
            else $5::timestamptz + greatest(now() - $6::timestamptz, interval '0 seconds')
          end,
          revoked_at = null,
          revoked_reason = null,
          revoked_by_dispute_id = null,
          updated_at = now()
      where id = $1
        and lower(email) = lower($2)
        and product = $3
        and active = false
        and revoked_at is not null
        and revoked_reason = 'stripe_dispute'
        and revoked_by_dispute_id = $7
        and ($5::timestamptz is null or $5::timestamptz > $6::timestamptz)
      returning id
    `,
    [
      state.revoked_entitlement_id,
      state.email,
      PRODUCT,
      state.revoked_entitlement_source,
      state.revoked_entitlement_expires_at,
      state.revocation_applied_at,
      state.stripe_dispute_id,
    ]
  );
  if (!restored.rowCount) {
    return { action: "restore", changed: false, reason: "entitlement_no_longer_reversible" };
  }

  await client.query(
    `
      update payment_disputes
      set restoration_applied_at = now(),
          updated_at = now()
      where stripe_dispute_id = $1
        and restoration_applied_at is null
    `,
    [state.stripe_dispute_id]
  );
  return { action: "restore", changed: true, reason: "applied" };
}
