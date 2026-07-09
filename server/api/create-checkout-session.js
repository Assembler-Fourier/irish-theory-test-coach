import { getRequiredServerEnv, sendSafeConfigError } from "../../lib/server-env.js";

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

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("line_items[0][price]", env.stripePriceId);
  params.set("line_items[0][quantity]", "1");
  params.set("success_url", `${env.publicSiteUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", `${env.publicSiteUrl}/?checkout=cancelled`);
  params.set("customer_creation", "always");
  params.set("metadata[product]", "irish-theory-test-coach");

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

  return res.status(200).json({ url: payload.url });
}
