import {
  buildSessionCookie,
  consumeLoginToken,
  readJsonBody,
} from "../lib/auth.js";
import {
  getAuthServerEnv,
  safeErrorSummary,
  sendSafeConfigError,
} from "../lib/server-env.js";

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
    const session = await consumeLoginToken(token, env.databaseUrl);
    if (!session) {
      return res.status(400).json({ error: "Login link is invalid or expired." });
    }

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
