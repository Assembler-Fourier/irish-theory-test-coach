import {
  getRequiredServerEnv,
  sendSafeConfigError,
} from "../../lib/server-env.js";
import {
  getCheckoutSessionEmail,
  isPaidCheckoutSession,
  recordStripeCheckoutSession,
} from "../../lib/stripe-entitlements.js";
import { buildSessionCookie, createSessionForEntitledEmail } from "../../lib/auth.js";

const STRIPE_API = "https://api.stripe.com/v1";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let env;
  try {
    env = getRequiredServerEnv();
  } catch (error) {
    return sendSafeConfigError(res, error);
  }

  const sessionId = String(req.query.session_id || "");
  if (!sessionId.startsWith("cs_")) {
    return res.status(400).json({ error: "Missing checkout session" });
  }

  const stripeResponse = await fetch(`${STRIPE_API}/checkout/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${env.stripeSecretKey}` },
  });
  const session = await stripeResponse.json();

  if (!stripeResponse.ok) {
    return res.status(stripeResponse.status).json({
      error: session.error?.message || "Could not verify checkout session",
    });
  }

  const paid = isPaidCheckoutSession(session);
  if (!paid) {
    return res.status(402).json({ ok: false, paid: false });
  }

  const email = getCheckoutSessionEmail(session);
  const dbRecorded = email ? await recordStripeCheckoutSession(session, env.databaseUrl) : false;
  const appSession = dbRecorded && email
    ? await createSessionForEntitledEmail(email, env.databaseUrl)
    : null;

  if (appSession?.sessionToken) {
    res.setHeader("Set-Cookie", buildSessionCookie(appSession.sessionToken, env));
  }

  return res.status(200).json({
    ok: true,
    paid: true,
    email,
    dbRecorded,
    authenticated: Boolean(appSession),
  });
}
