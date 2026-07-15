import {
  requireAdmin,
  sendAdminError,
  testAuthzOk,
  writeAdminAuditLog,
} from "../../../lib/admin.js";
import { readJsonBody } from "../../../lib/auth.js";
import { withDb, withTransaction } from "../../../lib/db.js";
import { revokeInstructorCode } from "../../../lib/instructor-codes.js";
import {
  getAuthServerEnv,
  sendSafeConfigError,
} from "../../../lib/server-env.js";

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

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
      const payload = await loadInstructorOperations(env.databaseUrl, req.query || {});
      return res.status(200).json({ ok: true, ...payload });
    }

    const body = await readJsonBody(req);
    const result = await mutateInstructorOperations(env.databaseUrl, admin, body);
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    return sendAdminError(res, error, "Admin instructors failed");
  }
}

async function loadInstructorOperations(databaseUrl, query) {
  const q = cleanText(query.q, 160).toLowerCase();
  const status = cleanText(query.status, 40);
  const limit = clampInt(query.limit, 1, 100, 50);
  const offset = clampInt(query.offset, 0, 10000, 0);

  return withDb(databaseUrl, async (client) => {
    const [accounts, packs, codes, redemptions, performance] = await Promise.all([
      client.query(
        `
          select ia.id,
                 ia.email,
                 ia.name,
                 ia.organisation,
                 ia.notes,
                 ia.created_at,
                 ia.updated_at,
                 count(distinct ic.code)::int as code_count,
                 count(distinct ic.code) filter (where ic.status = 'used')::int as used_codes,
                 count(distinct p.id)::int as pack_purchases
          from instructor_accounts ia
          left join instructor_codes ic on ic.instructor_account_id = ia.id
          left join purchases p on lower(p.email) = lower(ia.email) and p.plan_key like 'instructor_%'
          where ($1 = '' or lower(ia.email) like '%' || $1 || '%' or lower(coalesce(ia.organisation, '')) like '%' || $1 || '%')
          group by ia.id
          order by ia.updated_at desc
          limit $2 offset $3
        `,
        [q, limit, offset]
      ),
      client.query(
        `
          select p.id, p.email, p.amount, p.currency, p.status, p.plan_key,
                 p.stripe_checkout_session_id, p.environment, p.created_at,
                 count(ic.code)::int as generated_codes,
                 count(ic.code) filter (where ic.status = 'used')::int as used_codes
          from purchases p
          left join instructor_codes ic on ic.purchase_id = p.id
          where p.plan_key like 'instructor_%'
          group by p.id
          order by p.created_at desc
          limit 100
        `
      ),
      client.query(
        `
          select code, purchase_email, plan_key, status, redemption_count, max_redemptions,
                 entitlement_duration_days, expires_at, redeemed_by_email, redeemed_at,
                 revoked_at, created_at, updated_at
          from instructor_codes
          where ($1 = '' or status = $1)
          order by created_at desc
          limit $2 offset $3
        `,
        [status, limit, offset]
      ),
      client.query(
        `
          select icr.code, icr.email, icr.status, icr.created_at, ic.purchase_email
          from instructor_code_redemptions icr
          left join instructor_codes ic on ic.code = icr.code
          order by icr.created_at desc
          limit 100
        `
      ),
      client.query(
        `
          select coalesce(purchase_email, 'unknown') as instructor_email,
                 count(*)::int as codes,
                 count(*) filter (where status = 'used')::int as used,
                 count(*) filter (where status = 'active')::int as active,
                 count(*) filter (where status = 'revoked')::int as revoked
          from instructor_codes
          group by 1
          order by used desc, codes desc
          limit 50
        `
      ),
    ]);

    return {
      accounts: accounts.rows.map((row) => ({ ...row, maskedEmail: maskEmail(row.email) })),
      packPurchases: packs.rows,
      codes: codes.rows,
      redemptions: redemptions.rows.map((row) => ({ ...row, maskedEmail: maskEmail(row.email) })),
      performance: performance.rows,
    };
  });
}

async function mutateInstructorOperations(databaseUrl, admin, body) {
  const action = cleanText(body.action, 80);
  if (action !== "revoke_code") {
    const error = new Error("Unsupported instructor action.");
    error.statusCode = 400;
    throw error;
  }

  if (body.confirm !== true) {
    const error = new Error("Confirmation is required.");
    error.statusCode = 400;
    throw error;
  }

  const code = cleanText(body.code, 80);
  const before = await withDb(databaseUrl, async (client) => {
    const result = await client.query("select * from instructor_codes where code = $1", [code]);
    return result.rows[0] || null;
  });
  const revoked = await revokeInstructorCode(databaseUrl, code, admin);

  await withTransaction(databaseUrl, async (client) => {
    await writeAdminAuditLog(client, admin, {
      action: "instructor_code.revoke",
      targetType: "instructor_code",
      targetId: code,
      beforeState: before,
      afterState: { revoked },
      reason: cleanText(body.reason || "admin_revoked", 500),
      metadata: { code },
    });
  });

  return { revoked };
}

function maskEmail(email) {
  const [name, domain] = String(email || "").split("@");
  if (!domain) return "hidden";
  return `${name.slice(0, 2)}***@${domain}`;
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function clampInt(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}
