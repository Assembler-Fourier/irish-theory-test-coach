import { getSessionUser, readJsonBody } from "../../lib/auth.js";
import { withDb } from "../../lib/db.js";
import { checkRateLimit, limitFromEnv, rateLimitKey, sendRateLimited } from "../../lib/rate-limit.js";
import { rejectUnverifiedRequest, verifyStateChangingRequest } from "../../lib/security.js";
import {
  getAuthServerEnv,
  safeErrorSummary,
  sendSafeConfigError,
} from "../../lib/server-env.js";
import {
  ANALYTICS_SCHEMA_VERSION,
  ATTRIBUTION_KEYS,
  allowedEventNames,
} from "../../shared/growth-config.js";

const MAX_EVENTS_PER_REQUEST = 20;
const MAX_PROPERTY_STRING_LENGTH = 180;
const ANONYMOUS_ID_PATTERN = /^[a-zA-Z0-9:_-]{12,80}$/;
const EVENT_ID_PATTERN = /^[a-zA-Z0-9:_-]{12,80}$/;

const ALLOWED_EVENTS = allowedEventNames();

const PROPERTY_ALLOWLIST = {
  landing_view: ["path", "pageType"],
  start_free_practice: ["sourcePath", "ctaText"],
  first_answer: ["mode", "category"],
  preview_engaged: ["answered", "previewLimit", "mode"],
  checkout_started: ["source", "mode", "planKey", "referralCode", "checkoutAttemptId"],
  checkout_completed: ["source", "planKey", "referralCode", "sessionId"],
  access_restored: ["source", "entitlementActive"],
  first_paid_session: ["mode", "questionCount"],
  first_mock_started: ["questionCount", "category"],
  first_mock_completed: ["score", "total", "passed", "answered", "durationSeconds"],
  return_visit: ["path"],
  page_view: ["path"],
  preview_started: ["previewLimit", "questionCount"],
  question_answered: [
    "questionId",
    "category",
    "mode",
    "correct",
    "selectedIndex",
    "priorityScore",
    "priorityLabel",
    "isRoadSign",
    "isHighYield",
  ],
  answer_correct: ["questionId", "category", "mode", "priorityScore", "priorityLabel", "isRoadSign", "isHighYield"],
  answer_wrong: ["questionId", "category", "mode", "priorityScore", "priorityLabel", "isRoadSign", "isHighYield"],
  mode_selected: ["mode", "previousMode", "requiresAccess"],
  paywall_viewed: ["mode", "source"],
  checkout_clicked: ["source", "mode", "planKey", "referralCode"],
  checkout_success: ["source", "planKey", "referralCode"],
  restore_access_clicked: ["source"],
  restore_access_started: ["source"],
  restore_access_success: ["source"],
  pricing_page_viewed: ["path"],
  referral_code_viewed: ["source"],
  referral_code_applied: ["source", "planKey"],
  referral_checkout_started: ["source", "planKey"],
  referral_purchase_completed: ["source", "planKey"],
  mock_started: ["questionCount", "category"],
  mock_completed: ["score", "total", "passed", "answered", "durationSeconds"],
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let env;
  try {
    env = getAuthServerEnv();
  } catch (error) {
    return sendSafeConfigError(res, error);
  }

  try {
    const origin = verifyStateChangingRequest(req, env);
    if (!origin.ok) {
      return rejectUnverifiedRequest(res);
    }

    const limit = checkRateLimit({
      key: rateLimitKey(req, "analytics:events"),
      limit: limitFromEnv("RATE_LIMIT_ANALYTICS_EVENTS", 120),
      windowMs: 60_000,
    });
    if (!limit.allowed) return sendRateLimited(res, limit);

    const body = await readJsonBody(req, { maxBytes: 16_384 });
    const events = normalizeEvents(body);
    if (!events.length) {
      return res.status(400).json({ error: "No valid analytics events" });
    }

    const session = await getSessionUser(req, env.databaseUrl).catch(() => null);
    const saved = await saveEvents(env.databaseUrl, session, events);
    return res.status(200).json({ ok: true, saved });
  } catch (error) {
    console.error("Could not save analytics events", safeErrorSummary(error));
    return res.status(500).json({ error: "Could not save analytics events" });
  }
}

function normalizeEvents(body) {
  const items = Array.isArray(body.events) ? body.events : [body];
  const fallbackAnonymousId = body.anonymousId || body.anonymous_id;
  const fallbackSchemaVersion = Number(body.schemaVersion || body.schema_version || ANALYTICS_SCHEMA_VERSION);
  return items
    .slice(0, MAX_EVENTS_PER_REQUEST)
    .map((item) => normalizeEvent(item, fallbackAnonymousId, fallbackSchemaVersion))
    .filter(Boolean);
}

function normalizeEvent(item, fallbackAnonymousId, fallbackSchemaVersion) {
  const eventName = cleanText(item.eventName || item.event_name, 80);
  const anonymousId = cleanText(item.anonymousId || item.anonymous_id || fallbackAnonymousId, 90);
  const eventId = cleanText(item.eventId || item.event_id, 90);
  const schemaVersion = Number(item.schemaVersion || item.schema_version || fallbackSchemaVersion);
  if (!ALLOWED_EVENTS.has(eventName) || !ANONYMOUS_ID_PATTERN.test(anonymousId)) {
    return null;
  }
  if (!EVENT_ID_PATTERN.test(eventId) || schemaVersion !== ANALYTICS_SCHEMA_VERSION) return null;

  return {
    eventId,
    schemaVersion,
    eventName,
    anonymousId,
    properties: sanitizeProperties(eventName, item.properties),
    attribution: sanitizeAttribution(item.attribution),
    experiments: sanitizeObjectMap(item.experiments, 40, 40),
    botSignals: sanitizeBotSignals(item.botSignals || item.bot_signals),
    clientCreatedAt: parseClientDate(item.clientCreatedAt || item.client_created_at),
  };
}

async function saveEvents(databaseUrl, session, events) {
  return withDb(databaseUrl, async (client) => {
    let saved = 0;
    for (const event of events) {
      const result = await client.query(
        `
          insert into events (
            event_id,
            schema_version,
            event_name,
            anonymous_id,
            user_id,
            properties,
            attribution,
            experiments,
            bot_signals,
            environment,
            client_created_at
          )
          values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11::timestamptz)
          on conflict (event_id) do nothing
        `,
        [
          event.eventId,
          event.schemaVersion,
          event.eventName,
          event.anonymousId,
          session?.userId || null,
          JSON.stringify(event.properties),
          JSON.stringify(event.attribution),
          JSON.stringify(event.experiments),
          JSON.stringify(event.botSignals),
          process.env.VERCEL_ENV || process.env.NODE_ENV || "local",
          event.clientCreatedAt,
        ]
      );
      saved += result.rowCount;
    }
    return saved;
  });
}

function sanitizeProperties(eventName, properties) {
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return {};

  const allowedKeys = PROPERTY_ALLOWLIST[eventName] || [];
  return allowedKeys.reduce((acc, key) => {
    const value = sanitizePropertyValue(properties[key]);
    if (value !== undefined) acc[key] = value;
    return acc;
  }, {});
}

function sanitizeAttribution(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { firstTouch: {}, lastTouch: {} };
  }
  return {
    firstTouch: sanitizeAttributionTouch(value.firstTouch || value.first_touch),
    lastTouch: sanitizeAttributionTouch(value.lastTouch || value.last_touch),
  };
}

function sanitizeAttributionTouch(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return ATTRIBUTION_KEYS.reduce((acc, key) => {
    const raw = value[key];
    const cleanValue = key === "landingPage" ? sanitizePath(raw) : sanitizePropertyValue(raw);
    if (cleanValue !== undefined && cleanValue !== "") acc[key] = cleanValue;
    return acc;
  }, {});
}

function sanitizeObjectMap(value, keyMax, valueMax) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.entries(value).reduce((acc, [key, raw]) => {
    const cleanKey = cleanText(key, keyMax);
    const cleanValue = cleanText(raw, valueMax);
    if (/^[a-zA-Z0-9_:-]{1,60}$/.test(cleanKey) && /^[a-zA-Z0-9_:-]{1,60}$/.test(cleanValue)) {
      acc[cleanKey] = cleanValue;
    }
    return acc;
  }, {});
}

function sanitizeBotSignals(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return {
    webdriver: Boolean(value.webdriver),
    deviceClass: ["mobile", "tablet", "desktop", "unknown"].includes(value.deviceClass) ? value.deviceClass : "unknown",
    languagePresent: Boolean(value.languagePresent),
    timezonePresent: Boolean(value.timezonePresent),
  };
}

function parseClientDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function sanitizePropertyValue(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return cleanText(value, MAX_PROPERTY_STRING_LENGTH);
  return undefined;
}

function sanitizePath(value) {
  const path = cleanText(value, 160);
  if (!path.startsWith("/") || path.includes("?") || path.includes("#")) return undefined;
  return path;
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
