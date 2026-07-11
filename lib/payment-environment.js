const PRICE_ENV_NAMES = [
  "STRIPE_PRICE_ID",
  "STRIPE_PRICE_ID_LAUNCH",
  "STRIPE_PRICE_ID_FULL",
  "STRIPE_PRICE_ID_INSTRUCTOR_10",
  "STRIPE_PRICE_ID_INSTRUCTOR_25",
];

export function validatePaymentEnvironment(env = process.env, options = {}) {
  const runtimeEnvironment = detectRuntimeEnvironment(env);
  const stripeMode = detectStripeSecretMode(env.STRIPE_SECRET_KEY);
  const invalid = [];

  const priceModes = PRICE_ENV_NAMES
    .filter((name) => env[name])
    .map((name) => ({
      name,
      mode: detectPriceMode(env[name], env[`${name}_MODE`] || env.STRIPE_PRICE_MODE),
    }));

  if (runtimeEnvironment === "production") {
    if (stripeMode !== "live") invalid.push("STRIPE_SECRET_KEY");
    if (!env.STRIPE_WEBHOOK_SECRET && options.requireWebhookInProduction !== false) {
      invalid.push("STRIPE_WEBHOOK_SECRET");
    }
    if (isLocalSiteUrl(env.PUBLIC_SITE_URL)) invalid.push("PUBLIC_SITE_URL");
  }

  if (runtimeEnvironment === "preview" && stripeMode === "live") {
    invalid.push("STRIPE_SECRET_KEY");
  }

  if (runtimeEnvironment === "local") {
    if (stripeMode === "live") invalid.push("STRIPE_SECRET_KEY");
    if (env.PUBLIC_SITE_URL && !isLocalSiteUrl(env.PUBLIC_SITE_URL)) {
      invalid.push("PUBLIC_SITE_URL");
    }
  }

  for (const price of priceModes) {
    if (stripeMode === "live" && price.mode === "test") invalid.push(price.name);
    if (stripeMode === "test" && price.mode === "live") invalid.push(price.name);
  }

  return {
    ok: invalid.length === 0,
    invalid: [...new Set(invalid)],
    runtimeEnvironment,
    stripeMode,
    priceModes,
  };
}

export function detectRuntimeEnvironment(env = process.env) {
  const explicit = normalizeEnvironmentName(env.PAYMENT_ENVIRONMENT || env.STRIPE_ENVIRONMENT);
  if (explicit) return explicit;

  if (env.VERCEL_ENV === "production") return "production";
  if (env.VERCEL_ENV === "preview") return "preview";
  if (env.VERCEL_ENV === "development") return "local";
  if (env.NODE_ENV === "production") return "production";
  return "local";
}

export function detectStripeSecretMode(secretKey = "") {
  if (String(secretKey).startsWith("sk_live_")) return "live";
  if (String(secretKey).startsWith("sk_test_")) return "test";
  return "unknown";
}

export function detectPriceMode(priceId = "", explicitMode = "") {
  const explicit = normalizeMode(explicitMode);
  if (explicit) return explicit;

  const value = String(priceId).toLowerCase();
  if (value.startsWith("price_test") || value.includes("_test_") || value.includes("test")) return "test";
  if (value.startsWith("price_live") || value.includes("_live_") || value.includes("live")) return "live";
  return "unknown";
}

function normalizeEnvironmentName(value = "") {
  const normal = String(value).trim().toLowerCase();
  if (["production", "prod", "live"].includes(normal)) return "production";
  if (["preview", "staging", "test"].includes(normal)) return "preview";
  if (["local", "development", "dev"].includes(normal)) return "local";
  return "";
}

function normalizeMode(value = "") {
  const normal = String(value).trim().toLowerCase();
  if (["live", "production", "prod"].includes(normal)) return "live";
  if (["test", "preview", "staging", "local", "development", "dev"].includes(normal)) return "test";
  return "";
}

function isLocalSiteUrl(value = "") {
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}
