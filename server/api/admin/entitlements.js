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

const PRODUCT = "irish-theory-test-coach";

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
    const permission = req.method === "POST" ? "manage_entitlements" : "view_users";
    const admin = await requireAdmin(req, env.databaseUrl, { permission });
    if (testAuthzOk(req, res, admin, permission)) return;

    if (req.method === "GET") {
      const q = String(req.query.q || "").trim().toLowerCase();
      const entitlements = await listEntitlements(env.databaseUrl, q);
      return res.status(200).json({ ok: true, entitlements });
    }

    const body = await readJsonBody(req);
    const result = await mutateEntitlement(env.databaseUrl, admin, body);
    return res.status(200).json({ ok: true, entitlement: result });
  } catch (error) {
    return sendAdminError(res, error, "Admin entitlement request failed");
  }
}

async function listEntitlements(databaseUrl, q) {
  return withDb(databaseUrl, async (client) => {
    const result = await client.query(
      `
        select e.email,
               u.role,
               e.product,
               e.active,
               e.source,
               e.expires_at,
               e.revoked_at,
               e.created_at,
               e.updated_at
        from entitlements e
        left join users u on lower(u.email) = lower(e.email)
        where e.product = $1
          and ($2 = '' or lower(e.email) like '%' || $2 || '%')
        order by e.updated_at desc
        limit 100
      `,
      [PRODUCT, q]
    );
    return result.rows.map(formatEntitlement);
  });
}

async function mutateEntitlement(databaseUrl, admin, body) {
  const email = normalizeEmail(body.email);
  const action = String(body.action || "").trim();
  const days = Number(body.days || 0);
  const expiresAt = parseExpiresAt(body.expiresAt, days);

  if (!email || !email.includes("@")) {
    const error = new Error("Valid email is required");
    error.statusCode = 400;
    throw error;
  }

  if (!["grant", "revoke", "extend"].includes(action)) {
    const error = new Error("Unsupported entitlement action");
    error.statusCode = 400;
    throw error;
  }

  if (action === "extend" && !expiresAt && (!Number.isFinite(days) || days <= 0)) {
    const error = new Error("Extend requires a date or positive day count");
    error.statusCode = 400;
    throw error;
  }

  if (action === "revoke" && body.confirm !== true) {
    const error = new Error("Confirmation is required for revoking access.");
    error.statusCode = 400;
    throw error;
  }

  return withTransaction(databaseUrl, async (client) => {
    const beforeResult = await client.query(
      `
        select email, product, active, source, expires_at, revoked_at, updated_at
        from entitlements
        where lower(email) = lower($1)
          and product = $2
        limit 1
      `,
      [email, PRODUCT]
    );
    const beforeState = beforeResult.rows[0] || null;

    await client.query(
      `
        insert into users (email)
        values ($1)
        on conflict (email) do nothing
      `,
      [email]
    );

    if (action === "revoke") {
      await client.query(
        `
          insert into entitlements (email, product, active, source, revoked_at, updated_at)
          values ($1, $2, false, 'admin', now(), now())
          on conflict (email, product) do update
          set active = false,
              source = 'admin',
              revoked_at = now(),
              updated_at = now()
        `,
        [email, PRODUCT]
      );
    } else if (action === "grant") {
      await client.query(
        `
          insert into entitlements (email, product, active, source, expires_at, revoked_at, updated_at)
          values ($1, $2, true, 'admin', $3, null, now())
          on conflict (email, product) do update
          set active = true,
              source = 'admin',
              expires_at = $3,
              revoked_at = null,
              updated_at = now()
        `,
        [email, PRODUCT, expiresAt]
      );
    } else {
      await client.query(
        `
          insert into entitlements (email, product, active, source, expires_at, revoked_at, updated_at)
          values ($1, $2, true, 'admin', coalesce($3, now() + ($4::int * interval '1 day')), null, now())
          on conflict (email, product) do update
          set active = true,
              source = 'admin',
              expires_at = case
                when $3::timestamptz is not null then $3
                when $4::int > 0 then greatest(coalesce(entitlements.expires_at, now()), now()) + ($4::int * interval '1 day')
                else entitlements.expires_at
              end,
              revoked_at = null,
              updated_at = now()
        `,
        [email, PRODUCT, expiresAt, Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 0]
      );
    }

    const result = await client.query(
      `
        select email, product, active, source, expires_at, revoked_at, created_at, updated_at
        from entitlements
        where lower(email) = lower($1)
          and product = $2
        limit 1
      `,
      [email, PRODUCT]
    );
    const entitlement = formatEntitlement(result.rows[0]);

    await writeAdminAuditLog(client, admin, {
      action: `entitlement.${action}`,
      targetType: "entitlement",
      targetEmail: email,
      beforeState,
      afterState: result.rows[0] || null,
      reason: cleanOptionalText(body.reason, 500),
      metadata: {
        product: PRODUCT,
        expiresAt,
        days,
      },
    });

    return entitlement;
  });
}

function parseExpiresAt(value, days) {
  if (value) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  if (Number.isFinite(days) && days > 0) {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  return null;
}

function cleanOptionalText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function formatEntitlement(row) {
  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : null;
  return {
    email: row.email,
    role: row.role || "user",
    product: row.product,
    active: Boolean(row.active) && !row.revoked_at && (!expiresAt || expiresAt > Date.now()),
    rawActive: Boolean(row.active),
    source: row.source,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
