import crypto from "node:crypto";
import { withTransaction } from "./db.js";
import { normalizeEmail } from "./auth.js";
import { PRODUCT_KEY } from "../shared/pricing-config.js";

const CODE_PREFIX = "ITTC";

export async function generateInstructorCodesForPurchase(client, purchase, plan) {
  const codeCount = Number(plan?.codeCount || 0);
  if (!codeCount) return [];

  const email = normalizeEmail(purchase.email);
  const instructor = await upsertInstructorAccount(client, email);
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const generated = [];

  for (let index = 0; index < codeCount; index += 1) {
    const code = await createUniqueInstructorCode(client);
    await client.query(
      `
        insert into instructor_codes (
          code,
          instructor_account_id,
          purchase_id,
          purchase_email,
          plan_key,
          status,
          max_redemptions,
          entitlement_duration_days,
          expires_at
        )
        values ($1, $2, $3, $4, $5, 'active', 1, $6, $7)
        on conflict (code) do nothing
      `,
      [
        code,
        instructor.id,
        purchase.id,
        email,
        plan.key,
        Number(plan.entitlementDays || 90),
        expiresAt,
      ]
    );
    generated.push(code);
  }

  return generated;
}

export async function lookupInstructorCode(databaseUrl, rawCode) {
  const code = normalizeInstructorCode(rawCode);
  if (!code) return null;

  return withTransaction(databaseUrl, async (client) => {
    const result = await client.query(
      `
        select code, status, max_redemptions, redemption_count, entitlement_duration_days, expires_at
        from instructor_codes
        where code = $1
        limit 1
      `,
      [code]
    );
    const row = result.rows[0];
    if (!row || !isRedeemable(row)) return null;
    return {
      code: row.code,
      entitlementDurationDays: Number(row.entitlement_duration_days || 90),
      expiresAt: row.expires_at || null,
    };
  });
}

export async function redeemInstructorCode(databaseUrl, rawCode, rawEmail, options = {}) {
  const code = normalizeInstructorCode(rawCode);
  const email = normalizeEmail(rawEmail);
  if (!code || !email) {
    throw new Error("Code could not be applied.");
  }

  return withTransaction(databaseUrl, async (client) => {
    const result = await client.query(
      `
        select *
        from instructor_codes
        where code = $1
        for update
      `,
      [code]
    );

    const row = result.rows[0];
    if (!row || !isRedeemable(row)) {
      throw new Error("Code could not be applied.");
    }

    await client.query(
      `
        insert into users (email)
        values ($1)
        on conflict (email) do nothing
      `,
      [email]
    );

    const userResult = await client.query(
      `
        select id
        from users
        where lower(email) = lower($1)
        limit 1
      `,
      [email]
    );
    const userId = userResult.rows[0]?.id || null;
    const entitlementDays = Number(row.entitlement_duration_days || 90);

    await client.query(
      `
        insert into entitlements (email, product, active, source, expires_at)
        values ($1, $2, true, 'instructor_code', now() + ($3::int * interval '1 day'))
        on conflict (email, product) do update
        set active = true,
            source = 'instructor_code',
            expires_at = greatest(coalesce(entitlements.expires_at, now()), now()) + ($3::int * interval '1 day'),
            revoked_at = null,
            updated_at = now()
      `,
      [email, PRODUCT_KEY, entitlementDays]
    );

    await client.query(
      `
        update instructor_codes
        set status = case when redemption_count + 1 >= max_redemptions then 'used' else status end,
            redemption_count = redemption_count + 1,
            redeemed_by_email = coalesce(redeemed_by_email, $2),
            redeemed_by_user_id = coalesce(redeemed_by_user_id, $3),
            redeemed_at = coalesce(redeemed_at, now()),
            updated_at = now()
        where code = $1
      `,
      [code, email, userId]
    );

    await client.query(
      `
        insert into instructor_code_redemptions (
          code,
          email,
          user_id,
          status,
          ip_address,
          user_agent,
          metadata
        )
        values ($1, $2, $3, 'redeemed', $4, $5, $6::jsonb)
      `,
      [
        code,
        email,
        userId,
        cleanText(options.ipAddress, 80),
        cleanText(options.userAgent, 240),
        JSON.stringify({ anonymousId: cleanText(options.anonymousId, 160) }),
      ]
    );

    return { code, email, entitlementDurationDays: entitlementDays };
  });
}

export async function revokeInstructorCode(databaseUrl, rawCode, actor = {}) {
  const code = normalizeInstructorCode(rawCode);
  if (!code) throw new Error("Code could not be revoked.");

  return withTransaction(databaseUrl, async (client) => {
    const result = await client.query(
      `
        update instructor_codes
        set status = 'revoked',
            revoked_at = now(),
            revoked_by = $2,
            revoked_by_email = $3,
            updated_at = now()
        where code = $1
          and status <> 'revoked'
        returning code
      `,
      [code, actor.userId || null, normalizeEmail(actor.email)]
    );
    return Boolean(result.rows[0]);
  });
}

export function normalizeInstructorCode(value) {
  return String(value || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 40);
}

function isRedeemable(row) {
  if (!row || row.status !== "active") return false;
  if (Number(row.redemption_count || 0) >= Number(row.max_redemptions || 1)) return false;
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return false;
  return true;
}

async function upsertInstructorAccount(client, email) {
  await client.query(
    `
      insert into instructor_accounts (email)
      values ($1)
      on conflict (email) do update
      set updated_at = now()
    `,
    [email]
  );
  const result = await client.query(
    `
      select id, email
      from instructor_accounts
      where lower(email) = lower($1)
      limit 1
    `,
    [email]
  );
  return result.rows[0];
}

async function createUniqueInstructorCode(client) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = `${CODE_PREFIX}${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
    const existing = await client.query(
      `
        select code
        from instructor_codes
        where code = $1
      `,
      [code]
    );
    if (!existing.rows[0]) return code;
  }
  throw new Error("Could not generate a unique instructor code.");
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
