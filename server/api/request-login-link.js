import {
  buildLoginLink,
  createLoginTokenForEntitledEmail,
  deliverMagicLink,
  isValidEmail,
  normalizeEmail,
  readJsonBody,
} from "../../lib/auth.js";
import {
  getAuthServerEnv,
  safeErrorSummary,
  sendSafeConfigError,
} from "../../lib/server-env.js";

const SAFE_MESSAGE = "If that email has access, a login link has been sent.";

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

  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }

  try {
    const loginToken = await createLoginTokenForEntitledEmail(email, env.databaseUrl);
    if (loginToken) {
      const link = buildLoginLink(env.publicSiteUrl, loginToken.token);
      await deliverMagicLink({ email, link, env });
    }

    return res.status(200).json({ ok: true, message: SAFE_MESSAGE });
  } catch (error) {
    console.error("Could not request magic login link", safeErrorSummary(error));
    return res.status(500).json({ error: "Could not request login link" });
  }
}
