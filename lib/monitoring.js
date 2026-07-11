import { sanitizeLogValue } from "./security.js";

const DEFAULT_TIMEOUT_MS = 2000;

export async function emitOperationalEvent(eventType, severity = "info", details = {}, options = {}) {
  const payload = {
    eventType: cleanToken(eventType, "operational_event"),
    severity: cleanSeverity(severity),
    source: cleanToken(options.source || "app", "app"),
    environment: cleanToken(options.environment || process.env.MONITORING_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV || "local", "local"),
    correlationId: sanitizeLogValue(options.correlationId || details.requestId || "", 120),
    message: sanitizeLogValue(options.message || details.message || "", 240),
    metadata: sanitizeDetails(details),
    createdAt: new Date().toISOString(),
  };

  const writer = ["critical", "error"].includes(payload.severity) ? console.error : console.info;
  writer("operational_event", payload);

  if (!monitoringEnabled()) return { delivered: false, payload };
  const url = process.env.MONITORING_WEBHOOK_URL;
  if (!url) return { delivered: false, payload };

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(Number(process.env.MONITORING_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)),
    });
    return { delivered: true, payload };
  } catch (error) {
    console.error("monitoring_delivery_failed", {
      eventType: payload.eventType,
      severity: payload.severity,
      errorCode: sanitizeLogValue(error?.code || error?.name || "delivery_failed", 80),
    });
    return { delivered: false, payload };
  }
}

export async function recordOperationalEvent(client, input = {}) {
  const payload = sanitizeDetails(input.metadata || {});
  await client.query(
    `
      insert into operational_events (
        event_type,
        severity,
        source,
        environment,
        correlation_id,
        safe_actor,
        message,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
    `,
    [
      cleanToken(input.eventType, "operational_event"),
      cleanSeverity(input.severity),
      cleanToken(input.source || "app", "app"),
      cleanToken(input.environment || process.env.VERCEL_ENV || process.env.NODE_ENV || "local", "local"),
      sanitizeLogValue(input.correlationId || "", 120),
      sanitizeLogValue(input.safeActor || "", 120),
      sanitizeLogValue(input.message || "", 240),
      JSON.stringify(payload),
    ],
  );
}

function monitoringEnabled() {
  return String(process.env.MONITORING_ENABLED || "").toLowerCase() === "true";
}

function sanitizeDetails(value, depth = 0) {
  if (depth > 4) return "[truncated]";
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeDetails(item, depth + 1));
  if (typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value).slice(0, 50)) {
      if (isSensitiveKey(key)) {
        result[cleanToken(key, "field")] = "[redacted]";
      } else {
        result[cleanToken(key, "field")] = sanitizeDetails(item, depth + 1);
      }
    }
    return result;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  return sanitizeLogValue(value, 240);
}

function isSensitiveKey(key) {
  return /(secret|token|password|cookie|authorization|database_url|stripe_secret|webhook_secret|connection)/i.test(String(key || ""));
}

function cleanSeverity(value) {
  const severity = cleanToken(value, "info");
  return ["info", "warning", "error", "critical"].includes(severity) ? severity : "info";
}

function cleanToken(value, fallback) {
  return String(value || fallback).replace(/[^\w:.-]/g, "_").slice(0, 120) || fallback;
}
