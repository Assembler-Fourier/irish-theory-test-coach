const buckets = new Map();

export function checkRateLimit({ key, limit, windowMs }) {
  const now = Date.now();
  const bucketKey = String(key || "anonymous");
  const bucket = buckets.get(bucketKey) || { count: 0, resetAt: now + windowMs };

  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }

  bucket.count += 1;
  buckets.set(bucketKey, bucket);

  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

export function rateLimitKey(req, scope) {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = forwarded || req.socket?.remoteAddress || "local";
  return `${scope}:${ip}`;
}

export function sendRateLimited(res, result) {
  res.setHeader("Retry-After", String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))));
  return res.status(429).json({ error: "Too many requests" });
}
