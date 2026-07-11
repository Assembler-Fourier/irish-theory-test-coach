import {
  buildSessionCookie,
  consumeLoginToken,
  readJsonBody,
  revokeSession,
  validateRequestOrigin,
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

  const token = String(body.token || "");
  if (token.length < 24) {
    return res.status(400).json({ error: "Login link is invalid or expired." });
  }

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
