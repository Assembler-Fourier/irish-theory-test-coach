import crypto from "node:crypto";
import { runReliabilityReconciliation } from "../../lib/reconciliation.js";
import { emitOperationalEvent } from "../../lib/monitoring.js";

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.OPS_CRON_SECRET || process.env.CRON_SECRET || "";
  if (!process.env.DATABASE_URL || !secret) {
    await emitOperationalEvent("reconciliation_config_failure", "error", {
      route: "ops/reconcile",
      databaseConfigured: Boolean(process.env.DATABASE_URL),
      secretConfigured: Boolean(secret),
    }, { source: "reconciliation" });
    return res.status(503).json({ ok: false });
  }

  if (!authorized(req, secret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const result = await runReliabilityReconciliation(process.env.DATABASE_URL, {
      source: "ops_endpoint",
    });
    return res.status(200).json({
      ok: true,
      runId: result.runId,
      summary: result.summary,
    });
  } catch (error) {
    await emitOperationalEvent("reconciliation_job_failure", "error", {
      route: "ops/reconcile",
      errorCode: error?.code || error?.name || "reconciliation_failed",
    }, { source: "reconciliation" });
    return res.status(500).json({ error: "Reconciliation failed" });
  }
}

function authorized(req, secret) {
  const header = String(req.headers?.authorization || "");
  const supplied = header.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  if (!supplied) return false;
  const left = Buffer.from(supplied);
  const right = Buffer.from(secret);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
