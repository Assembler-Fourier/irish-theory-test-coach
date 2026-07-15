import { requireAdmin, sendAdminError, testAuthzOk, writeAdminAuditLog } from "../../../lib/admin.js";
import { readJsonBody } from "../../../lib/auth.js";
import { withDb, withTransaction } from "../../../lib/db.js";
import { revokeInstructorCode } from "../../../lib/instructor-codes.js";
import {
  getPaymentReconciliation,
  recordManualRefund,
} from "../../../lib/payment-ledger.js";
import {
  getAuthServerEnv,
  getRequiredServerEnv,
  sendSafeConfigError,
} from "../../../lib/server-env.js";
import { handleStripeEvent } from "../stripe-webhook.js";

export default async function handler(req, res) {
  let authEnv;
  try {
    authEnv = getAuthServerEnv();
  } catch (error) {
    return sendSafeConfigError(res, error);
  }

  try {
    const admin = await requireAdmin(req, authEnv.databaseUrl, { permission: "manage_payments" });
    if (testAuthzOk(req, res, admin, "manage_payments")) return;

    if (req.method === "GET") {
      const payload = await getPaymentReconciliation(authEnv.databaseUrl);
      return res.status(200).json({ ok: true, ...payload });
    }

    if (req.method === "POST") {
      const body = await readJsonBody(req).catch(() => ({}));
      const action = String(body.action || "");

      if (action === "record_refund") {
        if (body.entitlementEffect === "revoke" && body.confirm !== true) {
          return res.status(400).json({ error: "Confirmation is required" });
        }
        const result = await recordManualRefund(authEnv.databaseUrl, {
          ...body,
          actorUserId: admin.userId,
          actorEmail: admin.email,
        });
        await audit(authEnv.databaseUrl, admin, {
          action: "record_manual_refund",
          targetType: "payment_refund",
          targetEmail: body.email || "",
          reason: String(body.reason || "").slice(0, 500),
          afterState: {
            amount: Number(body.amount || 0),
            entitlementEffect: String(body.entitlementEffect || "none"),
            stripeObject: String(body.stripeObject || body.stripeRefundId || ""),
          },
          metadata: {
            amount: Number(body.amount || 0),
            entitlementEffect: String(body.entitlementEffect || "none"),
          },
        });
        return res.status(200).json(result);
      }

      if (action === "revoke_instructor_code") {
        if (body.confirm !== true) {
          return res.status(400).json({ error: "Confirmation is required" });
        }
        const revoked = await revokeInstructorCode(authEnv.databaseUrl, body.code, admin);
        await audit(authEnv.databaseUrl, admin, {
          action: "revoke_instructor_code",
          targetType: "instructor_code",
          targetId: String(body.code || "").slice(0, 80),
          reason: String(body.reason || "admin_revoked").slice(0, 500),
          afterState: { revoked },
          metadata: { revoked },
        });
        return res.status(200).json({ ok: true, revoked });
      }

      if (action === "replay_stripe_event") {
        const paymentEnv = getRequiredServerEnv({ requireStripeWebhookSecret: true });
        const replay = await replayStripeEvent(paymentEnv, body.stripeEventId);
        await audit(authEnv.databaseUrl, admin, {
          action: "replay_stripe_event",
          targetType: "stripe_event",
          targetId: String(body.stripeEventId || "").slice(0, 120),
          reason: String(body.reason || "admin_replay").slice(0, 500),
          afterState: replay,
          metadata: replay,
        });
        return res.status(200).json({ ok: true, replay });
      }

      return res.status(400).json({ error: "Unsupported payment action" });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return sendAdminError(res, error, "Admin payments request failed");
  }
}

async function replayStripeEvent(env, stripeEventId) {
  const event = await withDb(env.databaseUrl, async (client) => {
    const result = await client.query(
      `
        select payload
        from stripe_events
        where stripe_event_id = $1
        limit 1
      `,
      [String(stripeEventId || "").replace(/[^\w:-]/g, "").slice(0, 120)]
    );
    return result.rows[0]?.payload || null;
  });

  if (!event) {
    const error = new Error("Stripe event was not found.");
    error.statusCode = 404;
    throw error;
  }

  return handleStripeEvent(event, env, { forceReplay: true, replay: true });
}

async function audit(databaseUrl, admin, entry) {
  return withTransaction(databaseUrl, async (client) => {
    await writeAdminAuditLog(client, admin, entry);
  });
}
