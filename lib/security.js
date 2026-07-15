import crypto from "node:crypto";
import { normalizeEmail } from "./auth.js";
import { hashedClientIdentifier } from "./rate-limit.js";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function applyApiSecurityHeaders(res, options = {}) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cache-Control", options.cacheControl || "no-store");
  if (options.requestId) res.setHeader("X-Request-Id", options.requestId);
}

export function createRequestContext(req, route = "") {
  const requestId = cleanRequestId(
    firstHeaderValue(req?.headers?.["x-request-id"]) ||
    firstHeaderValue(req?.headers?.["x-vercel-id"]) ||
    `req_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`
  );
  return {
    requestId,
    route: cleanRoute(route || req?.url || "unknown"),
    startedAt: Date.now(),
    actor: safeActorIdentifier(req),
  };
}

export function logRequestFinished(context, res, error = null) {
  const status = Number(res?.statusCode || 200);
  const entry = {
    requestId: context.requestId,
    route: context.route,
    status,
    durationMs: Math.max(0, Date.now() - context.startedAt),
    actor: context.actor,
    errorCode: safeErrorCode(error),
  };
  const writer = status >= 500 ? console.error : console.info;
  writer("api_request", entry);
}

export function verifyStateChangingRequest(req, env, options = {}) {
  const method = String(req.method || "GET").toUpperCase();
  if (!UNSAFE_METHODS.has(method)) return { ok: true };

  const publicSiteUrl = env?.publicSiteUrl || process.env.PUBLIC_SITE_URL || "";
  const vercelEnvironment = String(env?.vercelEnvironment || process.env.VERCEL_ENV || "").toLowerCase();
  const explicitlyProduction = typeof env?.isProduction === "boolean"
    ? env.isProduction
    : process.env.NODE_ENV === "production";
  const isProduction = vercelEnvironment
    ? vercelEnvironment === "production"
    : explicitlyProduction;
  const isDeployed = vercelEnvironment === "production" || vercelEnvironment === "preview";
  const allowMissingOrigin = options.allowMissingOrigin ?? (!isProduction && !isDeployed);
  const expected = safeOrigin(publicSiteUrl);
  const suppliedOrigin = requestOrigin(req);
  const hostOrigin = requestHostOrigin(req);

  if (!expected) {
    return { ok: false, code: "origin_config_missing" };
  }

  if (!suppliedOrigin && allowMissingOrigin) {
    return { ok: true, code: "origin_missing_allowed" };
  }

  const allowedOrigins = new Set([expected]);
  if (vercelEnvironment === "preview") {
    const previewOrigin = safeVercelPreviewOrigin(env?.vercelUrl || process.env.VERCEL_URL || "");
    if (previewOrigin) allowedOrigins.add(previewOrigin);
  }

  const allowLocal = !isProduction && !isDeployed;
  const originOk = allowedOrigins.has(suppliedOrigin) || (allowLocal && isLocalOrigin(suppliedOrigin));
  const hostOk = !hostOrigin || allowedOrigins.has(hostOrigin) || (allowLocal && isLocalOrigin(hostOrigin));
  if (!originOk || !hostOk) {
    return { ok: false, code: "origin_mismatch" };
  }

  return { ok: true };
}

export function rejectUnverifiedRequest(res) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(403).json({ error: "Request could not be verified" });
}

export function safeActorIdentifier(req, session = null) {
  if (session?.userId) return `user:${hashSafe(session.userId)}`;
  if (session?.email) return `email:${hashSafe(normalizeEmail(session.email))}`;
  return `anon:${hashedClientIdentifier(req)}`;
}

export function sanitizeLogValue(value, maxLength = 160) {
  const text = String(value || "")
    .replace(/sk_(live|test)_[A-Za-z0-9_-]+/g, "[redacted-stripe-key]")
    .replace(/whsec_[A-Za-z0-9_-]+/g, "[redacted-webhook-secret]")
    .replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted-database-url]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[redacted-token]")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, maxLength);
}

export function safeErrorCode(error) {
  if (!error) return "";
  return sanitizeLogValue(error.code || error.name || error.message || "error", 80);
}

function safeOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function safeVercelPreviewOrigin(value) {
  const host = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.vercel\.app$/.test(host)) {
    return "";
  }
  return `https://${host}`;
}

function requestOrigin(req) {
  const origin = firstHeaderValue(req?.headers?.origin);
  if (origin) return safeOrigin(origin);
  const referer = firstHeaderValue(req?.headers?.referer);
  return referer ? safeOrigin(referer) : "";
}

function requestHostOrigin(req) {
  const proto = firstHeaderValue(req?.headers?.["x-forwarded-proto"]) || "https";
  const host = firstHeaderValue(req?.headers?.["x-forwarded-host"]) || firstHeaderValue(req?.headers?.host);
  return host ? safeOrigin(`${proto}://${host}`) : "";
}

function isLocalOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function firstHeaderValue(value) {
  if (Array.isArray(value)) return String(value[0] || "").split(",")[0].trim();
  return String(value || "").split(",")[0].trim();
}

function safeActorFromEmail(email) {
  return `email:${hashSafe(normalizeEmail(email))}`;
}

function hashSafe(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex").slice(0, 16);
}

function cleanRequestId(value) {
  return String(value || "").replace(/[^\w:.-]/g, "").slice(0, 160);
}

function cleanRoute(value) {
  return String(value || "unknown").replace(/[^\w:/.-]/g, "").slice(0, 200);
}
