import { getSessionUser, readJsonBody } from "../lib/auth.js";
import { withDb } from "../lib/db.js";
import {
  getAuthServerEnv,
  safeErrorSummary,
  sendSafeConfigError,
} from "../lib/server-env.js";

const MAX_EVENTS_PER_REQUEST = 20;
const MAX_PROPERTY_STRING_LENGTH = 180;
const ANONYMOUS_ID_PATTERN = /^[a-zA-Z0-9:_-]{12,80}$/;

const ALLOWED_EVENTS = new Set([
  "page_view",
  "preview_started",
  "question_answered",
  "answer_correct",
  "answer_wrong",
  "mode_selected",
  "paywall_viewed",
  "checkout_clicked",
  "checkout_success",
  "restore_access_clicked",
  "mock_started",
  "mock_completed",
]);

const PROPERTY_ALLOWLIST = {
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
  checkout_clicked: ["source", "mode"],
  checkout_success: ["source"],
  restore_access_clicked: ["source"],
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
    const body = await readJsonBody(req);
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
  return items
    .slice(0, MAX_EVENTS_PER_REQUEST)
    .map((item) => normalizeEvent(item, fallbackAnonymousId))
    .filter(Boolean);
}

function normalizeEvent(item, fallbackAnonymousId) {
  const eventName = cleanText(item.eventName || item.event_name, 80);
  const anonymousId = cleanText(item.anonymousId || item.anonymous_id || fallbackAnonymousId, 90);
  if (!ALLOWED_EVENTS.has(eventName) || !ANONYMOUS_ID_PATTERN.test(anonymousId)) {
    return null;
  }

  return {
    eventName,
    anonymousId,
    properties: sanitizeProperties(eventName, item.properties),
  };
}

async function saveEvents(databaseUrl, session, events) {
  return withDb(databaseUrl, async (client) => {
    let saved = 0;
    for (const event of events) {
      const result = await client.query(
        `
          insert into events (
            event_name,
            anonymous_id,
            user_id,
            properties
          )
          values ($1, $2, $3, $4::jsonb)
        `,
        [
          event.eventName,
          event.anonymousId,
          session?.userId || null,
          JSON.stringify(event.properties),
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

function sanitizePropertyValue(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return cleanText(value, MAX_PROPERTY_STRING_LENGTH);
  return undefined;
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
