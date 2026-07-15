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
    const admin = await requireAdmin(req, env.databaseUrl, { permission: "view_audit" });
    if (testAuthzOk(req, res, admin, "view_audit")) return;
    const payload = await listAuditLog(env.databaseUrl, req.query || {});
    return res.status(200).json({ ok: true, ...payload });
  } catch (error) {
    return sendAdminError(res, error, "Admin audit failed");
  }
}

async function listAuditLog(databaseUrl, query) {
  const action = cleanText(query.action, 120);
  const targetType = cleanText(query.targetType, 120);
  const q = cleanText(query.q, 160).toLowerCase();
  const limit = clampInt(query.limit, 1, 100, 50);
  const offset = clampInt(query.offset, 0, 10000, 0);

  return withDb(databaseUrl, async (client) => {
    const [rows, count] = await Promise.all([
      client.query(
        `
          select id,
                 admin_email,
                 action,
                 target_type,
                 target_email,
                 target_id,
                 before_state,
                 after_state,
                 reason,
                 request_correlation_id,
                 metadata,
                 created_at
          from admin_audit_log
          where ($1 = '' or action = $1)
            and ($2 = '' or target_type = $2)
            and (
              $3 = ''
              or lower(admin_email) like '%' || $3 || '%'
              or lower(coalesce(target_email, '')) like '%' || $3 || '%'
              or lower(coalesce(target_id, '')) like '%' || $3 || '%'
              or lower(action) like '%' || $3 || '%'
            )
          order by created_at desc
          limit $4 offset $5
        `,
        [action, targetType, q, limit, offset]
      ),
      client.query(
        `
          select count(*)::int as total
          from admin_audit_log
          where ($1 = '' or action = $1)
            and ($2 = '' or target_type = $2)
            and (
              $3 = ''
              or lower(admin_email) like '%' || $3 || '%'
              or lower(coalesce(target_email, '')) like '%' || $3 || '%'
              or lower(coalesce(target_id, '')) like '%' || $3 || '%'
              or lower(action) like '%' || $3 || '%'
            )
        `,
        [action, targetType, q]
      ),
    ]);

    return {
      audit: rows.rows,
      pagination: {
        total: Number(count.rows[0]?.total || 0),
        limit,
        offset,
      },
    };
  });
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function clampInt(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}
