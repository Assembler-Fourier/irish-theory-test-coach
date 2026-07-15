export const PRODUCT_KEY = "irish-theory-test-coach";

export const DEFAULT_ENTITLEMENT_DAYS = 90;

export const PRICING_PLANS = {
  launch_offer: {
    key: "launch_offer",
    label: "Launch offer",
    amountCents: 299,
    currency: "EUR",
    priceEnv: "STRIPE_PRICE_ID_LAUNCH",
    fallbackPriceEnv: "STRIPE_PRICE_ID",
    entitlementDays: DEFAULT_ENTITLEMENT_DAYS,
    checkout: true,
    kind: "learner",
    description: "Early launch access for learners during the beta/launch period.",
  },
  full_study_pass: {
    key: "full_study_pass",
    label: "Full Study Pass",
    amountCents: 499,
    currency: "EUR",
    priceEnv: "STRIPE_PRICE_ID_FULL",
    fallbackPriceEnv: "STRIPE_PRICE_ID",
    entitlementDays: DEFAULT_ENTITLEMENT_DAYS,
    checkout: true,
    kind: "learner",
    description: "One-time learner access for 90 days.",
  },
  instructor_10: {
    key: "instructor_10",
    label: "Instructor pack - 10 codes",
    amountCents: 2900,
    currency: "EUR",
    priceEnv: "STRIPE_PRICE_ID_INSTRUCTOR_10",
    entitlementDays: DEFAULT_ENTITLEMENT_DAYS,
    checkout: true,
    kind: "instructor",
    codeCount: 10,
    description: "Pack for driving instructors who want 10 learner access codes.",
  },
  instructor_25: {
    key: "instructor_25",
    label: "Instructor pack - 25 codes",
    amountCents: 6900,
    currency: "EUR",
    priceEnv: "STRIPE_PRICE_ID_INSTRUCTOR_25",
    entitlementDays: DEFAULT_ENTITLEMENT_DAYS,
    checkout: true,
    kind: "instructor",
    codeCount: 25,
    description: "Pack for driving instructors who want 25 learner access codes.",
  },
};

export function getPricingPlan(planKey) {
  return PRICING_PLANS[planKey] || null;
}

export function isLaunchOfferEnabled(env = process.env) {
  if (String(env.LAUNCH_OFFER_ENABLED || "").toLowerCase() !== "true") return false;
  const endsAt = env.LAUNCH_OFFER_ENDS_AT || "";
  if (!endsAt) return true;
  const timestamp = Date.parse(endsAt);
  return Number.isNaN(timestamp) ? true : Date.now() < timestamp;
}

export function defaultLearnerPlanKey(env = process.env) {
  return isLaunchOfferEnabled(env) ? "launch_offer" : "full_study_pass";
}

export function getPublicPricingConfig(env = process.env) {
  const launchOfferEnabled = isLaunchOfferEnabled(env);
  const activeLearnerPlanKey = defaultLearnerPlanKey(env);
  return {
    productKey: PRODUCT_KEY,
    launchOfferEnabled,
    launchOfferEndsAt: env.LAUNCH_OFFER_ENDS_AT || "",
    activeLearnerPlanKey,
    plans: Object.values(PRICING_PLANS).map((plan) => ({
      key: plan.key,
      label: plan.label,
      amountCents: plan.amountCents,
      currency: plan.currency,
      displayPrice: formatPlanPrice(plan),
      entitlementDays: plan.entitlementDays,
      checkout: plan.checkout,
      kind: plan.kind,
      codeCount: plan.codeCount || null,
      description: plan.description,
      enabled: plan.key !== "launch_offer" || launchOfferEnabled,
      active: plan.key === activeLearnerPlanKey,
    })),
  };
}

export function resolveCheckoutPlan(planKey, env = process.env) {
  const requestedKey = planKey || defaultLearnerPlanKey(env);
  const plan = getPricingPlan(requestedKey) || getPricingPlan(defaultLearnerPlanKey(env));
  if (!plan || !plan.checkout) {
    const error = new Error("Checkout plan is not available.");
    error.code = "CHECKOUT_PLAN_INVALID";
    throw error;
  }

  if (plan.key === "launch_offer" && !isLaunchOfferEnabled(env)) {
    return resolveCheckoutPlan("full_study_pass", env);
  }

  const stripePriceId = env[plan.priceEnv] || (plan.fallbackPriceEnv ? env[plan.fallbackPriceEnv] : "");
  if (!stripePriceId) {
    const error = new Error("Stripe price ID is missing for checkout plan.");
    error.code = "CHECKOUT_PRICE_MISSING";
    error.missing = [plan.priceEnv];
    if (plan.fallbackPriceEnv) error.missing.push(plan.fallbackPriceEnv);
    throw error;
  }

  return {
    ...plan,
    stripePriceId,
  };
}

export function formatPlanPrice(plan) {
  return `${plan.currency} ${(plan.amountCents / 100).toFixed(2)}`;
}
