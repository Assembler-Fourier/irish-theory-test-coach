import { getSessionUser } from "../../lib/auth.js";
import {
  getAuthServerEnv,
  safeErrorSummary,
  sendSafeConfigError,
} from "../../lib/server-env.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
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
      return res.status(200).json({
        authenticated: false,
        entitlement: { active: false },
      });
    }

    return res.status(200).json({
      authenticated: true,
      email: session.email,
      entitlement: session.entitlement,
    });
  } catch (error) {
    console.error("Could not fetch current user", safeErrorSummary(error));
    return res.status(500).json({ error: "Could not load account" });
  }
}
