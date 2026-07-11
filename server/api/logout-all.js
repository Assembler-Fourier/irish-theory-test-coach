import {
  buildClearSessionCookie,
  getSessionUser,
  revokeAllSessionsForUser,
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
    const session = await getSessionUser(req, env.databaseUrl);
    if (!session) {
      res.setHeader("Set-Cookie", buildClearSessionCookie(env));
      return res.status(200).json({ ok: true, revoked: 0 });
    }

    const revoked = await revokeAllSessionsForUser(env.databaseUrl, session);
    res.setHeader("Set-Cookie", buildClearSessionCookie(env));
    return res.status(200).json({ ok: true, revoked });
  } catch (error) {
    console.error("Could not log out all sessions", safeErrorSummary(error));
    res.setHeader("Set-Cookie", buildClearSessionCookie(env));
    return res.status(500).json({ error: "Could not log out all sessions" });
  }
}
