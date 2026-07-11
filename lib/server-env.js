import { validatePaymentEnvironment } from "./payment-environment.js";

const REQUIRED_ENV = [
  "STRIPE_SECRET_KEY",
  "DATABASE_URL",
  "PUBLIC_SITE_URL",
];

export function getRequiredServerEnv(options = {}) {
  const required = [...REQUIRED_ENV];
  const paymentEnvironment = validatePaymentEnvironment(process.env, {
    requireWebhookInProduction: true,
  });

  if (options.requireStripeWebhookSecret || paymentEnvironment.runtimeEnvironment === "production") {
    required.push("STRIPE_WEBHOOK_SECRET");
  }

  const missing = required.filter((name) => !process.env[name]);
  const invalid = [];

  if (process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.startsWith("sk_")) {
    invalid.push("STRIPE_SECRET_KEY");
  }

  for (const name of [
    "STRIPE_PRICE_ID",
    "STRIPE_PRICE_ID_LAUNCH",
    "STRIPE_PRICE_ID_FULL",
    "STRIPE_PRICE_ID_INSTRUCTOR_10",
    "STRIPE_PRICE_ID_INSTRUCTOR_25",
  ]) {
    if (process.env[name] && !process.env[name].startsWith("price_")) {
      invalid.push(name);
    }
  }

  if (
    options.requireStripeWebhookSecret &&
    process.env.STRIPE_WEBHOOK_SECRET &&
    !process.env.STRIPE_WEBHOOK_SECRET.startsWith("whsec_")
  ) {
    invalid.push("STRIPE_WEBHOOK_SECRET");
  }

  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith("postgresql://")) {
    invalid.push("DATABASE_URL");
  }

  if (process.env.PUBLIC_SITE_URL) {
    try {
      const url = new URL(process.env.PUBLIC_SITE_URL);
      if (!["http:", "https:"].includes(url.protocol)) {
        invalid.push("PUBLIC_SITE_URL");
      }
    } catch {
      invalid.push("PUBLIC_SITE_URL");
    }
  }

  if (!paymentEnvironment.ok) {
    invalid.push(...paymentEnvironment.invalid);
  }

  if (missing.length || invalid.length) {
    const error = new Error("Required environment configuration is missing or invalid.");
    error.code = "SERVER_ENV_INVALID";
    error.missing = missing;
    error.invalid = invalid;
    throw error;
  }

  return {
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    stripePriceId: process.env.STRIPE_PRICE_ID,
    stripePriceIdLaunch: process.env.STRIPE_PRICE_ID_LAUNCH,
    stripePriceIdFull: process.env.STRIPE_PRICE_ID_FULL,
    stripePriceIdInstructor10: process.env.STRIPE_PRICE_ID_INSTRUCTOR_10,
    stripePriceIdInstructor25: process.env.STRIPE_PRICE_ID_INSTRUCTOR_25,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    databaseUrl: process.env.DATABASE_URL,
    publicSiteUrl: cleanSiteUrl(process.env.PUBLIC_SITE_URL),
    launchOfferEnabled: process.env.LAUNCH_OFFER_ENABLED,
    launchOfferEndsAt: process.env.LAUNCH_OFFER_ENDS_AT,
    paymentEnvironment: paymentEnvironment.runtimeEnvironment,
    stripeMode: paymentEnvironment.stripeMode,
    checkoutRequireTermsConsent: process.env.CHECKOUT_REQUIRE_TERMS_CONSENT,
  };
}

export function getAuthServerEnv() {
  const required = ["DATABASE_URL", "PUBLIC_SITE_URL"];
  const missing = required.filter((name) => !process.env[name]);
  const invalid = [];

  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith("postgresql://")) {
    invalid.push("DATABASE_URL");
  }

  if (process.env.PUBLIC_SITE_URL) {
    try {
      const url = new URL(process.env.PUBLIC_SITE_URL);
      if (!["http:", "https:"].includes(url.protocol)) {
        invalid.push("PUBLIC_SITE_URL");
      }
    } catch {
      invalid.push("PUBLIC_SITE_URL");
    }
  }

  if (missing.length || invalid.length) {
    const error = new Error("Required auth environment configuration is missing or invalid.");
    error.code = "SERVER_ENV_INVALID";
    error.missing = missing;
    error.invalid = invalid;
    throw error;
  }

  return {
    databaseUrl: process.env.DATABASE_URL,
    publicSiteUrl: cleanSiteUrl(process.env.PUBLIC_SITE_URL),
    emailFrom: process.env.EMAIL_FROM || "",
    emailProviderApiKey: process.env.EMAIL_PROVIDER_API_KEY || "",
    isProduction: process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production",
  };
}

export function sendSafeConfigError(res, error) {
  console.error("Server environment validation failed", {
    code: error?.code || "SERVER_ENV_INVALID",
    missing: error?.missing || [],
    invalid: error?.invalid || [],
  });
  return res.status(500).json({ error: "Server configuration error" });
}

export function safeErrorSummary(error) {
  return {
    name: error?.name || "Error",
    code: error?.code,
  };
}

function cleanSiteUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}
