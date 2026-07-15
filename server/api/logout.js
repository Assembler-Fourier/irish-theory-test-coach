import {
  buildClearSessionCookie,
  revokeSession,
} from "../../lib/auth.js";
import { checkRateLimit, limitFromEnv, rateLimitKey, sendRateLimited } from "../../lib/rate-limit.js";
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
  if (!origin.ok) return rejectUnverifiedRequest(res);

  const limit = checkRateLimit({
    key: rateLimitKey(req, "logout"),
    limit: limitFromEnv("RATE_LIMIT_LOGOUT", 60),
    windowMs: 60_000,
  });
  if (!limit.allowed) return sendRateLimited(res, limit);

  try {
    await revokeSession(req, env.databaseUrl, "logout");
    res.setHeader("Set-Cookie", buildClearSessionCookie(env));
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Could not log out", safeErrorSummary(error));
    res.setHeader("Set-Cookie", buildClearSessionCookie(env));
    return res.status(500).json({ error: "Could not log out" });
  }
}
