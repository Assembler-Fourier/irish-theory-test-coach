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
  safeErrorSummary,
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
    const permission = req.method === "POST" ? "manage_users" : "view_users";
    const admin = await requireAdmin(req, env.databaseUrl, { permission });
    if (testAuthzOk(req, res, admin, permission)) return;

    if (req.method === "POST") {
      const body = await readJsonBody(req);
      const result = await mutateUserOperations(env.databaseUrl, admin, body);
      return res.status(200).json({ ok: true, ...result });
    }

    const q = String(req.query.q || "").trim().toLowerCase();
    const detailEmail = normalizeEmail(req.query.email || "");
    if (detailEmail) {
      const user = await loadUserDetail(env.databaseUrl, detailEmail);
      return res.status(200).json({ ok: true, user });
    }
    const users = await searchUsers(env.databaseUrl, q);
    return res.status(200).json({ ok: true, users });
  } catch (error) {
    console.error("Admin users failed", safeErrorSummary(error));
    return sendAdminError(res, error);
  }
}

async function loadUserDetail(databaseUrl, email) {
  return withDb(databaseUrl, async (client) => {
    const userResult = await client.query(
      `
        select id, email, role, display_name, created_at, last_login_at, last_active_at, delete_requested_at
        from users
        where lower(email) = lower($1)
        limit 1
      `,
      [email]
    );
    const user = userResult.rows[0];
    if (!user) return null;

    const [
      entitlements,
      purchases,
      sessions,
      progress,
      supportCases,
      deletionRequests,
    ] = await Promise.all([
      client.query(
        `
          select product, active, source, expires_at, revoked_at, created_at, updated_at
          from entitlements
          where lower(email) = lower($1)
          order by updated_at desc
        `,
        [email]
      ),
      client.query(
        `
          select id, stripe_checkout_session_id, stripe_payment_intent_id, amount, currency,
                 status, plan_key, referral_code, environment, refunded_amount, disputed_amount,
                 entitlement_effect, created_at, updated_at
          from purchases
          where lower(email) = lower($1)
          order by created_at desc
          limit 50
        `,
        [email]
      ),
      client.query(
        `
          select id, expires_at, revoked_at, revoked_reason, ip_address, user_agent, last_seen_at, created_at
          from sessions
          where lower(email) = lower($1)
          order by last_seen_at desc
          limit 20
        `,
        [email]
      ),
      client.query(
        `
          select count(*)::int as attempts,
                 count(*) filter (where correct)::int as correct,
                 count(distinct question_id)::int as distinct_questions,
                 max(created_at) as last_attempt_at,
                 (select count(*)::int from flags where lower(email) = lower($1)) as flags,
                 (select count(*)::int from mock_sessions where lower(email) = lower($1)) as mocks
          from attempts
          where lower(email) = lower($1)
        `,
        [email]
      ),
      client.query(
        `
          select id, category, status, priority, assigned_admin_email, internal_notes,
                 resolution, created_at, updated_at, resolved_at
          from support_cases
          where lower(requester_email) = lower($1)
          order by updated_at desc
          limit 30
        `,
        [email]
      ),
      client.query(
        `
          select id, reason, status, created_at, updated_at, resolved_at
          from account_deletion_requests
          where lower(email) = lower($1)
          order by created_at desc
          limit 10
        `,
        [email]
      ),
    ]);

    return {
      email: user.email,
      maskedEmail: maskEmail(user.email),
      role: user.role,
      displayName: user.display_name || "",
      createdAt: user.created_at,
      lastLoginAt: user.last_login_at,
      lastActiveAt: user.last_active_at,
      deleteRequestedAt: user.delete_requested_at,
      entitlements: entitlements.rows,
      purchases: purchases.rows,
      sessions: sessions.rows,
      progressSummary: {
        attempts: Number(progress.rows[0]?.attempts || 0),
        correct: Number(progress.rows[0]?.correct || 0),
        distinctQuestions: Number(progress.rows[0]?.distinct_questions || 0),
        flags: Number(progress.rows[0]?.flags || 0),
        mocks: Number(progress.rows[0]?.mocks || 0),
        lastAttemptAt: progress.rows[0]?.last_attempt_at || null,
      },
      supportCases: supportCases.rows,
      deletionRequests: deletionRequests.rows,
    };
  });
}

async function mutateUserOperations(databaseUrl, admin, body) {
  const email = normalizeEmail(body.email);
  const action = String(body.action || "").trim();
  const reason = cleanText(body.reason, 500);

  if (!email || !email.includes("@")) {
    const error = new Error("Valid email is required.");
    error.statusCode = 400;
    throw error;
  }

  if (!["revoke_sessions", "account_export_request", "account_deletion_request"].includes(action)) {
    const error = new Error("Unsupported user operation.");
    error.statusCode = 400;
    throw error;
  }

  if (action === "revoke_sessions" && body.confirm !== true) {
    const error = new Error("Confirmation is required.");
    error.statusCode = 400;
    throw error;
  }

  return withTransaction(databaseUrl, async (client) => {
    await client.query(
      `
        insert into users (email)
        values ($1)
        on conflict (email) do nothing
      `,
      [email]
    );

    let result = {};
    let beforeState = null;
    let afterState = null;

    if (action === "revoke_sessions") {
      const before = await client.query(
        `
          select count(*)::int as active_sessions
          from sessions
          where lower(email) = lower($1)
            and revoked_at is null
            and expires_at > now()
        `,
        [email]
      );
      beforeState = before.rows[0];
      const update = await client.query(
        `
          update sessions
          set revoked_at = now(),
              revoked_reason = 'admin_revoked',
              last_seen_at = now()
          where lower(email) = lower($1)
            and revoked_at is null
          returning id
        `,
        [email]
      );
      result = { revokedSessions: update.rowCount };
      afterState = { revokedSessions: update.rowCount };
    }

    if (action === "account_export_request") {
      const supportCase = await insertSupportCase(client, admin, {
        email,
        category: "account_export",
        priority: "normal",
        internalNotes: reason || "Admin-created export request.",
      });
      result = { supportCase };
      afterState = supportCase;
    }

    if (action === "account_deletion_request") {
      const deletion = await client.query(
        `
          insert into account_deletion_requests (email, reason, status)
          values ($1, $2, 'requested')
          returning id, email, reason, status, created_at
        `,
        [email, reason]
      );
      const supportCase = await insertSupportCase(client, admin, {
        email,
        category: "account_deletion",
        priority: "high",
        internalNotes: reason || "Admin-created deletion request.",
      });
      result = { deletionRequest: deletion.rows[0], supportCase };
      afterState = result;
    }

    await writeAdminAuditLog(client, admin, {
      action: `user.${action}`,
      targetType: "user",
      targetEmail: email,
      beforeState,
      afterState,
      reason,
      metadata: { action },
    });

    return result;
  });
}

async function insertSupportCase(client, admin, data) {
  const result = await client.query(
    `
      insert into support_cases (
        requester_email,
        category,
        priority,
        status,
        assigned_admin_user_id,
        assigned_admin_email,
        internal_notes,
        created_by,
        created_by_email
      )
      values ($1, $2, $3, 'open', $4, $5, $6, $4, $5)
      returning id, requester_email, category, priority, status, assigned_admin_email,
                internal_notes, created_at, updated_at
    `,
    [
      data.email,
      cleanText(data.category, 80) || "general",
      cleanText(data.priority, 30) || "normal",
      admin.userId,
      admin.email,
      cleanText(data.internalNotes, 3000),
    ]
  );
  return result.rows[0];
}

async function searchUsers(databaseUrl, q) {
  return withDb(databaseUrl, async (client) => {
    const result = await client.query(
      `
        select u.email,
               u.role,
               u.display_name,
               u.created_at,
               u.last_login_at,
               e.active as entitlement_active,
               e.expires_at,
               e.revoked_at,
               e.source as entitlement_source,
               count(distinct p.id)::int as purchase_count,
               count(distinct a.id)::int as attempt_count,
               count(distinct f.id)::int as flag_count,
               coalesce(
                 jsonb_agg(
                   distinct jsonb_build_object(
                     'checkoutSessionId', p.stripe_checkout_session_id,
                     'paymentIntentId', p.stripe_payment_intent_id,
                     'amount', p.amount,
                     'currency', p.currency,
                     'status', p.status,
                     'createdAt', p.created_at
                   )
                 ) filter (where p.id is not null),
                 '[]'::jsonb
               ) as purchases
        from users u
        left join entitlements e
          on lower(e.email) = lower(u.email)
         and e.product = 'irish-theory-test-coach'
        left join purchases p on lower(p.email) = lower(u.email)
        left join attempts a on a.user_id = u.id
        left join flags f on f.user_id = u.id
        where ($1 = '' or lower(u.email) like '%' || $1 || '%')
        group by u.email, u.role, u.display_name, u.created_at, u.last_login_at,
                 e.active, e.expires_at, e.revoked_at, e.source
        order by u.created_at desc
        limit 50
      `,
      [q]
    );

    return result.rows.map((row) => ({
      email: row.email,
      maskedEmail: maskEmail(row.email),
      role: row.role,
      displayName: row.display_name,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
      entitlement: {
        active: isEntitlementLive(row),
        rawActive: Boolean(row.entitlement_active),
        source: row.entitlement_source,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at,
      },
      purchaseCount: row.purchase_count,
      attemptCount: row.attempt_count,
      flagCount: row.flag_count,
      purchases: row.purchases || [],
    }));
  });
}

function maskEmail(email) {
  const [name, domain] = String(email || "").split("@");
  if (!domain) return "hidden";
  return `${name.slice(0, 2)}***@${domain}`;
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function isEntitlementLive(row) {
  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : null;
  return Boolean(row.entitlement_active) &&
    !row.revoked_at &&
    (!expiresAt || expiresAt > Date.now());
}
