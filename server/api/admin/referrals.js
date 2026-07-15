import { readJsonBody } from "../../../lib/auth.js";
import { requireAdmin, sendAdminError, testAuthzOk, writeAdminAuditLog } from "../../../lib/admin.js";
import { normalizeReferralCode } from "../../../lib/referrals.js";
import { withDb, withTransaction } from "../../../lib/db.js";
import {
  getAuthServerEnv,
  sendSafeConfigError,
} from "../../../lib/server-env.js";

export default async function handler(req, res) {
  let env;
  try {
    env = getAuthServerEnv();
  } catch (error) {
    return sendSafeConfigError(res, error);
  }

  try {
    const admin = await requireAdmin(req, env.databaseUrl, { permission: "manage_instructors" });
    if (testAuthzOk(req, res, admin, "manage_instructors")) return;
    if (req.method === "GET") {
      const referrals = await listReferrals(env.databaseUrl);
      return res.status(200).json({ ok: true, referrals });
    }

    if (req.method === "POST") {
      const body = await readJsonBody(req);
      const referral = await upsertReferral(env.databaseUrl, admin, body);
      return res.status(200).json({ ok: true, referral });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return sendAdminError(res, error, "Admin referrals failed");
  }
}

async function listReferrals(databaseUrl) {
  return withDb(databaseUrl, async (client) => {
    const result = await client.query(`
      select rc.code,
             rc.description,
             rc.discount_percent,
             rc.fixed_price_plan,
             rc.commission_note,
             rc.max_redemptions,
             rc.expires_at,
             rc.entitlement_duration_days,
             rc.grant_entitlement,
             rc.allowed_plan_keys,
             rc.active,
             count(rr.id)::int as redemptions,
             count(rr.id) filter (where rr.status = 'purchased')::int as purchases,
             coalesce(sum(p.amount) filter (where p.status in ('paid', 'complete', 'succeeded', 'partially_refunded', 'refunded')), 0)::int as revenue
      from referral_codes rc
      left join referral_redemptions rr on rr.code = rc.code
      left join purchases p on p.stripe_checkout_session_id = rr.stripe_checkout_session_id
      group by rc.code
      order by rc.created_at desc
      limit 100
    `);
    return result.rows;
  });
}

async function upsertReferral(databaseUrl, admin, body) {
  const code = normalizeReferralCode(body.code);
  if (!code) {
    const error = new Error("Referral code is required.");
    error.statusCode = 400;
    throw error;
  }

  return withTransaction(databaseUrl, async (client) => {
    const result = await client.query(
      `
        insert into referral_codes (
          code,
          description,
          discount_percent,
          fixed_price_plan,
          commission_note,
          max_redemptions,
          expires_at,
          entitlement_duration_days,
          grant_entitlement,
          allowed_plan_keys,
          active,
          created_by,
          created_by_email
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13)
        on conflict (code) do update
        set description = excluded.description,
            discount_percent = excluded.discount_percent,
            fixed_price_plan = excluded.fixed_price_plan,
            commission_note = excluded.commission_note,
            max_redemptions = excluded.max_redemptions,
            expires_at = excluded.expires_at,
            entitlement_duration_days = excluded.entitlement_duration_days,
            grant_entitlement = excluded.grant_entitlement,
            allowed_plan_keys = excluded.allowed_plan_keys,
            active = excluded.active,
            updated_at = now()
        returning *
      `,
      [
        code,
        cleanText(body.description, 240),
        clampInt(body.discountPercent, 0, 100),
        cleanPlanKey(body.fixedPricePlan),
        cleanText(body.commissionNote, 240),
        clampInt(body.maxRedemptions, 0, 100000),
        body.expiresAt ? new Date(body.expiresAt).toISOString() : null,
        clampInt(body.entitlementDurationDays || 90, 1, 365),
        Boolean(body.grantEntitlement),
        JSON.stringify(cleanPlanKeys(body.allowedPlanKeys)),
        body.active !== false,
        admin.userId,
        admin.email,
      ]
    );

    await writeAdminAuditLog(client, admin, {
      action: "upsert_referral_code",
      targetType: "referral_code",
      targetId: code,
      metadata: { fixedPricePlan: cleanPlanKey(body.fixedPricePlan), grantEntitlement: Boolean(body.grantEntitlement) },
    });

    return result.rows[0];
  });
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanPlanKey(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

function cleanPlanKeys(value) {
  const list = Array.isArray(value)
    ? value
    : String(value || "").split(",");
  return [...new Set(list.map(cleanPlanKey).filter(Boolean))].slice(0, 10);
}

function clampInt(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}
