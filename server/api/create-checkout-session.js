import { getRequiredServerEnv, sendSafeConfigError } from "../../lib/server-env.js";
import { getSessionUser, readJsonBody } from "../../lib/auth.js";
import {
  createCheckoutAttempt,
  markCheckoutAttemptFailure,
  markCheckoutAttemptStripeSession,
} from "../../lib/payment-ledger.js";
import { resolveCheckoutPlan } from "../../shared/pricing-config.js";
import { applyReferralCodeToCheckoutPlan } from "../../lib/referrals.js";

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

  let body = {};
  try {
    body = await readJsonBody(req).catch(() => ({}));
  } catch {
    body = {};
  }

  let plan;
  let referral = null;
  let sessionUser = null;
  const requestedPlanKey = cleanPlanKey(body.planKey);
  try {
    sessionUser = await getSessionUser(req, env.databaseUrl).catch(() => null);
    plan = resolveCheckoutPlan(requestedPlanKey, process.env);
    if (body.referralCode) {
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
    },
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
  params.set("metadata[one_time_payment]", "true");
  params.set("metadata[legal_review_required]", "true");
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
