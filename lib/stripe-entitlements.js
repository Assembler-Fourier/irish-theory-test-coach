import { withTransaction } from "./db.js";
import { recordReferralPurchase } from "./referrals.js";
import { safeErrorSummary } from "./server-env.js";
import { DEFAULT_ENTITLEMENT_DAYS, PRODUCT_KEY } from "../shared/pricing-config.js";

const PRODUCT = PRODUCT_KEY;

export function isPaidCheckoutSession(session) {
  return session?.object === "checkout.session" &&
    session.status === "complete" &&
    session.payment_status === "paid";
}

export function getCheckoutSessionEmail(session) {
  const email = session?.customer_details?.email || session?.customer_email || "";
  return String(email).trim().toLowerCase();
}

export async function recordStripeCheckoutSession(session, databaseUrl) {
  const email = getCheckoutSessionEmail(session);
  if (!email) return false;

  try {
    await withTransaction(databaseUrl, (client) => upsertStripeCheckoutEntitlement(client, session, email));
    return true;
  } catch (error) {
    console.error("Could not record Stripe purchase", safeErrorSummary(error));
    return false;
  }
}

export async function upsertStripeCheckoutEntitlement(client, session, email) {
  const sessionId = getStripeObjectId(session);
  const paymentIntentId = getStripeObjectId(session?.payment_intent);
  const customerId = getStripeObjectId(session?.customer);
  const amount = Number.isInteger(session?.amount_total) ? session.amount_total : 0;
  const currency = String(session?.currency || "eur").toLowerCase();
  const status = String(session?.payment_status || "paid");
  const planKey = cleanMetadataValue(session?.metadata?.plan_key);
  const stripePriceId = getLineItemPriceId(session);
  const referralCode = cleanMetadataValue(session?.metadata?.referral_code);
  const entitlementDays = Number(session?.metadata?.entitlement_days || DEFAULT_ENTITLEMENT_DAYS);
  const expiresAt = new Date(Date.now() + Math.max(1, entitlementDays) * 24 * 60 * 60 * 1000).toISOString();

  if (!sessionId?.startsWith("cs_")) {
    throw new Error("Missing Stripe Checkout session ID.");
  }

  await client.query(
    `
      insert into users (email)
      values ($1)
      on conflict (email) do nothing
    `,
    [email]
  );

  const existing = await client.query(
    `
      select id
      from purchases
      where stripe_checkout_session_id = $1
         or ($2::text is not null and stripe_payment_intent_id = $2)
      limit 1
    `,
    [sessionId, paymentIntentId]
  );

  if (existing.rows[0]) {
    await client.query(
      `
        update purchases
        set email = $1,
            stripe_checkout_session_id = coalesce($2, stripe_checkout_session_id),
            stripe_customer_id = coalesce($3, stripe_customer_id),
            stripe_payment_intent_id = coalesce($4, stripe_payment_intent_id),
            amount = $5,
            currency = $6,
            status = $7,
            plan_key = coalesce($8, plan_key),
            stripe_price_id = coalesce($9, stripe_price_id),
            referral_code = coalesce($10, referral_code)
        where id = $11
      `,
      [
        email,
        sessionId,
        customerId,
        paymentIntentId,
        amount,
        currency,
        status,
        planKey,
        stripePriceId,
        referralCode,
        existing.rows[0].id,
      ]
    );
  } else {
    await client.query(
      `
        insert into purchases (
          email,
          stripe_checkout_session_id,
          stripe_customer_id,
          stripe_payment_intent_id,
          amount,
          currency,
          status,
          plan_key,
          stripe_price_id,
          referral_code
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [email, sessionId, customerId, paymentIntentId, amount, currency, status, planKey, stripePriceId, referralCode]
    );
  }

  await client.query(
    `
      insert into entitlements (email, product, active, source, expires_at)
      values ($1, $2, true, 'stripe', $3)
      on conflict (email, product) do update
      set active = true,
          source = 'stripe',
          expires_at = greatest(coalesce(entitlements.expires_at, $3), $3),
          revoked_at = null,
          updated_at = now()
    `,
    [email, PRODUCT, expiresAt]
  );

  await recordReferralPurchase(client, session, email);
}

function getStripeObjectId(value) {
  if (typeof value === "string") return value;
  if (value && typeof value.id === "string") return value.id;
  return null;
}

function cleanMetadataValue(value) {
  return String(value || "").replace(/[^\w:-]/g, "").slice(0, 120) || null;
}

function getLineItemPriceId(session) {
  const lineItem = session?.line_items?.data?.[0];
  return getStripeObjectId(lineItem?.price);
}
