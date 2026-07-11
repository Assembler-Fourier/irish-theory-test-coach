import crypto from "node:crypto";
import { withDb, withTransaction } from "./db.js";

export const SESSION_COOKIE = "ittc_session";

const PRODUCT = "irish-theory-test-coach";
const LOGIN_TOKEN_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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

export async function createLoginTokenForEntitledEmail(email, databaseUrl) {
  const normalizedEmail = normalizeEmail(email);
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + LOGIN_TOKEN_TTL_MS);

  const created = await withTransaction(databaseUrl, async (client) => {
    const entitlement = await findActiveEntitlement(client, normalizedEmail);
    if (!entitlement) return false;

    await client.query(
      `
        insert into users (email)
        values ($1)
        on conflict (email) do nothing
      `,
      [normalizedEmail]
    );

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
        insert into login_tokens (email, token_hash, expires_at)
        values ($1, $2, $3)
      `,
      [normalizedEmail, tokenHash, expiresAt.toISOString()]
    );

    return true;
  });

  return created ? { email: normalizedEmail, token, expiresAt } : null;
}

export async function consumeLoginToken(token, databaseUrl) {
  const tokenHash = hashToken(token);
  const sessionToken = generateToken();
  const sessionTokenHash = hashToken(sessionToken);
  const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS);

  return withTransaction(databaseUrl, async (client) => {
    const tokenResult = await client.query(
      `
        select email
        from login_tokens
        where token_hash = $1
          and consumed_at is null
          and expires_at > now()
        for update
      `,
      [tokenHash]
    );

    const loginToken = tokenResult.rows[0];
    if (!loginToken) return null;

    const email = normalizeEmail(loginToken.email);
    const entitlement = await findActiveEntitlement(client, email);
    if (!entitlement) return null;

    await client.query(
      `
        update login_tokens
        set consumed_at = now()
        where token_hash = $1
      `,
      [tokenHash]
    );

    await client.query(
      `
        insert into sessions (email, session_token_hash, expires_at)
        values ($1, $2, $3)
      `,
      [email, sessionTokenHash, sessionExpiresAt.toISOString()]
    );

    await client.query(
      `
        update users
        set last_login_at = now(),
            updated_at = now()
        where lower(email) = lower($1)
      `,
      [email]
    );

    return {
      email,
      sessionToken,
      expiresAt: sessionExpiresAt,
      entitlement: {
        active: true,
        product: PRODUCT,
      },
    };
  });
}

export async function createSessionForEntitledEmail(email, databaseUrl) {
  const normalizedEmail = normalizeEmail(email);
  const sessionToken = generateToken();
  const sessionTokenHash = hashToken(sessionToken);
  const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS);

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

    await client.query(
      `
        insert into sessions (email, session_token_hash, expires_at)
        values ($1, $2, $3)
      `,
      [normalizedEmail, sessionTokenHash, sessionExpiresAt.toISOString()]
    );

    return {
      email: normalizedEmail,
      sessionToken,
      expiresAt: sessionExpiresAt,
      entitlement: {
        active: true,
        product: PRODUCT,
      },
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
               s.email,
               e.active as entitlement_active,
               e.product
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

    return {
      userId: session.user_id,
      email: normalizeEmail(session.email),
      role: session.role || "user",
      entitlement: {
        active: Boolean(session.entitlement_active),
        product: session.product || PRODUCT,
      },
    };
  });
}

export async function revokeSession(req, databaseUrl) {
  const sessionToken = getCookie(req, SESSION_COOKIE);
  if (!sessionToken) return false;

  const sessionTokenHash = hashToken(sessionToken);
  return withDb(databaseUrl, async (client) => {
    const result = await client.query(
      `
        update sessions
        set revoked_at = now(),
            last_seen_at = now()
        where session_token_hash = $1
          and revoked_at is null
      `,
      [sessionTokenHash]
    );
    return result.rowCount > 0;
  });
}

export async function deliverMagicLink({ email, link, env }) {
  const configured = Boolean(env.emailProviderApiKey && env.emailFrom);
  if (!configured) {
    if (!env.isProduction && link) {
      console.info("Magic login link for local testing:", link);
    }
    return { configured: false, sent: false };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.emailProviderApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.emailFrom,
      to: [email],
      subject: "Your Irish Theory Test Coach login link",
      text: [
        "Use this link to restore your Irish Theory Test Coach access:",
        "",
        link,
        "",
        "This link expires in 15 minutes. If you did not request it, you can ignore this email.",
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    throw new Error("Email provider rejected the login email.");
  }

  return { configured: true, sent: true };
}

export function buildLoginLink(publicSiteUrl, token) {
  const url = new URL(publicSiteUrl);
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
        select email, product
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
