import { normalizeEmail, isValidEmail } from "./auth.js";
import { withDb, withTransaction } from "./db.js";
import { safeErrorSummary } from "./server-env.js";
import { PRODUCT_KEY, resolveCheckoutPlan } from "../shared/pricing-config.js";

export function normalizeReferralCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 40);
}

export async function lookupReferralCode(databaseUrl, rawCode) {
  const code = normalizeReferralCode(rawCode);
  if (!code) return null;

  return withDb(databaseUrl, async (client) => {
    const result = await client.query(
      `
        select code,
               description,
               discount_percent,
               fixed_price_plan,
               commission_note,
               max_redemptions,
               expires_at,
               entitlement_duration_days,
               grant_entitlement,
               allowed_plan_keys,
               active,
               ia.email as instructor_email,
               (
                 select count(*)::int
                 from referral_redemptions rr
                 where rr.code = referral_codes.code
                   and rr.status in ('applied', 'checkout_started', 'purchased', 'granted')
               ) as redemption_count
        from referral_codes
        left join instructor_accounts ia
          on ia.id = referral_codes.instructor_account_id
        where code = $1
        limit 1
      `,
      [code]
    );

    const referral = result.rows[0];
    if (!referral || !isReferralUsable(referral)) return null;
    return normalizeReferralRow(referral);
  });
}

export async function applyReferralCodeToCheckoutPlan(databaseUrl, rawCode, requestedPlan, context = {}) {
  const referral = await lookupReferralCode(databaseUrl, rawCode);
  if (!referral) {
    const error = new Error("Referral code is not available.");
    error.code = "REFERRAL_INVALID";
    throw error;
  }

  if (referral.allowedPlanKeys.length && !referral.allowedPlanKeys.includes(requestedPlan.key)) {
    const error = new Error("Referral code is not available for this plan.");
    error.code = "REFERRAL_PLAN_RESTRICTED";
    throw error;
  }

  if (context.email && referral.instructorEmail && normalizeEmail(context.email) === referral.instructorEmail) {
    const error = new Error("Referral code cannot be used by this account.");
    error.code = "REFERRAL_SELF_USE";
    throw error;
  }

  const planKey = referral.fixedPricePlan || requestedPlan.key;
  const plan = resolveCheckoutPlan(planKey, process.env);
  await recordReferralRedemption(databaseUrl, referral.code, {
    anonymousId: context.anonymousId,
    email: context.email,
    status: "checkout_started",
    planKey: plan.key,
  });
  return { referral, plan };
}

export async function grantReferralEntitlement(databaseUrl, rawCode, email, context = {}) {
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    const error = new Error("Invalid email address.");
    error.code = "REFERRAL_EMAIL_INVALID";
    throw error;
  }

  const referral = await lookupReferralCode(databaseUrl, rawCode);
  if (!referral || !referral.grantEntitlement) {
    const error = new Error("Referral code cannot grant access.");
    error.code = "REFERRAL_GRANT_INVALID";
    throw error;
  }

  try {
    await withTransaction(databaseUrl, async (client) => {
      await client.query(
        `
          insert into users (email)
          values ($1)
          on conflict (email) do nothing
        `,
        [normalizedEmail]
      );
      await client.query(
        `
          insert into entitlements (email, product, active, source, expires_at)
          values ($1, $2, true, $3, now() + ($4::int * interval '1 day'))
          on conflict (email, product) do update
          set active = true,
              source = $3,
              expires_at = greatest(coalesce(entitlements.expires_at, now()), now()) + ($4::int * interval '1 day'),
              revoked_at = null,
              updated_at = now()
        `,
        [normalizedEmail, PRODUCT_KEY, `referral:${referral.code}`, referral.entitlementDurationDays]
      );
      await client.query(
        `
          insert into referral_redemptions (code, email, anonymous_id, status, plan_key)
          values ($1, $2, $3, 'granted', $4)
        `,
        [referral.code, normalizedEmail, cleanAnonymousId(context.anonymousId), referral.fixedPricePlan || "grant"]
      );
    });
    return { referral, email: normalizedEmail };
  } catch (error) {
    console.error("Could not grant referral entitlement", safeErrorSummary(error));
    throw error;
  }
}

export async function recordReferralPurchase(client, session, email, purchaseId = null) {
  const code = normalizeReferralCode(session?.metadata?.referral_code);
  if (!code) return;

  await client.query(
    `
      insert into referral_redemptions (
        code,
        email,
        stripe_checkout_session_id,
        status,
        plan_key,
        purchase_id
      )
      values ($1, $2, $3, 'purchased', $4, $5)
      on conflict (stripe_checkout_session_id)
        where stripe_checkout_session_id is not null
      do update set
        email = coalesce(excluded.email, referral_redemptions.email),
        status = 'purchased',
        plan_key = coalesce(nullif(excluded.plan_key, ''), referral_redemptions.plan_key),
        purchase_id = coalesce(excluded.purchase_id, referral_redemptions.purchase_id),
        updated_at = now()
    `,
    [
      code,
      email,
      session.id,
      session?.metadata?.plan_key || "",
      purchaseId,
    ]
  );
}

async function recordReferralRedemption(databaseUrl, code, data) {
  await withDb(databaseUrl, async (client) => {
    await client.query(
      `
        insert into referral_redemptions (
          code,
          email,
          anonymous_id,
          status,
          plan_key
        )
        values ($1, $2, $3, $4, $5)
      `,
      [
        normalizeReferralCode(code),
        normalizeEmail(data.email),
        cleanAnonymousId(data.anonymousId),
        data.status || "applied",
        data.planKey || "",
      ]
    );
  });
}

function isReferralUsable(referral) {
  if (!referral.active) return false;
  if (referral.expires_at && new Date(referral.expires_at).getTime() <= Date.now()) return false;
  const max = Number(referral.max_redemptions || 0);
  if (max > 0 && Number(referral.redemption_count || 0) >= max) return false;
  return true;
}

function normalizeReferralRow(row) {
  return {
    code: normalizeReferralCode(row.code),
    description: row.description || "",
    discountPercent: Number(row.discount_percent || 0),
    fixedPricePlan: row.fixed_price_plan || "",
    commissionNote: row.commission_note || "",
    maxRedemptions: Number(row.max_redemptions || 0),
    expiresAt: row.expires_at || null,
    entitlementDurationDays: Number(row.entitlement_duration_days || 90),
    grantEntitlement: Boolean(row.grant_entitlement),
    redemptionCount: Number(row.redemption_count || 0),
    allowedPlanKeys: normalizePlanKeys(row.allowed_plan_keys),
    instructorEmail: normalizeEmail(row.instructor_email),
  };
}

function normalizePlanKeys(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "")).filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map((item) => String(item || "")).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function cleanAnonymousId(value) {
  return String(value || "").replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 90);
}
