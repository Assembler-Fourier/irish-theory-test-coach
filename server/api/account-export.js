import { getSessionUser } from "../../lib/auth.js";
import { buildAccountExport } from "../../lib/account-data.js";
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
      return res.status(401).json({ error: "Login required" });
    }

    const payload = await buildAccountExport(env.databaseUrl, session);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="irish-theory-test-coach-data.json"');
    return res.status(200).json(payload);
  } catch (error) {
    console.error("Could not export account data", safeErrorSummary(error));
    return res.status(500).json({ error: "Could not export account data" });
  }
}
