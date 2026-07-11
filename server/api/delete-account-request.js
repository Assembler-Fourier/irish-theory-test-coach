import { getSessionUser, readJsonBody } from "../../lib/auth.js";
import { requestAccountDeletion } from "../../lib/account-data.js";
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
    key: rateLimitKey(req, "delete-account-request"),
    limit: limitFromEnv("RATE_LIMIT_ACCOUNT_DELETE_REQUEST", 5),
    windowMs: 60 * 60_000,
  });
  if (!limit.allowed) return sendRateLimited(res, limit);

  try {
    const session = await getSessionUser(req, env.databaseUrl);
    if (!session) {
      return res.status(401).json({ error: "Login required" });
    }

    const body = await readJsonBody(req, { maxBytes: 4096 }).catch(() => ({}));
    const request = await requestAccountDeletion(env.databaseUrl, session, body.reason || "");
    return res.status(200).json({
      ok: true,
      status: request.status,
      requestedAt: request.created_at,
    });
  } catch (error) {
    console.error("Could not request account deletion", safeErrorSummary(error));
    return res.status(500).json({ error: "Could not request account deletion" });
  }
}
