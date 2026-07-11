import crypto from "node:crypto";
import { withDb, withTransaction } from "./db.js";
import { recordAuthAudit } from "./account-data.js";
import { renderTransactionalEmail } from "./email-templates.js";

export const SESSION_COOKIE = "ittc_session";

const PRODUCT = "irish-theory-test-coach";
const LOGIN_TOKEN_TTL_MS = 15 * 60 * 1000;
const LOGIN_RESEND_COOLDOWN_MS = 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SAFE_LOGIN_MESSAGE = "If that email has access, a login link has been sent.";

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    return req.body ? JSON.parse(req.body) : {};
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export async function createLoginTokenForEntitledEmail(email, databaseUrl, options = {}) {
  return createLoginTokenForKnownAccountEmail(email, databaseUrl, options);
}

export async function createLoginTokenForKnownAccountEmail(email, databaseUrl, options = {}) {
  const normalizedEmail = normalizeEmail(email);
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + LOGIN_TOKEN_TTL_MS);
  const metadata = requestMetadata(options.req);

  const created = await withTransaction(databaseUrl, async (client) => {
    const account = await findKnownAccount(client, normalizedEmail);
    if (!account) {
      await recordAuthAudit(client, {
        email: normalizedEmail,
        eventType: "login_link_requested_unknown_email",
        severity: "info",
        ...metadata,
      });
      return { status: "not_found" };
    }

    const recent = await client.query(
      `
        select id, expires_at, created_at
        from login_tokens
        where lower(email) = lower($1)
          and consumed_at is null
          and created_at > now() - ($2::int * interval '1 millisecond')
        order by created_at desc
        limit 1
      `,
      [normalizedEmail, LOGIN_RESEND_COOLDOWN_MS]
    );

    if (recent.rows[0]) {
      await recordAuthAudit(client, {
        userId: account.user_id,
        email: normalizedEmail,
        eventType: "login_link_resend_cooldown",
        severity: "info",
        ...metadata,
      });
      return {
        status: "cooldown",
        email: normalizedEmail,
        expiresAt: recent.rows[0].expires_at,
      };
    }

    await client.query(
      `
        insert into users (email)
        values ($1)
        on conflict (email) do nothing
      `,
      [normalizedEmail]
    );

    if (!account.user_id) {
      const userResult = await client.query(
        `
          select id
          from users
          where lower(email) = lower($1)
          limit 1
        `,
        [normalizedEmail]
      );
      account.user_id = userResult.rows[0]?.id || null;
    }

    await client.query(
      `
        update login_tokens
        set consumed_at = now()
        where lower(email) = lower($1)
          and consumed_at is null
          and expires_at > now()
      `,
      [normalizedEmail]
    );

    await client.query(
      `
        insert into login_tokens (
          email,
          token_hash,
          expires_at,
          request_ip,
          user_agent,
          origin,
          delivery_status
        )
        values ($1, $2, $3, $4, $5, $6, 'pending')
      `,
      [
        normalizedEmail,
        tokenHash,
        expiresAt.toISOString(),
        metadata.ipAddress,
        metadata.userAgent,
        metadata.origin,
      ]
    );

    await recordAuthAudit(client, {
      userId: account.user_id,
      email: normalizedEmail,
      eventType: "login_link_created",
      severity: "info",
      ...metadata,
    });

    return { status: "created", email: normalizedEmail, token, expiresAt };
  });

  return created.status === "created" ? created : null;
}

export async function markLoginTokenDelivery(databaseUrl, token, status, errorMessage = "") {
  const tokenHash = hashToken(token);
  return withDb(databaseUrl, async (client) => {
    await client.query(
      `
        update login_tokens
        set sent_at = case when $2 = 'sent' then now() else sent_at end,
            delivery_status = $2,
            delivery_error = nullif($3, '')
        where token_hash = $1
      `,
      [tokenHash, cleanText(status, 40), cleanText(errorMessage, 240)]
    );
  });
}

export async function consumeLoginToken(token, databaseUrl, options = {}) {
  const tokenHash = hashToken(token);
  const sessionToken = generateToken();
  const sessionTokenHash = hashToken(sessionToken);
  const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const metadata = requestMetadata(options.req);

  return withTransaction(databaseUrl, async (client) => {
    const tokenResult = await client.query(
      `
        select id, email, expires_at, consumed_at
        from login_tokens
        where token_hash = $1
        for update
      `,
      [tokenHash]
    );

    const loginToken = tokenResult.rows[0];
    const tokenStatus = classifyLoginToken(loginToken);
    if (tokenStatus !== "valid") {
      await recordAuthAudit(client, {
        email: loginToken?.email || null,
        eventType: `login_link_${tokenStatus}`,
        severity: tokenStatus === "not_found" ? "warning" : "info",
        ...metadata,
      });
      return { ok: false, code: tokenStatus };
    }

    const email = normalizeEmail(loginToken.email);
    const account = await findKnownAccount(client, email);
    if (!account) {
      await recordAuthAudit(client, {
        email,
        eventType: "login_link_account_missing",
        severity: "warning",
        ...metadata,
      });
      return { ok: false, code: "invalid_link" };
    }
    const entitlement = await findEntitlement(client, email);

    await client.query(
      `
        update login_tokens
        set consumed_at = now()
        where token_hash = $1
      `,
      [tokenHash]
    );

    if (options.rotateSessionTokenHash) {
      await client.query(
        `
          update sessions
          set revoked_at = now(),
              revoked_reason = 'rotated_after_login',
              last_seen_at = now()
          where session_token_hash = $1
            and revoked_at is null
        `,
        [options.rotateSessionTokenHash]
      );
    }

    await client.query(
      `
        insert into sessions (
          user_id,
          email,
          session_token_hash,
          expires_at,
          ip_address,
          user_agent
        )
        values ($1, $2, $3, $4, $5, $6)
      `,
      [
        account.user_id,
        email,
        sessionTokenHash,
        sessionExpiresAt.toISOString(),
        metadata.ipAddress,
        metadata.userAgent,
      ]
    );

    await client.query(
      `
        update users
        set last_login_at = now(),
            last_active_at = now(),
            updated_at = now()
        where lower(email) = lower($1)
      `,
      [email]
    );

    await recordAuthAudit(client, {
      userId: account.user_id,
      email,
      eventType: "login_link_consumed",
      severity: "info",
      ...metadata,
    });

    return {
      ok: true,
      email,
      sessionToken,
      expiresAt: sessionExpiresAt,
      entitlement: entitlementSummary(entitlement),
    };
  });
}

export async function createSessionForEntitledEmail(email, databaseUrl, options = {}) {
  const normalizedEmail = normalizeEmail(email);
  const sessionToken = generateToken();
  const sessionTokenHash = hashToken(sessionToken);
  const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const metadata = requestMetadata(options.req);

  return withTransaction(databaseUrl, async (client) => {
    const entitlement = await findActiveEntitlement(client, normalizedEmail);
    if (!entitlement) return null;

    await client.query(
      `
        insert into users (email)
        values ($1)
        on conflict (email) do nothing
      `,
      [normalizedEmail]
    );

    const account = await findKnownAccount(client, normalizedEmail);

    await client.query(
      `
        insert into sessions (
          user_id,
          email,
          session_token_hash,
          expires_at,
          ip_address,
          user_agent
        )
        values ($1, $2, $3, $4, $5, $6)
      `,
      [
        account?.user_id || null,
        normalizedEmail,
        sessionTokenHash,
        sessionExpiresAt.toISOString(),
        metadata.ipAddress,
        metadata.userAgent,
      ]
    );

    return {
      email: normalizedEmail,
      sessionToken,
      expiresAt: sessionExpiresAt,
      entitlement: entitlementSummary(entitlement),
    };
  });
}

export async function getSessionUser(req, databaseUrl) {
  const sessionToken = getCookie(req, SESSION_COOKIE);
  if (!sessionToken) return null;

  const sessionTokenHash = hashToken(sessionToken);
  return withDb(databaseUrl, async (client) => {
    const result = await client.query(
      `
        select u.id as user_id,
               u.role,
               s.id as session_id,
               s.email,
               e.active as entitlement_active,
               e.product,
               e.expires_at as entitlement_expires_at,
               e.revoked_at as entitlement_revoked_at
        from sessions s
        join users u
          on lower(u.email) = lower(s.email)
        left join entitlements e
         on lower(e.email) = lower(s.email)
         and e.product = $2
         and e.revoked_at is null
         and (e.expires_at is null or e.expires_at > now())
        where s.session_token_hash = $1
          and s.revoked_at is null
          and s.expires_at > now()
        limit 1
      `,
      [sessionTokenHash, PRODUCT]
    );

    const session = result.rows[0];
    if (!session) return null;

    await client.query(
      `
        update sessions
        set last_seen_at = now()
        where session_token_hash = $1
      `,
      [sessionTokenHash]
    );

    await client.query(
      `
        update users
        set last_active_at = now(),
            updated_at = now()
        where id = $1
      `,
      [session.user_id]
    );

    return {
      userId: session.user_id,
      sessionId: session.session_id,
      email: normalizeEmail(session.email),
      role: session.role || "user",
      entitlement: {
        active: Boolean(session.entitlement_active),
        product: session.product || PRODUCT,
        expiresAt: session.entitlement_expires_at || null,
        revokedAt: session.entitlement_revoked_at || null,
      },
    };
  });
}

export async function revokeSession(req, databaseUrl, reason = "logout") {
  const sessionToken = getCookie(req, SESSION_COOKIE);
  if (!sessionToken) return false;

  const sessionTokenHash = hashToken(sessionToken);
  return withDb(databaseUrl, async (client) => {
    const result = await client.query(
      `
        update sessions
        set revoked_at = now(),
            revoked_reason = $2,
            last_seen_at = now()
        where session_token_hash = $1
          and revoked_at is null
      `,
      [sessionTokenHash, cleanText(reason, 80)]
    );
    return result.rowCount > 0;
  });
}

export async function revokeAllSessionsForUser(databaseUrl, sessionUser, reason = "logout_all") {
  return withTransaction(databaseUrl, async (client) => {
    const result = await client.query(
      `
        update sessions
        set revoked_at = now(),
            revoked_reason = $3,
            last_seen_at = now()
        where revoked_at is null
          and (
            user_id = $1
            or lower(email) = lower($2)
          )
      `,
      [sessionUser.userId, sessionUser.email, cleanText(reason, 80)]
    );
    await recordAuthAudit(client, {
      userId: sessionUser.userId,
      email: sessionUser.email,
      eventType: "sessions_revoked_all",
      severity: "info",
      metadata: { revokedCount: result.rowCount },
    });
    return result.rowCount;
  });
}

export async function deliverMagicLink({ email, link, env }) {
  const configured = Boolean(env.emailProviderApiKey && env.emailFrom);
  if (!configured) {
    if (!env.isProduction && link) {
      console.info("Magic login link for local testing:", link);
      return { configured: false, sent: false };
    }
    const error = new Error("Email provider is not configured.");
    error.code = "EMAIL_PROVIDER_MISSING";
    throw error;
  }

  const emailContent = renderTransactionalEmail("login_link", { link });

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.emailProviderApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.emailFrom,
      to: [email],
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
    }),
  });

  if (!response.ok) {
    throw new Error("Email provider rejected the login email.");
  }

  return { configured: true, sent: true };
}

export function buildLoginLink(publicSiteUrl, token) {
  const url = new URL(publicSiteUrl);
  url.pathname = "/account";
  url.searchParams.set("login_token", token);
  return url.toString();
}

export function buildSessionCookie(sessionToken, env) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return [
    `${SESSION_COOKIE}=${sessionToken}`,
    "HttpOnly",
    "Path=/",
    `Max-Age=${maxAge}`,
    "SameSite=Lax",
    shouldUseSecureCookie(env) ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function buildClearSessionCookie(env) {
  return [
    `${SESSION_COOKIE}=`,
    "HttpOnly",
    "Path=/",
    "Max-Age=0",
    "SameSite=Lax",
    shouldUseSecureCookie(env) ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

function findActiveEntitlement(client, email) {
  return client
    .query(
      `
        select email, product, active, expires_at, revoked_at
        from entitlements
        where lower(email) = lower($1)
          and product = $2
          and active = true
          and revoked_at is null
          and (expires_at is null or expires_at > now())
        limit 1
      `,
      [email, PRODUCT]
    )
    .then((result) => result.rows[0] || null);
}

function findEntitlement(client, email) {
  return client
    .query(
      `
        select email, product, active, expires_at, revoked_at
        from entitlements
        where lower(email) = lower($1)
          and product = $2
        order by updated_at desc
        limit 1
      `,
      [email, PRODUCT]
    )
    .then((result) => result.rows[0] || null);
}

function findKnownAccount(client, email) {
  return client
    .query(
      `
        select u.id as user_id, u.email
        from users u
        where lower(u.email) = lower($1)
        union
        select u.id as user_id, p.email
        from purchases p
        left join users u on lower(u.email) = lower(p.email)
        where lower(p.email) = lower($1)
        union
        select u.id as user_id, e.email
        from entitlements e
        left join users u on lower(u.email) = lower(e.email)
        where lower(e.email) = lower($1)
        limit 1
      `,
      [email]
    )
    .then((result) => result.rows[0] || null);
}

export function classifyLoginToken(row, now = new Date()) {
  if (!row) return "not_found";
  if (row.consumed_at) return "used_link";
  if (new Date(row.expires_at).getTime() <= now.getTime()) return "expired_link";
  return "valid";
}

function entitlementSummary(entitlement) {
  if (!entitlement) {
    return {
      active: false,
      expired: false,
      product: PRODUCT,
      expiresAt: null,
    };
  }

  const expired = entitlement.expires_at && new Date(entitlement.expires_at).getTime() <= Date.now();
  return {
    active: Boolean(entitlement.active) && !expired && !entitlement.revoked_at,
    expired: Boolean(expired),
    product: entitlement.product || PRODUCT,
    expiresAt: entitlement.expires_at || null,
    revokedAt: entitlement.revoked_at || null,
  };
}

export function validateRequestOrigin(req, publicSiteUrl, options = {}) {
  const expected = new URL(publicSiteUrl).origin;
  const origin = String(req.headers?.origin || "");
  const referer = String(req.headers?.referer || "");
  let supplied = origin;
  if (!supplied && referer) {
    try {
      supplied = new URL(referer).origin;
    } catch {
      supplied = "invalid";
    }
  }
  if (!supplied) return { ok: true, expected, supplied: "" };
  const ok = supplied === expected || (!options.isProduction && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(supplied));
  return { ok, expected, supplied };
}

export function loginRequestSafeMessage() {
  return SAFE_LOGIN_MESSAGE;
}

function getCookie(req, name) {
  const header = req.headers?.cookie || "";
  return String(header)
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) || "";
}

function shouldUseSecureCookie(env) {
  return env.isProduction || String(env.publicSiteUrl || "").startsWith("https://");
}

function generateToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token), "utf8").digest("hex");
}

function requestMetadata(req) {
  return {
    ipAddress: clientIp(req),
    userAgent: cleanText(req?.headers?.["user-agent"], 240),
    origin: cleanText(req?.headers?.origin || req?.headers?.referer, 240),
  };
}

function clientIp(req) {
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return cleanText(forwarded || req?.socket?.remoteAddress || "", 80);
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
