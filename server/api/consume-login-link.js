import {
  buildSessionCookie,
  consumeLoginToken,
  revokeSession,
} from "../../lib/auth.js";
import { checkRateLimit, compoundRateLimitKey, limitFromEnv, rateLimitKey, sendRateLimited } from "../../lib/rate-limit.js";
import { readValidatedJson, fieldString } from "../../lib/request-validation.js";
import { rejectUnverifiedRequest, verifyStateChangingRequest } from "../../lib/security.js";
import {
  getAuthServerEnv,
  safeErrorSummary,
  sendSafeConfigError,
} from "../../lib/server-env.js";

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

  const origin = verifyStateChangingRequest(req, env);
  if (!origin.ok) {
    return rejectUnverifiedRequest(res);
  }

  let body;
  try {
    body = await readValidatedJson(req, {
      maxBytes: 4096,
      fields: {
        token: fieldString({ required: true, max: 300, pattern: /^[A-Za-z0-9_-]{24,300}$/ }),
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: "Invalid request" });
  }

  const token = String(body.token || "");
  if (token.length < 24) {
    return res.status(400).json({ error: "Login link is invalid or expired." });
  }

  const ipLimit = checkRateLimit({
    key: rateLimitKey(req, "consume-login:ip"),
    limit: limitFromEnv("RATE_LIMIT_CONSUME_LOGIN_IP", 20),
    windowMs: 15 * 60 * 1000,
  });
  if (!ipLimit.allowed) return sendRateLimited(res, ipLimit);

  const tokenLimit = checkRateLimit({
    key: compoundRateLimitKey(req, "consume-login:token", token.slice(0, 48)),
    limit: limitFromEnv("RATE_LIMIT_CONSUME_LOGIN_TOKEN", 5),
    windowMs: 15 * 60 * 1000,
  });
  if (!tokenLimit.allowed) return sendRateLimited(res, tokenLimit);

  try {
    const session = await consumeLoginToken(token, env.databaseUrl, { req });
    if (!session?.ok) {
      const code = session?.code || "invalid_link";
      if (code === "expired_link") {
        return res.status(410).json({ error: "Login link expired", code });
      }
      if (code === "used_link") {
        return res.status(409).json({ error: "Login link already used", code });
      }
      return res.status(400).json({ error: "Login link is invalid or expired.", code: "invalid_link" });
    }

    await revokeSession(req, env.databaseUrl, "rotated_after_login").catch(() => {});
    res.setHeader("Set-Cookie", buildSessionCookie(session.sessionToken, env));
    return res.status(200).json({
      ok: true,
      email: session.email,
      entitlement: session.entitlement,
    });
  } catch (error) {
    console.error("Could not consume magic login link", safeErrorSummary(error));
    return res.status(500).json({ error: "Could not restore access" });
  }
}
