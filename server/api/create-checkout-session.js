import { getRequiredServerEnv, sendSafeConfigError } from "../../lib/server-env.js";
import { getSessionUser } from "../../lib/auth.js";
import {
  createCheckoutAttempt,
  markCheckoutAttemptFailure,
  markCheckoutAttemptStripeSession,
} from "../../lib/payment-ledger.js";
import { resolveCheckoutPlan } from "../../shared/pricing-config.js";
import { buildProductSummary } from "../../shared/product-summary.js";
import {
  assertBusinessReadyForProduction,
  buildBusinessConfig,
  checkoutPolicyMetadata,
} from "../../shared/business-config.js";
import { applyReferralCodeToCheckoutPlan } from "../../lib/referrals.js";
import { emitOperationalEvent } from "../../lib/monitoring.js";
import { checkRateLimit, compoundRateLimitKey, limitFromEnv, rateLimitKey, sendRateLimited } from "../../lib/rate-limit.js";
import { readValidatedJson, fieldString } from "../../lib/request-validation.js";
import { rejectUnverifiedRequest, verifyStateChangingRequest } from "../../lib/security.js";

const STRIPE_API = "https://api.stripe.com/v1";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let env;
  try {
    env = getRequiredServerEnv();
  } catch (error) {
    return sendSafeConfigError(res, error);
  }

  const origin = verifyStateChangingRequest(req, {
    publicSiteUrl: env.publicSiteUrl,
    isProduction: env.paymentEnvironment === "production",
  });
  if (!origin.ok) {
    return rejectUnverifiedRequest(res);
  }

  const ipLimit = checkRateLimit({
    key: rateLimitKey(req, "checkout:create"),
    limit: limitFromEnv("RATE_LIMIT_CHECKOUT_CREATE", 20),
    windowMs: 10 * 60 * 1000,
  });
  if (!ipLimit.allowed) return sendRateLimited(res, ipLimit);

  let body = {};
  try {
    body = await readValidatedJson(req, {
      maxBytes: 4096,
      fields: {
        planKey: fieldString({ max: 80, pattern: /^[a-zA-Z0-9_-]{0,80}$/ }),
        referralCode: fieldString({ max: 80, pattern: /^[a-zA-Z0-9_-]{0,80}$/ }),
        anonymousId: fieldString({ max: 160, pattern: /^[a-zA-Z0-9:_-]{0,160}$/ }),
        source: fieldString({ max: 80 }),
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: "Invalid checkout request" });
  }

  let plan;
  let referral = null;
  let sessionUser = null;
  let productSummary;
  let policy;
  try {
    productSummary = buildProductSummary({ env: process.env });
    const businessConfig = buildBusinessConfig(process.env);
    assertBusinessReadyForProduction(businessConfig, process.env);
    policy = checkoutPolicyMetadata(businessConfig);
  } catch {
    return res.status(500).json({ error: "Checkout is not configured" });
  }
  const requestedPlanKey = cleanPlanKey(body.planKey);
  try {
    sessionUser = await getSessionUser(req, env.databaseUrl).catch(() => null);
    plan = resolveCheckoutPlan(requestedPlanKey, process.env);
    if (body.referralCode) {
      const referralLimit = checkRateLimit({
        key: compoundRateLimitKey(req, "checkout:referral", body.referralCode),
        limit: limitFromEnv("RATE_LIMIT_REFERRAL_CHECKOUT", 20),
        windowMs: 10 * 60 * 1000,
      });
      if (!referralLimit.allowed) return sendRateLimited(res, referralLimit);
      const result = await applyReferralCodeToCheckoutPlan(env.databaseUrl, body.referralCode, plan, {
        anonymousId: body.anonymousId,
        email: sessionUser?.email,
      });
      plan = result.plan;
      referral = result.referral;
    }
  } catch (error) {
    return res.status(400).json({ error: "Checkout is not available for this plan" });
  }

  const attempt = await createCheckoutAttempt(env.databaseUrl, {
    requestedPlanKey: requestedPlanKey || plan.key,
    resolvedPlanKey: plan.key,
    userId: sessionUser?.userId,
    email: sessionUser?.email,
    anonymousId: body.anonymousId,
    referralCode: referral?.code || body.referralCode,
    environment: env.paymentEnvironment,
    stripeMode: env.stripeMode,
    metadata: {
      source: cleanText(body.source, 80),
      userAgent: cleanText(req.headers?.["user-agent"], 240),
      productVersion: productSummary.productVersion,
      contentVersion: productSummary.contentVersion,
      policyVersions: policy.accepted_policy_versions,
    },
    acceptedPolicyVersions: policy.accepted_policy_versions,
  });

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("client_reference_id", attempt.id);
  params.set("line_items[0][price]", plan.stripePriceId);
  params.set("line_items[0][quantity]", "1");
  params.set("success_url", `${env.publicSiteUrl}/app?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", `${env.publicSiteUrl}/app?checkout=cancelled`);
  params.set("customer_creation", "always");
  params.set("metadata[checkout_attempt_id]", attempt.id);
  params.set("metadata[product]", "irish-theory-test-coach");
  params.set("metadata[plan_key]", plan.key);
  params.set("metadata[plan_label]", plan.label);
  params.set("metadata[entitlement_days]", String(plan.entitlementDays || 90));
  params.set("metadata[environment]", env.paymentEnvironment || "local");
  params.set("metadata[product_version]", productSummary.productVersion);
  params.set("metadata[content_version]", productSummary.contentVersion);
  params.set("metadata[one_time_payment]", "true");
  params.set("metadata[legal_review_required]", policy.legal_review_required);
  params.set("metadata[policy_version_privacy]", policy.policy_version_privacy);
  params.set("metadata[policy_version_terms]", policy.policy_version_terms);
  params.set("metadata[policy_version_refunds]", policy.policy_version_refunds);
  params.set("metadata[policy_version_accessibility]", policy.policy_version_accessibility);
  params.set("metadata[policy_version_content_methodology]", policy.policy_version_content_methodology);
  params.set("metadata[policy_effective_date]", policy.policy_effective_date);
  if (referral?.code) {
    params.set("metadata[referral_code]", referral.code);
  }
  if (String(env.checkoutRequireTermsConsent || "").toLowerCase() === "true") {
    params.set("consent_collection[terms_of_service]", "required");
  }

  let stripeResponse;
  try {
    stripeResponse = await fetch(`${STRIPE_API}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": `ittc_checkout_${attempt.id}`,
      },
      body: params,
    });
  } catch (error) {
    await markCheckoutAttemptFailure(env.databaseUrl, attempt.id, "stripe_request_failed", error?.name || "network_error");
    await emitOperationalEvent("checkout_failure", "error", {
      stage: "stripe_request",
      planKey: plan.key,
      checkoutAttemptId: attempt.id,
      errorCode: error?.code || error?.name || "network_error",
    }, { source: "checkout" });
    return res.status(502).json({ error: "Could not create checkout session" });
  }

  const payload = await stripeResponse.json();
  if (!stripeResponse.ok) {
    await markCheckoutAttemptFailure(
      env.databaseUrl,
      attempt.id,
      "stripe_rejected",
      payload?.error?.code || payload?.error?.type || "stripe_error"
    );
    await emitOperationalEvent("checkout_failure", "error", {
      stage: "stripe_rejected",
      planKey: plan.key,
      checkoutAttemptId: attempt.id,
      statusCode: stripeResponse.status,
      errorCode: payload?.error?.code || payload?.error?.type || "stripe_error",
    }, { source: "checkout" });
    return res.status(stripeResponse.status).json({
      error: "Could not create checkout session",
    });
  }

  await markCheckoutAttemptStripeSession(env.databaseUrl, attempt.id, payload);

  return res.status(200).json({
    url: payload.url,
    attemptId: attempt.id,
    plan: {
      key: plan.key,
      label: plan.label,
      amountCents: plan.amountCents,
      currency: plan.currency,
    },
    referralCode: referral?.code || "",
  });
}

function cleanPlanKey(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
