import {
  requireAdmin,
  sendAdminError,
  testAuthzOk,
  writeAdminAuditLog,
} from "../../../lib/admin.js";
import { normalizeEmail, readJsonBody } from "../../../lib/auth.js";
import { withDb, withTransaction } from "../../../lib/db.js";
import {
  getAuthServerEnv,
  sendSafeConfigError,
} from "../../../lib/server-env.js";

const STATUSES = new Set(["open", "waiting", "resolved", "closed"]);
const PRIORITIES = new Set(["low", "normal", "high", "urgent"]);

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
    const admin = await requireAdmin(req, env.databaseUrl, { permission: "manage_support" });
    if (testAuthzOk(req, res, admin, "manage_support")) return;

    if (req.method === "GET") {
      const cases = await listSupportCases(env.databaseUrl, req.query || {});
      return res.status(200).json({ ok: true, cases });
    }

    const body = await readJsonBody(req);
    const supportCase = await mutateSupportCase(env.databaseUrl, admin, body);
    return res.status(200).json({ ok: true, case: supportCase });
  } catch (error) {
    return sendAdminError(res, error, "Admin support failed");
  }
}

async function listSupportCases(databaseUrl, query) {
  const status = cleanText(query.status, 30);
  const category = cleanText(query.category, 80);
  const q = cleanText(query.q, 160).toLowerCase();
  const limit = clampInt(query.limit, 1, 100, 50);
  const offset = clampInt(query.offset, 0, 10000, 0);

  return withDb(databaseUrl, async (client) => {
    const result = await client.query(
      `
        select sc.id,
               sc.requester_email,
               sc.requester_name,
               sc.category,
               sc.purchase_id,
               p.stripe_checkout_session_id,
               sc.status,
               sc.priority,
               sc.assigned_admin_email,
               sc.internal_notes,
               sc.resolution,
               sc.created_by_email,
               sc.resolved_at,
               sc.created_at,
               sc.updated_at
        from support_cases sc
        left join purchases p on p.id = sc.purchase_id
        where ($1 = '' or sc.status = $1)
          and ($2 = '' or sc.category = $2)
          and (
            $3 = ''
            or lower(sc.requester_email) like '%' || $3 || '%'
            or lower(sc.category) like '%' || $3 || '%'
            or lower(coalesce(sc.internal_notes, '')) like '%' || $3 || '%'
          )
        order by
          case sc.priority when 'urgent' then 1 when 'high' then 2 when 'normal' then 3 else 4 end,
          sc.updated_at desc
        limit $4 offset $5
      `,
      [status, category, q, limit, offset]
    );
    return result.rows.map(formatSupportCase);
  });
}

async function mutateSupportCase(databaseUrl, admin, body) {
  const action = cleanText(body.action, 50);
  if (!["create", "update", "resolve"].includes(action)) {
    const error = new Error("Unsupported support action.");
    error.statusCode = 400;
    throw error;
  }

  return withTransaction(databaseUrl, async (client) => {
    if (action === "create") {
      return createSupportCase(client, admin, body);
    }

    const id = cleanUuid(body.id);
    if (!id) {
      const error = new Error("Support case ID is required.");
      error.statusCode = 400;
      throw error;
    }

    const beforeResult = await client.query("select * from support_cases where id = $1 for update", [id]);
    const before = beforeResult.rows[0];
    if (!before) {
      const error = new Error("Support case not found.");
      error.statusCode = 404;
      throw error;
    }

    const status = normalizeStatus(action === "resolve" ? "resolved" : body.status || before.status);
    const priority = normalizePriority(body.priority || before.priority);
    const notes = cleanText(body.internalNotes ?? before.internal_notes, 4000);
    const resolution = cleanText(body.resolution ?? before.resolution, 2000);

    const result = await client.query(
      `
        update support_cases
        set status = $2,
            priority = $3,
            assigned_admin_user_id = coalesce($4, assigned_admin_user_id),
            assigned_admin_email = coalesce($5, assigned_admin_email),
            internal_notes = $6,
            resolution = $7,
            resolved_at = case when $2 in ('resolved', 'closed') then coalesce(resolved_at, now()) else null end,
            updated_at = now()
        where id = $1
        returning *
      `,
      [
        id,
        status,
        priority,
        admin.userId,
        admin.email,
        notes,
        resolution,
      ]
    );
    const after = result.rows[0];

    await writeAdminAuditLog(client, admin, {
      action: `support_case.${action}`,
      targetType: "support_case",
      targetEmail: after.requester_email,
      targetId: after.id,
      beforeState: before,
      afterState: after,
      reason: cleanText(body.reason || action, 500),
      metadata: { status, priority },
    });

    return formatSupportCase(after);
  });
}

async function createSupportCase(client, admin, body) {
  const requesterEmail = normalizeEmail(body.requesterEmail || body.email);
  if (!requesterEmail || !requesterEmail.includes("@")) {
    const error = new Error("Requester email is required.");
    error.statusCode = 400;
    throw error;
  }

  const result = await client.query(
    `
      insert into support_cases (
        requester_email,
        requester_name,
        category,
        purchase_id,
        status,
        priority,
        assigned_admin_user_id,
        assigned_admin_email,
        internal_notes,
        created_by,
        created_by_email
      )
      values ($1, $2, $3, $4::uuid, 'open', $5, $6, $7, $8, $6, $7)
      returning *
    `,
    [
      requesterEmail,
      cleanText(body.requesterName, 160),
      cleanText(body.category, 80) || "general",
      cleanUuid(body.purchaseId),
      normalizePriority(body.priority),
      admin.userId,
      admin.email,
      cleanText(body.internalNotes, 4000),
    ]
  );
  const created = result.rows[0];

  await writeAdminAuditLog(client, admin, {
    action: "support_case.create",
    targetType: "support_case",
    targetEmail: requesterEmail,
    targetId: created.id,
    afterState: created,
    reason: cleanText(body.reason || "support_case_create", 500),
    metadata: { category: created.category, priority: created.priority },
  });

  return formatSupportCase(created);
}

function formatSupportCase(row) {
  return {
    id: row.id,
    requesterEmail: row.requester_email,
    maskedRequesterEmail: maskEmail(row.requester_email),
    requesterName: row.requester_name || "",
    category: row.category,
    purchaseId: row.purchase_id || null,
    stripeCheckoutSessionId: row.stripe_checkout_session_id || "",
    status: row.status,
    priority: row.priority,
    assignedAdminEmail: row.assigned_admin_email || "",
    internalNotes: row.internal_notes || "",
    resolution: row.resolution || "",
    createdByEmail: row.created_by_email || "",
    resolvedAt: row.resolved_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeStatus(value) {
  const status = cleanText(value, 30).toLowerCase();
  return STATUSES.has(status) ? status : "open";
}

function normalizePriority(value) {
  const priority = cleanText(value, 30).toLowerCase();
  return PRIORITIES.has(priority) ? priority : "normal";
}

function maskEmail(email) {
  const [name, domain] = String(email || "").split("@");
  if (!domain) return "hidden";
  return `${name.slice(0, 2)}***@${domain}`;
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanUuid(value) {
  const text = String(value || "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

function clampInt(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}
