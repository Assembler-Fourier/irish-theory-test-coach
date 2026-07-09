import { requireAdmin, sendAdminError } from "../../../lib/admin.js";
import { withDb } from "../../../lib/db.js";
import {
  getAuthServerEnv,
  safeErrorSummary,
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
    await requireAdmin(req, env.databaseUrl);
    const q = String(req.query.q || "").trim().toLowerCase();
    const users = await searchUsers(env.databaseUrl, q);
    return res.status(200).json({ ok: true, users });
  } catch (error) {
    console.error("Admin users failed", safeErrorSummary(error));
    return sendAdminError(res, error);
  }
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

function isEntitlementLive(row) {
  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : null;
  return Boolean(row.entitlement_active) &&
    !row.revoked_at &&
    (!expiresAt || expiresAt > Date.now());
}
