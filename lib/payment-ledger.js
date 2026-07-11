import { withDb, withTransaction } from "./db.js";
import { normalizeEmail } from "./auth.js";

export async function createCheckoutAttempt(databaseUrl, input) {
  return withDb(databaseUrl, async (client) => {
    const result = await client.query(
      `
        insert into checkout_attempts (
          requested_plan_key,
          resolved_plan_key,
          user_id,
          email,
          anonymous_id,
          referral_code,
          environment,
          stripe_mode,
          status,
          metadata
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, 'created', $9::jsonb)
        returning id, created_at
      `,
      [
        cleanKey(input.requestedPlanKey),
        cleanKey(input.resolvedPlanKey),
        input.userId || null,
        normalizeEmail(input.email),
        cleanText(input.anonymousId, 160),
        cleanCode(input.referralCode),
        cleanText(input.environment, 40) || "local",
        cleanText(input.stripeMode, 20),
        JSON.stringify(input.metadata || {}),
      ]
    );
    return result.rows[0];
  });
}

export async function markCheckoutAttemptStripeSession(databaseUrl, attemptId, session) {
  return withDb(databaseUrl, (client) => markCheckoutAttemptStripeSessionWithClient(client, attemptId, session));
}

export async function markCheckoutAttemptStripeSessionWithClient(client, attemptId, session) {
  await client.query(
    `
      update checkout_attempts
      set stripe_checkout_session_id = $2,
          stripe_payment_intent_id = coalesce($3, stripe_payment_intent_id),
          status = 'stripe_session_created',
          failure_reason = null,
          updated_at = now()
      where id = $1
    `,
    [attemptId, objectId(session?.id || session), objectId(session?.payment_intent)]
  );
}

export async function markCheckoutAttemptFailure(databaseUrl, attemptId, status, reason) {
  if (!attemptId) return;
  return withDb(databaseUrl, async (client) => {
    await client.query(
      `
        update checkout_attempts
        set status = $2,
            failure_reason = $3,
            updated_at = now()
        where id = $1
      `,
      [attemptId, cleanText(status, 80), cleanText(reason, 240)]
    );
  });
}

export async function markCheckoutAttemptFromSession(client, session, status, reason = "") {
  const attemptId = cleanUuid(session?.metadata?.checkout_attempt_id || session?.client_reference_id);
  const sessionId = objectId(session?.id || session);
  const paymentIntentId = objectId(session?.payment_intent);
  if (!attemptId && !sessionId) return;

  await client.query(
    `
      update checkout_attempts
      set stripe_checkout_session_id = coalesce($2, stripe_checkout_session_id),
          stripe_payment_intent_id = coalesce($3, stripe_payment_intent_id),
          status = $4,
          failure_reason = nullif($5, ''),
          updated_at = now()
      where ($1::uuid is not null and id = $1::uuid)
         or ($2::text is not null and stripe_checkout_session_id = $2)
    `,
    [attemptId, sessionId, paymentIntentId, cleanText(status, 80), cleanText(reason, 240)]
  );
}

export async function getCheckoutFulfillmentStatus(databaseUrl, sessionId) {
  return withDb(databaseUrl, async (client) => {
    const result = await client.query(
      `
        select p.email,
               p.status as purchase_status,
               p.plan_key,
               e.active as entitlement_active,
               e.expires_at,
               e.revoked_at,
               ca.status as attempt_status
        from purchases p
        left join entitlements e
          on lower(e.email) = lower(p.email)
         and e.product = 'irish-theory-test-coach'
        left join checkout_attempts ca
          on ca.id = p.checkout_attempt_id
        where p.stripe_checkout_session_id = $1
        order by p.created_at desc
        limit 1
      `,
      [sessionId]
    );

    const row = result.rows[0];
    if (!row) {
      await client.query(
        `
          update checkout_attempts
          set status = case when status = 'stripe_session_created' then 'return_seen' else status end,
              updated_at = now()
          where stripe_checkout_session_id = $1
        `,
        [sessionId]
      );
      return { fulfilled: false, email: "", status: "pending" };
    }

    const active = Boolean(row.entitlement_active) &&
      !row.revoked_at &&
      (!row.expires_at || new Date(row.expires_at).getTime() > Date.now());

    return {
      fulfilled: active,
      email: normalizeEmail(row.email),
      planKey: row.plan_key || "",
      status: active ? "fulfilled" : row.purchase_status || "recorded",
      expiresAt: row.expires_at || null,
    };
  });
}

export async function beginStripeEventProcessing(client, event, options = {}) {
  const eventId = cleanStripeId(event?.id, "evt_");
  if (!eventId) throw new Error("Stripe event is missing an event ID.");

  const result = await client.query(
    `
      insert into stripe_events (
        stripe_event_id,
        type,
        livemode,
        api_version,
        payload,
        processing_status,
        replay_count
      )
      values ($1, $2, $3, $4, $5::jsonb, 'processing', $6)
      on conflict (stripe_event_id) do update
      set last_received_at = now(),
          replay_count = stripe_events.replay_count + $6,
          processing_status = case
            when $7::boolean then 'processing'
            else stripe_events.processing_status
          end
      returning processing_status, processed_at
    `,
    [
      eventId,
      cleanText(event?.type, 120),
      typeof event?.livemode === "boolean" ? event.livemode : null,
      cleanText(event?.api_version, 40),
      JSON.stringify(event || {}),
      options.replay ? 1 : 0,
      Boolean(options.forceReplay),
    ]
  );

  const row = result.rows[0];
  return {
    eventId,
    alreadyProcessed: row?.processing_status === "processed" && !options.forceReplay,
  };
}

export async function markStripeEventProcessed(client, eventId) {
  await client.query(
    `
      update stripe_events
      set processing_status = 'processed',
          failure_reason = null,
          processed_at = now(),
          last_received_at = now()
      where stripe_event_id = $1
    `,
    [eventId]
  );
}

export async function markStripeEventFailed(client, eventId, error) {
  await client.query(
    `
      update stripe_events
      set processing_status = 'failed',
          failure_reason = $2,
          last_received_at = now()
      where stripe_event_id = $1
    `,
    [eventId, cleanText(error?.message || error, 500)]
  );
}

export async function getPaymentReconciliation(databaseUrl) {
  return withDb(databaseUrl, async (client) => {
    const attempts = await client.query(`
        select id, requested_plan_key, resolved_plan_key, email, anonymous_id, referral_code,
               environment, stripe_checkout_session_id, status, failure_reason, created_at, updated_at
        from checkout_attempts
        order by created_at desc
        limit 100
      `);
    const events = await client.query(`
        select stripe_event_id, type, processing_status, failure_reason, replay_count,
               first_received_at, last_received_at, processed_at
        from stripe_events
        order by last_received_at desc
        limit 100
      `);
    const refunds = await client.query(`
        select email, amount, currency, reason, stripe_refund_id, status,
               entitlement_effect, user_notification, created_at
        from payment_refunds
        order by created_at desc
        limit 100
      `);
    const disputes = await client.query(`
        select email, amount, currency, stripe_dispute_id, status, reason,
               entitlement_effect, created_at
        from payment_disputes
        order by created_at desc
        limit 100
      `);
    const codes = await client.query(`
        select code, purchase_email, plan_key, status, redemption_count, max_redemptions,
               expires_at, redeemed_by_email, created_at, updated_at
        from instructor_codes
        order by created_at desc
        limit 250
      `);

    return {
      attempts: attempts.rows,
      events: events.rows,
      refunds: refunds.rows,
      disputes: disputes.rows,
      instructorCodes: codes.rows,
    };
  });
}

export async function recordManualRefund(databaseUrl, input) {
  return withTransaction(databaseUrl, async (client) => {
    const purchase = await findPurchaseByStripeObject(client, input.stripeObject || "", input.email || "");
    const email = normalizeEmail(input.email || purchase?.email);
    const amount = Number.isFinite(Number(input.amount)) ? Math.max(0, Math.round(Number(input.amount))) : 0;
    const entitlementEffect = cleanText(input.entitlementEffect, 40) || "none";

    await client.query(
      `
        insert into payment_refunds (
          purchase_id,
          email,
          amount,
          currency,
          reason,
          actor_user_id,
          actor_email,
          stripe_refund_id,
          stripe_charge_id,
          stripe_payment_intent_id,
          status,
          entitlement_effect,
          user_notification,
          metadata
        )
        values ($1, $2, $3, $4, $5, $6, $7, nullif($8, ''), nullif($9, ''), nullif($10, ''), $11, $12, $13, $14::jsonb)
      `,
      [
        purchase?.id || null,
        email,
        amount,
        cleanText(input.currency, 8) || purchase?.currency || "eur",
        cleanText(input.reason, 240),
        input.actorUserId || null,
        normalizeEmail(input.actorEmail),
        cleanStripeId(input.stripeRefundId, "re_") || "",
        cleanStripeId(input.stripeChargeId, "ch_") || "",
        cleanStripeId(input.stripePaymentIntentId || purchase?.stripe_payment_intent_id, "pi_") || "",
        cleanText(input.status, 40) || "recorded",
        entitlementEffect,
        cleanText(input.userNotification, 80) || "not_sent",
        JSON.stringify({ source: "admin_manual_reconciliation" }),
      ]
    );

    if (email && entitlementEffect === "revoke") {
      await revokeEntitlementForReason(client, email, "manual_refund");
    }

    return { ok: true };
  });
}

export async function revokeEntitlementForReason(client, email, reason) {
  await client.query(
    `
      update entitlements
      set active = false,
          revoked_at = now(),
          source = $2,
          updated_at = now()
      where lower(email) = lower($1)
        and product = 'irish-theory-test-coach'
    `,
    [normalizeEmail(email), cleanText(reason, 40)]
  );
}

export async function findPurchaseByStripeObject(client, stripeObjectId, email = "") {
  const value = String(stripeObjectId || "");
  const result = await client.query(
    `
      select *
      from purchases
      where ($1::text <> '' and (
              stripe_checkout_session_id = $1
           or stripe_payment_intent_id = $1
           or stripe_charge_id = $1
          ))
         or ($2::text <> '' and lower(email) = lower($2))
      order by created_at desc
      limit 1
    `,
    [value, normalizeEmail(email)]
  );
  return result.rows[0] || null;
}

function objectId(value) {
  if (typeof value === "string") return value;
  if (value && typeof value.id === "string") return value.id;
  return null;
}

function cleanUuid(value) {
  const text = String(value || "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

function cleanKey(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

function cleanCode(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").toUpperCase().slice(0, 80);
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanStripeId(value, prefix = "") {
  const text = String(value || "").replace(/[^\w:-]/g, "").slice(0, 120);
  if (!text) return "";
  return prefix && !text.startsWith(prefix) ? "" : text;
}
