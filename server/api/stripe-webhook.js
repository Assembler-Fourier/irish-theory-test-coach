import crypto from "node:crypto";
import {
  getRequiredServerEnv,
  safeErrorSummary,
  sendSafeConfigError,
} from "../../lib/server-env.js";
import { withDb } from "../../lib/db.js";
import { emitOperationalEvent } from "../../lib/monitoring.js";
import {
  applyDisputeEntitlementAction,
  disputeEntitlementAction,
} from "../../lib/dispute-entitlements.js";
import {
  beginStripeEventProcessing,
  findPurchaseByStripeObject,
  markCheckoutAttemptFromSession,
  markStripeEventFailed,
  markStripeEventProcessed,
  revokeEntitlementForReason,
} from "../../lib/payment-ledger.js";
import {
  getCheckoutSessionEmail,
  isPaidCheckoutSession,
  upsertStripeCheckoutEntitlement,
} from "../../lib/stripe-entitlements.js";

const SIGNATURE_TOLERANCE_SECONDS = 300;

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let env;
  try {
    env = getRequiredServerEnv({ requireStripeWebhookSecret: true });
  } catch (error) {
    return sendSafeConfigError(res, error);
  }

  let event;
  try {
    const rawBody = await readRawBody(req);
    event = verifyAndParseStripeEvent(rawBody, req.headers["stripe-signature"], env.stripeWebhookSecret);
  } catch (error) {
    console.error("Stripe webhook signature verification failed", safeErrorSummary(error));
    await emitOperationalEvent("webhook_signature_failure", "warning", {
      provider: "stripe",
      errorCode: error?.code || error?.name || "invalid_signature",
    }, { source: "stripe_webhook" });
    return res.status(400).json({ error: "Invalid webhook payload" });
  }

  try {
    const result = await handleStripeEvent(event, env);
    return res.status(200).json({
      received: true,
      handled: result.handled,
      recorded: result.recorded,
    });
  } catch (error) {
    console.error("Stripe webhook processing failed", safeErrorSummary(error));
    await emitOperationalEvent("webhook_processing_failure", "error", {
      provider: "stripe",
      eventId: event?.id || "",
      eventType: event?.type || "",
      errorCode: error?.code || error?.name || "webhook_processing_failed",
    }, { source: "stripe_webhook" });
    return res.status(500).json({ error: "Webhook processing failed" });
  }
}

export async function handleStripeEvent(event, env, options = {}) {
  if (options.eventStore) {
    return handleStripeEventWithInjectedStore(event, env, options);
  }

  return withDb(env.databaseUrl, async (client) => {
    const eventState = await beginStripeEventProcessing(client, event, {
      forceReplay: options.forceReplay,
      replay: options.replay,
    });
    if (eventState.alreadyProcessed) {
      return { handled: true, recorded: false, duplicate: true, eventId: eventState.eventId };
    }

    await client.query("begin");
    try {
      const result = await processStripeEventObject(client, event, env, options);
      await markStripeEventProcessed(client, eventState.eventId);
      await client.query("commit");
      return { ...result, eventId: eventState.eventId };
    } catch (error) {
      await client.query("rollback").catch(() => {});
      await markStripeEventFailed(client, eventState.eventId, error);
      throw error;
    }
  });
}

async function handleStripeEventWithInjectedStore(event, env, options) {
  const eventState = await options.eventStore.begin(event, options);
  if (eventState.alreadyProcessed) {
    return { handled: true, recorded: false, duplicate: true, eventId: eventState.eventId };
  }

  try {
    const result = await processStripeEventObject(null, event, env, options);
    await options.eventStore.markProcessed(eventState.eventId);
    return { ...result, eventId: eventState.eventId };
  } catch (error) {
    await options.eventStore.markFailed(eventState.eventId, error);
    throw error;
  }
}

async function processStripeEventObject(client, event, env, options = {}) {
  switch (event?.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return processCompletedCheckoutSession(client, event?.data?.object, env, options);

    case "checkout.session.async_payment_failed":
      if (client) {
        await markCheckoutAttemptFromSession(client, event?.data?.object, "async_payment_failed", "payment_failed");
      }
      return { handled: true, recorded: false };

    case "checkout.session.expired":
      if (client) {
        await markCheckoutAttemptFromSession(client, event?.data?.object, "expired", "checkout_expired");
      }
      return { handled: true, recorded: false };

    case "refund.created":
    case "refund.updated":
      if (client) {
        await recordRefundEvent(client, event?.data?.object);
      }
      return { handled: true, recorded: true };

    case "charge.refunded":
      if (client) {
        await recordChargeRefundEvent(client, event?.data?.object);
      }
      return { handled: true, recorded: true };

    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.closed":
    case "charge.dispute.funds_withdrawn":
    case "charge.dispute.funds_reinstated":
      if (client) {
        await recordDisputeEvent(client, event?.data?.object, {
          eventType: event.type,
          eventCreated: event.created,
        });
      }
      return { handled: true, recorded: true };

    case "payment_intent.payment_failed":
      if (client) {
        await markPaymentIntentAttempt(client, event?.data?.object, "payment_failed", "payment_intent_failed");
      }
      return { handled: true, recorded: false };

    default:
      return { handled: false, recorded: false };
  }
}

async function processCompletedCheckoutSession(client, session, env, options = {}) {
  if (!isPaidCheckoutSession(session)) {
    if (client) {
      await markCheckoutAttemptFromSession(client, session, "payment_pending", "not_paid");
    }
    return { handled: true, recorded: false };
  }

  if (!getCheckoutSessionEmail(session)) {
    console.error("Stripe checkout session is missing an email address.");
    return { handled: true, recorded: false };
  }

  if (options.recordCheckoutSession) {
    const recorded = await options.recordCheckoutSession(session, env.databaseUrl);
    if (!recorded) throw new Error("Stripe entitlement recording failed.");
    return { handled: true, recorded };
  }

  await upsertStripeCheckoutEntitlement(client, session, getCheckoutSessionEmail(session));
  return { handled: true, recorded: true };
}

async function markPaymentIntentAttempt(client, paymentIntent, status, reason) {
  const attemptId = cleanUuid(paymentIntent?.metadata?.checkout_attempt_id);
  const paymentIntentId = cleanStripeId(stripeObjectId(paymentIntent), "pi_");
  if (!attemptId && !paymentIntentId) return;
  await client.query(
    `
      update checkout_attempts
      set stripe_payment_intent_id = coalesce($2, stripe_payment_intent_id),
          status = $3,
          failure_reason = $4,
          updated_at = now()
      where ($1::uuid is not null and id = $1::uuid)
         or ($2::text is not null and stripe_payment_intent_id = $2)
    `,
    [attemptId, paymentIntentId, status, reason]
  );
}

async function recordRefundEvent(client, refund) {
  const stripeRefundId = cleanStripeId(stripeObjectId(refund), "re_");
  if (!stripeRefundId) return;
  const paymentIntentId = cleanStripeId(stripeObjectId(refund?.payment_intent), "pi_");
  const chargeId = cleanStripeId(stripeObjectId(refund?.charge), "ch_");
  const purchase = await findPurchaseByStripeObject(client, paymentIntentId || chargeId);
  const email = purchase?.email || "";
  const amount = safeAmount(refund?.amount);
  const status = cleanText(refund?.status, 40) || "recorded";
  const entitlementEffect = refundEntitlementEffect({ amount, status, purchase });

  await client.query(
    `
      insert into payment_refunds (
        purchase_id,
        email,
        amount,
        currency,
        reason,
        stripe_refund_id,
        stripe_charge_id,
        stripe_payment_intent_id,
        status,
        entitlement_effect,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
      on conflict (stripe_refund_id) do update
      set purchase_id = coalesce(excluded.purchase_id, payment_refunds.purchase_id),
          email = coalesce(nullif(excluded.email, ''), payment_refunds.email),
          amount = excluded.amount,
          currency = excluded.currency,
          reason = excluded.reason,
          stripe_charge_id = coalesce(excluded.stripe_charge_id, payment_refunds.stripe_charge_id),
          stripe_payment_intent_id = coalesce(excluded.stripe_payment_intent_id, payment_refunds.stripe_payment_intent_id),
          status = excluded.status,
          entitlement_effect = excluded.entitlement_effect,
          metadata = excluded.metadata,
          updated_at = now()
    `,
    [
      purchase?.id || null,
      email,
      amount,
      cleanText(refund?.currency || purchase?.currency || "eur", 8),
      cleanText(refund?.reason, 120),
      stripeRefundId,
      chargeId || null,
      paymentIntentId || null,
      status,
      entitlementEffect,
      JSON.stringify({ source: "stripe_webhook" }),
    ]
  );

  if (purchase?.id) {
    if (chargeId) {
      await client.query(
        `
          update purchases
          set stripe_charge_id = coalesce(stripe_charge_id, $2),
              updated_at = now()
          where id = $1
        `,
        [purchase.id, chargeId]
      );
    }
    await refreshPurchaseRefundState(client, purchase.id, entitlementEffect);
  }
  if (email && entitlementEffect === "revoke") {
    await revokeEntitlementForReason(client, email, "stripe_refund");
  }
}

async function recordChargeRefundEvent(client, charge) {
  const refunds = Array.isArray(charge?.refunds?.data) ? charge.refunds.data : [];
  for (const refund of refunds) {
    await recordRefundEvent(client, {
      ...refund,
      charge: refund.charge || charge?.id,
      payment_intent: refund.payment_intent || charge?.payment_intent,
      currency: refund.currency || charge?.currency,
    });
  }
}

async function recordDisputeEvent(client, dispute, eventContext = {}) {
  const disputeId = normalizeStripeDisputeId(stripeObjectId(dispute));
  if (!disputeId) return;
  const chargeId = cleanStripeId(stripeObjectId(dispute?.charge), "ch_");
  const paymentIntentId = cleanStripeId(stripeObjectId(dispute?.payment_intent), "pi_");
  const purchase = await findPurchaseByStripeObject(client, paymentIntentId || chargeId);
  const email = purchase?.email || "";
  const status = cleanText(dispute?.status, 40) || "needs_response";
  const entitlementEffect = disputeEntitlementAction(status, eventContext.eventType);
  const eventCreatedAt = stripeEventCreatedAt(eventContext.eventCreated);

  await client.query(
    `
      insert into payment_disputes (
        purchase_id,
        email,
        amount,
        currency,
        stripe_dispute_id,
        stripe_charge_id,
        stripe_payment_intent_id,
        reason,
        status,
        entitlement_effect,
        last_event_type,
        stripe_event_created_at,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
      on conflict (stripe_dispute_id) do update
      set purchase_id = coalesce(excluded.purchase_id, payment_disputes.purchase_id),
          email = coalesce(nullif(excluded.email, ''), payment_disputes.email),
          amount = excluded.amount,
          currency = excluded.currency,
          stripe_charge_id = coalesce(excluded.stripe_charge_id, payment_disputes.stripe_charge_id),
          stripe_payment_intent_id = coalesce(excluded.stripe_payment_intent_id, payment_disputes.stripe_payment_intent_id),
          reason = excluded.reason,
          status = excluded.status,
          entitlement_effect = excluded.entitlement_effect,
          last_event_type = excluded.last_event_type,
          stripe_event_created_at = excluded.stripe_event_created_at,
          metadata = excluded.metadata,
          updated_at = now()
      where payment_disputes.stripe_event_created_at is null
         or excluded.stripe_event_created_at >= payment_disputes.stripe_event_created_at
    `,
    [
      purchase?.id || null,
      email,
      safeAmount(dispute?.amount),
      cleanText(dispute?.currency || purchase?.currency || "eur", 8),
      disputeId,
      chargeId || null,
      paymentIntentId || null,
      cleanText(dispute?.reason, 120),
      status,
      entitlementEffect,
      cleanText(eventContext.eventType, 80),
      eventCreatedAt,
      JSON.stringify({ source: "stripe_webhook", eventType: cleanText(eventContext.eventType, 80) }),
    ]
  );

  const storedResult = await client.query(
    `
      select *
      from payment_disputes
      where stripe_dispute_id = $1
      for update
    `,
    [disputeId]
  );
  const storedDispute = storedResult.rows[0];
  if (!storedDispute) return;

  if (purchase?.id) {
    await client.query(
      `
        update purchases
        set stripe_charge_id = coalesce(stripe_charge_id, $5),
            disputed_amount = $2,
            status = $3,
            entitlement_effect = $4,
            updated_at = now()
        where id = $1
      `,
      [
        purchase.id,
        Number(storedDispute.amount || 0),
        `dispute_${storedDispute.status}`,
        storedDispute.entitlement_effect,
        storedDispute.stripe_charge_id || chargeId || null,
      ]
    );
  }
  await applyDisputeEntitlementAction(client, storedDispute);
}

export function normalizeStripeDisputeId(value) {
  const text = cleanStripeId(value);
  return /^(?:du_|dp_)[A-Za-z0-9_-]+$/.test(text) ? text : "";
}

async function refreshPurchaseRefundState(client, purchaseId, latestEntitlementEffect) {
  const summary = await client.query(
    `
      select coalesce(sum(amount) filter (where status in ('succeeded', 'paid')), 0)::int as refunded_amount
      from payment_refunds
      where purchase_id = $1
    `,
    [purchaseId]
  );
  const refundedAmount = Number(summary.rows[0]?.refunded_amount || 0);
  await client.query(
    `
      update purchases
      set refunded_amount = $2,
          status = case
            when $2 <= 0 then status
            when $2 >= amount then 'refunded'
            else 'partially_refunded'
          end,
          entitlement_effect = $3,
          updated_at = now()
      where id = $1
    `,
    [purchaseId, refundedAmount, latestEntitlementEffect]
  );
}

export function verifyAndParseStripeEvent(rawBody, signatureHeader, webhookSecret) {
  verifyStripeSignature(rawBody, signatureHeader, webhookSecret);
  return JSON.parse(rawBody);
}

export function verifyStripeSignature(rawBody, signatureHeader, webhookSecret) {
  if (!signatureHeader || !webhookSecret) {
    throw new Error("Missing Stripe webhook signature.");
  }

  const parsed = parseStripeSignatureHeader(signatureHeader);
  const timestamp = Number(parsed.t?.[0]);
  const signatures = parsed.v1 || [];

  if (!Number.isFinite(timestamp) || signatures.length === 0) {
    throw new Error("Malformed Stripe webhook signature.");
  }

  const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (age > SIGNATURE_TOLERANCE_SECONDS) {
    throw new Error("Expired Stripe webhook signature.");
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(signedPayload, "utf8")
    .digest("hex");

  const valid = signatures.some((signature) => timingSafeEqualHex(signature, expected));
  if (!valid) {
    throw new Error("Invalid Stripe webhook signature.");
  }
}

async function readRawBody(req) {
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  if (req.body && typeof req.body === "object") return JSON.stringify(req.body);

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseStripeSignatureHeader(header) {
  return String(header)
    .split(",")
    .map((part) => part.split("="))
    .reduce((result, [key, value]) => {
      if (!key || !value) return result;
      const name = key.trim();
      result[name] ||= [];
      result[name].push(value.trim());
      return result;
    }, {});
}

function timingSafeEqualHex(left, right) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function refundEntitlementEffect({ amount, status, purchase }) {
  if (!purchase || !["succeeded", "paid"].includes(status)) return "none";
  if (amount >= Number(purchase.amount || 0)) return "revoke";
  if (amount > 0) return "record_only_partial_refund";
  return "none";
}

function safeAmount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function stripeEventCreatedAt(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000).toISOString()
    : new Date().toISOString();
}

function cleanStripeId(value, prefix = "") {
  const text = String(value || "").replace(/[^\w:-]/g, "").slice(0, 120);
  if (!text) return "";
  return prefix && !text.startsWith(prefix) ? "" : text;
}

function stripeObjectId(value) {
  if (typeof value === "string") return value;
  if (value && typeof value.id === "string") return value.id;
  return "";
}

function cleanUuid(value) {
  const text = String(value || "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
