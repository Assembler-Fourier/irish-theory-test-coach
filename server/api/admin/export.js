import { requireAdmin, sendAdminError, testAuthzOk } from "../../../lib/admin.js";
import { withDb } from "../../../lib/db.js";
import {
  getAuthServerEnv,
  sendSafeConfigError,
} from "../../../lib/server-env.js";

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
    const type = String(req.query.type || "purchases");
    const permission = ["purchases", "referrals", "instructor-codes"].includes(type) ? "manage_payments" : "view_overview";
    const admin = await requireAdmin(req, env.databaseUrl, { permission });
    if (testAuthzOk(req, res, admin, permission)) return;
    const csv = type === "referrals"
      ? await exportReferralPerformance(env.databaseUrl)
      : type === "instructor-codes"
        ? await exportInstructorCodes(env.databaseUrl)
        : await exportPurchases(env.databaseUrl);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${type}.csv"`);
    return res.status(200).send(csv);
  } catch (error) {
    return sendAdminError(res, error, "Admin export failed");
  }
}

async function exportInstructorCodes(databaseUrl) {
  return withDb(databaseUrl, async (client) => {
    const result = await client.query(`
      select code, purchase_email, plan_key, status, redemption_count, max_redemptions,
             entitlement_duration_days, expires_at, redeemed_by_email, redeemed_at,
             revoked_at, created_at
      from instructor_codes
      order by created_at desc
      limit 10000
    `);
    return toCsv(result.rows, [
      "code",
      "purchase_email",
      "plan_key",
      "status",
      "redemption_count",
      "max_redemptions",
      "entitlement_duration_days",
      "expires_at",
      "redeemed_by_email",
      "redeemed_at",
      "revoked_at",
      "created_at",
    ]);
  });
}

async function exportPurchases(databaseUrl) {
  return withDb(databaseUrl, async (client) => {
    const result = await client.query(`
      select created_at, email, amount, currency, status, plan_key, referral_code,
             stripe_checkout_session_id, stripe_payment_intent_id, stripe_charge_id,
             refunded_amount, disputed_amount, entitlement_effect
      from purchases
      order by created_at desc
      limit 5000
    `);
    return toCsv(result.rows, [
      "created_at",
      "email",
      "amount",
      "currency",
      "status",
      "plan_key",
      "referral_code",
      "stripe_checkout_session_id",
      "stripe_payment_intent_id",
      "stripe_charge_id",
      "refunded_amount",
      "disputed_amount",
      "entitlement_effect",
    ]);
  });
}

async function exportReferralPerformance(databaseUrl) {
  return withDb(databaseUrl, async (client) => {
    const result = await client.query(`
      select rc.code,
             rc.description,
             rc.fixed_price_plan,
             rc.discount_percent,
             rc.max_redemptions,
             rc.expires_at,
             rc.active,
             count(rr.id)::int as redemptions,
             count(rr.id) filter (where rr.status = 'purchased')::int as purchases,
             coalesce(sum(p.amount) filter (where p.status in ('paid', 'complete', 'succeeded')), 0)::int as revenue
      from referral_codes rc
      left join referral_redemptions rr on rr.code = rc.code
      left join purchases p on p.stripe_checkout_session_id = rr.stripe_checkout_session_id
      group by rc.code
      order by revenue desc, redemptions desc, rc.code asc
    `);
    return toCsv(result.rows, [
      "code",
      "description",
      "fixed_price_plan",
      "discount_percent",
      "max_redemptions",
      "expires_at",
      "active",
      "redemptions",
      "purchases",
      "revenue",
    ]);
  });
}

function toCsv(rows, columns) {
  const header = columns.join(",");
  const body = rows.map((row) => columns.map((column) => csvCell(row[column])).join(","));
  return [header, ...body].join("\n") + "\n";
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).replace(/\r?\n/g, " ");
  return /[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
