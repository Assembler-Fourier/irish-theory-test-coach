import {
  buildClearSessionCookie,
  revokeSession,
} from "../../lib/auth.js";
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

  try {
    await revokeSession(req, env.databaseUrl);
    res.setHeader("Set-Cookie", buildClearSessionCookie(env));
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Could not log out", safeErrorSummary(error));
    res.setHeader("Set-Cookie", buildClearSessionCookie(env));
    return res.status(500).json({ error: "Could not log out" });
  }
}
