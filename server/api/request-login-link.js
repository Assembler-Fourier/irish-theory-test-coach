import {
  buildLoginLink,
  createLoginTokenForKnownAccountEmail,
  deliverMagicLink,
  isValidEmail,
  loginRequestSafeMessage,
  markLoginTokenDelivery,
  normalizeEmail,
  readJsonBody,
  validateRequestOrigin,
} from "../../lib/auth.js";
import { checkRateLimit, rateLimitKey, sendRateLimited } from "../../lib/rate-limit.js";
import {
  getAuthServerEnv,
  safeErrorSummary,
  sendSafeConfigError,
} from "../../lib/server-env.js";

const EMAIL_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const IP_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let env;
  try {
    env = getAuthServerEnv();
  } catch (error) {
    return sendSafeConfigError(res, error);
  }

  const origin = validateRequestOrigin(req, env.publicSiteUrl, { isProduction: env.isProduction });
  if (!origin.ok) {
    return res.status(403).json({ error: "Request could not be verified" });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return res.status(400).json({ error: "Invalid request" });
  }

  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }

  const ipLimit = checkRateLimit({
    key: rateLimitKey(req, "login-link:ip"),
    limit: 8,
    windowMs: IP_LIMIT_WINDOW_MS,
  });
  if (!ipLimit.allowed) return sendRateLimited(res, ipLimit);

  const emailLimit = checkRateLimit({
    key: `login-link:email:${email}`,
    limit: 3,
    windowMs: EMAIL_LIMIT_WINDOW_MS,
  });
  if (!emailLimit.allowed) return sendRateLimited(res, emailLimit);

  try {
    const loginToken = await createLoginTokenForKnownAccountEmail(email, env.databaseUrl, { req });
    if (loginToken) {
      const link = buildLoginLink(env.publicSiteUrl, loginToken.token);
      try {
        await deliverMagicLink({ email, link, env });
        await markLoginTokenDelivery(env.databaseUrl, loginToken.token, "sent");
      } catch (error) {
        await markLoginTokenDelivery(env.databaseUrl, loginToken.token, "failed", error?.code || error?.name || "email_failed").catch(() => {});
        console.error("Could not deliver magic login link", safeErrorSummary(error));
        if (env.isProduction) {
          return res.status(503).json({ error: "Could not send login link right now" });
        }
      }
    }

    return res.status(200).json({ ok: true, message: loginRequestSafeMessage() });
  } catch (error) {
    console.error("Could not request magic login link", safeErrorSummary(error));
    return res.status(500).json({ error: "Could not request login link" });
  }
}
