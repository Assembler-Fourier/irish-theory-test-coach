import { withDb } from "../../lib/db.js";
import { emitOperationalEvent } from "../../lib/monitoring.js";
import { getAuthServerEnv } from "../../lib/server-env.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let env;
  try {
    env = getAuthServerEnv();
  } catch {
    await emitOperationalEvent("readiness_config_failure", "error", { route: "ready" }, { source: "ready" });
    return res.status(503).json({ ready: false });
  }

  try {
    await withDb(env.databaseUrl, (client) => client.query("select 1"));
    return res.status(200).json({ ready: true });
  } catch (error) {
    await emitOperationalEvent("database_connection_failure", "error", {
      route: "ready",
      errorCode: error?.code || error?.name || "database_unavailable",
    }, { source: "ready" });
    return res.status(503).json({ ready: false });
  }
}
