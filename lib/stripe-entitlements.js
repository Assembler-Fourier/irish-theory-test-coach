import { withTransaction } from "./db.js";
import { generateInstructorCodesForPurchase } from "./instructor-codes.js";
import { markCheckoutAttemptFromSession } from "./payment-ledger.js";
import { recordReferralPurchase } from "./referrals.js";
import { safeErrorSummary } from "./server-env.js";
import {
  DEFAULT_ENTITLEMENT_DAYS,
  PRODUCT_KEY,
  getPricingPlan,
} from "../shared/pricing-config.js";

const PRODUCT = PRODUCT_KEY;

export function isPaidCheckoutSession(session) {
  return session?.object === "checkout.session" &&
    session.status === "complete" &&
    session.payment_status === "paid";
}

export function isAsyncPaymentFailedCheckoutSession(session) {
  return session?.object === "checkout.session" &&
    session.payment_status === "unpaid" &&
    session.status === "complete";
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
  const plan = getPricingPlan(planKey) || getPricingPlan("full_study_pass");
  const stripePriceId = getLineItemPriceId(session);
  const referralCode = cleanMetadataValue(session?.metadata?.referral_code);
  const checkoutAttemptId = cleanUuid(session?.metadata?.checkout_attempt_id || session?.client_reference_id);
  const policyVersions = policyVersionsFromMetadata(session?.metadata || {});
  const entitlementDays = Math.max(
    1,
    Number(session?.metadata?.entitlement_days || plan?.entitlementDays || DEFAULT_ENTITLEMENT_DAYS)
  );
  const environment = cleanMetadataValue(session?.metadata?.environment);

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
            referral_code = coalesce($10, referral_code),
            checkout_attempt_id = coalesce($11::uuid, checkout_attempt_id),
            environment = coalesce($12, environment),
            policy_versions = case when $13::jsonb = '{}'::jsonb then policy_versions else $13::jsonb end,
            updated_at = now()
        where id = $14
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
        checkoutAttemptId,
        environment,
        JSON.stringify(policyVersions),
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
          referral_code,
          checkout_attempt_id,
          environment,
          policy_versions
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::uuid, $12, $13::jsonb)
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
        checkoutAttemptId,
        environment,
        JSON.stringify(policyVersions),
      ]
    );
  }

  const purchaseResult = await client.query(
    `
      select *
      from purchases
      where stripe_checkout_session_id = $1
         or ($2::text is not null and stripe_payment_intent_id = $2)
      order by created_at desc
      limit 1
    `,
    [sessionId, paymentIntentId]
  );
  const purchase = purchaseResult.rows[0];

  await markCheckoutAttemptFromSession(client, session, "fulfilled");

  if (plan?.kind === "instructor") {
    const existingCodes = await client.query(
      `
        select count(*)::int as code_count
        from instructor_codes
        where purchase_id = $1
      `,
      [purchase.id]
    );
    if (Number(existingCodes.rows[0]?.code_count || 0) === 0) {
      await generateInstructorCodesForPurchase(client, purchase, plan);
    }
  } else {
    await grantStripeEntitlement(client, email, entitlementDays);
  }

  await recordReferralPurchase(client, session, email, purchase?.id);
}

export async function grantStripeEntitlement(client, email, entitlementDays) {
  await client.query(
    `
      insert into entitlements (email, product, active, source, expires_at)
      values ($1, $2, true, 'stripe', now() + ($3::int * interval '1 day'))
      on conflict (email, product) do update
      set active = true,
          source = 'stripe',
          expires_at = case
            when entitlements.active = true
             and entitlements.expires_at is null
             and entitlements.source in ('manual', 'complimentary')
              then null
            else greatest(coalesce(entitlements.expires_at, now()), now()) + ($3::int * interval '1 day')
          end,
          revoked_at = null,
          updated_at = now()
    `,
    [email, PRODUCT, entitlementDays]
  );
}

function getStripeObjectId(value) {
  if (typeof value === "string") return value;
  if (value && typeof value.id === "string") return value.id;
  return null;
}

function cleanMetadataValue(value) {
  return String(value || "").replace(/[^\w:-]/g, "").slice(0, 120) || null;
}

function cleanUuid(value) {
  const text = String(value || "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

function getLineItemPriceId(session) {
  const lineItem = session?.line_items?.data?.[0];
  return getStripeObjectId(lineItem?.price);
}

function policyVersionsFromMetadata(metadata) {
  const versions = {
    privacy: cleanMetadataValue(metadata.policy_version_privacy),
    terms: cleanMetadataValue(metadata.policy_version_terms),
    refunds: cleanMetadataValue(metadata.policy_version_refunds),
    accessibility: cleanMetadataValue(metadata.policy_version_accessibility),
    contentMethodology: cleanMetadataValue(metadata.policy_version_content_methodology),
    effectiveDate: cleanMetadataValue(metadata.policy_effective_date),
    legalReviewRequired: cleanMetadataValue(metadata.legal_review_required),
  };
  return Object.fromEntries(Object.entries(versions).filter(([, value]) => value));
}
