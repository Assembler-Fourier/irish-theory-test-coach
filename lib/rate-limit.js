import crypto from "node:crypto";

const buckets = new Map();
const DEFAULT_WINDOW_MS = 60_000;

export function checkRateLimit({ key, limit, windowMs }) {
  const now = Date.now();
  const bucketKey = String(key || "anonymous");
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Number(limit)) : 60;
  const safeWindowMs = Number.isFinite(Number(windowMs)) ? Math.max(1_000, Number(windowMs)) : DEFAULT_WINDOW_MS;
  const bucket = buckets.get(bucketKey) || { count: 0, resetAt: now + safeWindowMs };

  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + safeWindowMs;
  }

  bucket.count += 1;
  buckets.set(bucketKey, bucket);

  return {
    allowed: bucket.count <= safeLimit,
    remaining: Math.max(0, safeLimit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

export function rateLimitKey(req, scope) {
  return `${cleanScope(scope)}:${hashedClientIdentifier(req)}`;
}

export function compoundRateLimitKey(req, scope, identifier = "") {
  const subject = identifier ? hashIdentifier(identifier) : "none";
  return `${rateLimitKey(req, scope)}:${subject}`;
}

export function hashedClientIdentifier(req) {
  const ip = firstHeaderValue(req?.headers?.["x-forwarded-for"]) ||
    firstHeaderValue(req?.headers?.["x-real-ip"]) ||
    req?.socket?.remoteAddress ||
    "local";
  const ua = firstHeaderValue(req?.headers?.["user-agent"]) || "unknown";
  return hashIdentifier(`${ip}|${ua}`);
}

export function hashIdentifier(value) {
  const salt = process.env.RATE_LIMIT_SALT || process.env.STUDY_SESSION_SECRET || "irish-theory-test-coach-local-rate-limit";
  return crypto
    .createHmac("sha256", salt)
    .update(String(value || "unknown"), "utf8")
    .digest("hex")
    .slice(0, 32);
}

export function limitFromEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function sendRateLimited(res, result) {
  res.setHeader("Retry-After", String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))));
  res.setHeader("Cache-Control", "no-store");
  return res.status(429).json({ error: "Too many requests" });
}

export function resetRateLimitBucketsForTests() {
  buckets.clear();
}

function firstHeaderValue(value) {
  if (Array.isArray(value)) return String(value[0] || "").split(",")[0].trim();
  return String(value || "").split(",")[0].trim();
}

function cleanScope(value) {
  return String(value || "general").replace(/[^\w:-]/g, "").slice(0, 80) || "general";
}
