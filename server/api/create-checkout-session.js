import { getRequiredServerEnv, sendSafeConfigError } from "../../lib/server-env.js";
import { readJsonBody } from "../../lib/auth.js";
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
  try {
    plan = resolveCheckoutPlan(cleanPlanKey(body.planKey), process.env);
    if (body.referralCode) {
      const result = await applyReferralCodeToCheckoutPlan(env.databaseUrl, body.referralCode, plan, {
        anonymousId: body.anonymousId,
      });
      plan = result.plan;
      referral = result.referral;
    }
  } catch (error) {
    return res.status(400).json({ error: "Checkout is not available for this plan" });
  }

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("line_items[0][price]", plan.stripePriceId);
  params.set("line_items[0][quantity]", "1");
  params.set("success_url", `${env.publicSiteUrl}/app?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", `${env.publicSiteUrl}/app?checkout=cancelled`);
  params.set("customer_creation", "always");
  params.set("metadata[product]", "irish-theory-test-coach");
  params.set("metadata[plan_key]", plan.key);
  params.set("metadata[plan_label]", plan.label);
  params.set("metadata[entitlement_days]", String(plan.entitlementDays || 90));
  if (referral?.code) {
    params.set("metadata[referral_code]", referral.code);
  }

  const stripeResponse = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const payload = await stripeResponse.json();
  if (!stripeResponse.ok) {
    return res.status(stripeResponse.status).json({
      error: payload.error?.message || "Could not create checkout session",
    });
  }

  return res.status(200).json({
    url: payload.url,
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
