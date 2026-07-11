const DEFAULT_SCHEMA_VERSION = 2;
const ANON_KEY = "irish-theory-practice-anonymous-id-v1";
const QUEUE_KEY = "irish-theory-analytics-queue-v2";
const FIRST_TOUCH_KEY = "irish-theory-attribution-first-v1";
const LAST_TOUCH_KEY = "irish-theory-attribution-last-v1";
const DEDUPE_KEY = "irish-theory-analytics-dedupe-v2";
const SESSION_DEDUPE_KEY = "irish-theory-analytics-session-v2";
const MAX_QUEUE = 100;
const MAX_BATCH = 10;
const MAX_BACKOFF_MS = 60_000;

const LIFETIME_DEDUPE_EVENTS = new Set([
  "preview_started",
  "first_answer",
  "preview_engaged",
  "first_paid_session",
  "first_mock_started",
  "first_mock_completed",
]);

const SESSION_DEDUPE_EVENTS = new Set([
  "landing_view",
  "start_free_practice",
  "return_visit",
]);

export function createAnalyticsClient({
  fetchImpl = window.fetch.bind(window),
  anonymousId = loadAnonymousId(),
  storage = window.localStorage,
  sessionStorage = window.sessionStorage,
  location = window.location,
  navigatorRef = window.navigator,
} = {}) {
  const schemaVersion = Number(window.GROWTH_CONFIG?.schemaVersion || DEFAULT_SCHEMA_VERSION);
  const client = {
    anonymousId,
    retryTimer: null,
    retryDelayMs: 2000,
    trackEvent(eventName, properties = {}, options = {}) {
      return this.trackEvents([{ eventName, properties, options }]);
    },
    trackEvents(events) {
      const queued = events
        .map((event) => buildEvent(event, { anonymousId, schemaVersion, storage, sessionStorage, location, navigatorRef }))
        .filter(Boolean);
      if (!queued.length) return Promise.resolve({ queued: 0 });
      enqueueEvents(storage, queued);
      return this.flush();
    },
    flush() {
      const queue = loadQueue(storage);
      if (!queue.length) return Promise.resolve({ saved: 0 });
      const batch = queue.slice(0, MAX_BATCH);
      return fetchImpl("/api/events", {
        method: "POST",
        credentials: "same-origin",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anonymousId,
          schemaVersion,
          events: batch,
        }),
      })
        .then((response) => {
          if (!response.ok) throw new Error("analytics_failed");
          const remaining = loadQueue(storage).slice(batch.length);
          saveQueue(storage, remaining);
          this.retryDelayMs = 2000;
          if (remaining.length) scheduleRetry(this);
          return response.json().catch(() => ({ ok: true }));
        })
        .catch(() => {
          scheduleRetry(this);
          return { queued: batch.length };
        });
    },
  };

  captureAttribution(storage, location);
  trackReturnVisit(client, storage, sessionStorage);
  window.addEventListener?.("online", () => client.flush());
  window.addEventListener?.("visibilitychange", () => {
    if (document.visibilityState === "hidden") client.flush();
  });
  return client;
}

export function loadAnonymousId(storage = window.localStorage) {
  try {
    const existing = storage.getItem(ANON_KEY);
    if (existing) return existing;
    const next = `anon_${Date.now()}_${randomHex()}`;
    storage.setItem(ANON_KEY, next);
    return next;
  } catch {
    return `anon_${Date.now()}_${randomHex()}`;
  }
}

function buildEvent(input, context) {
  const eventName = clean(input.eventName, 80);
  if (!eventName) return null;
  const options = input.options || {};
  const dedupeKey = dedupeKeyFor(eventName, input.properties, options);
  if (dedupeKey && isDuplicate(eventName, dedupeKey, context.storage, context.sessionStorage)) return null;
  markDedupe(eventName, dedupeKey, context.storage, context.sessionStorage);

  return {
    eventId: createEventId(),
    schemaVersion: context.schemaVersion,
    eventName,
    anonymousId: context.anonymousId,
    clientCreatedAt: new Date().toISOString(),
    properties: sanitizeClientProperties(input.properties || {}),
    attribution: buildAttribution(context.storage, context.location),
    experiments: currentExperiments(),
    botSignals: botSignals(context.navigatorRef),
  };
}

function dedupeKeyFor(eventName, properties = {}, options = {}) {
  if (options.dedupeKey) return `${eventName}:${clean(options.dedupeKey, 120)}`;
  if (LIFETIME_DEDUPE_EVENTS.has(eventName)) return eventName;
  if (SESSION_DEDUPE_EVENTS.has(eventName)) {
    const path = clean(properties.path || window.location?.pathname || "", 120);
    return `${eventName}:${path}`;
  }
  if (eventName === "paywall_viewed") return `${eventName}:${clean(properties.source, 80)}:${clean(properties.mode, 40)}`;
  if (eventName === "checkout_completed") return `${eventName}:${clean(properties.sessionId, 120) || clean(properties.planKey, 80)}`;
  return "";
}

function isDuplicate(eventName, key, storage, sessionStorage) {
  if (!key) return false;
  const store = SESSION_DEDUPE_EVENTS.has(eventName) || eventName === "paywall_viewed" ? sessionStorage : storage;
  const values = loadSet(store, SESSION_DEDUPE_EVENTS.has(eventName) || eventName === "paywall_viewed" ? SESSION_DEDUPE_KEY : DEDUPE_KEY);
  return values.has(key);
}

function markDedupe(eventName, key, storage, sessionStorage) {
  if (!key) return;
  const store = SESSION_DEDUPE_EVENTS.has(eventName) || eventName === "paywall_viewed" ? sessionStorage : storage;
  const keyName = SESSION_DEDUPE_EVENTS.has(eventName) || eventName === "paywall_viewed" ? SESSION_DEDUPE_KEY : DEDUPE_KEY;
  const values = loadSet(store, keyName);
  values.add(key);
  saveSet(store, keyName, values);
}

function captureAttribution(storage, location) {
  const params = new URLSearchParams(location.search || "");
  const attribution = {
    utmSource: safeCampaignValue(params.get("utm_source")),
    utmMedium: safeCampaignValue(params.get("utm_medium")),
    utmCampaign: safeCampaignValue(params.get("utm_campaign")),
    utmContent: safeCampaignValue(params.get("utm_content")),
    landingPage: safePath(location.pathname || "/"),
    referralCode: safeCode(params.get("ref") || params.get("referral") || params.get("referral_code")),
    instructorCode: safeCode(params.get("instructor_code") || params.get("instructor")),
    capturedAt: new Date().toISOString(),
  };
  const hasSignal = attribution.utmSource || attribution.utmMedium || attribution.utmCampaign || attribution.utmContent || attribution.referralCode || attribution.instructorCode;
  if (!hasSignal) {
    ensureFirstTouch(storage, attribution);
    return;
  }
  ensureFirstTouch(storage, attribution);
  safeSetJson(storage, LAST_TOUCH_KEY, attribution);
}

function ensureFirstTouch(storage, attribution) {
  if (!safeGetJson(storage, FIRST_TOUCH_KEY)) safeSetJson(storage, FIRST_TOUCH_KEY, attribution);
}

function buildAttribution(storage, location) {
  const fallback = { landingPage: safePath(location.pathname || "/") };
  return {
    firstTouch: pickAttribution(safeGetJson(storage, FIRST_TOUCH_KEY) || fallback),
    lastTouch: pickAttribution(safeGetJson(storage, LAST_TOUCH_KEY) || safeGetJson(storage, FIRST_TOUCH_KEY) || fallback),
  };
}

function pickAttribution(value) {
  return {
    utmSource: safeCampaignValue(value.utmSource),
    utmMedium: safeCampaignValue(value.utmMedium),
    utmCampaign: safeCampaignValue(value.utmCampaign),
    utmContent: safeCampaignValue(value.utmContent),
    landingPage: safePath(value.landingPage || "/"),
    referralCode: safeCode(value.referralCode),
    instructorCode: safeCode(value.instructorCode),
  };
}

function currentExperiments() {
  return (window.GROWTH_CONFIG?.experiments || []).reduce((acc, experiment) => {
    acc[experiment.key] = experiment.activeVariant;
    return acc;
  }, {});
}

function botSignals(navigatorRef) {
  const width = window.screen?.width || 0;
  return {
    webdriver: Boolean(navigatorRef.webdriver),
    deviceClass: width && width < 768 ? "mobile" : width && width < 1024 ? "tablet" : "desktop",
    languagePresent: Boolean(navigatorRef.language),
    timezonePresent: Boolean(Intl.DateTimeFormat().resolvedOptions().timeZone),
  };
}

function trackReturnVisit(client, storage, sessionStorage) {
  const visitKey = "irish-theory-visited-v1";
  const sessionKey = "irish-theory-return-visit-sent-v1";
  try {
    const visited = storage.getItem(visitKey);
    if (visited && !sessionStorage.getItem(sessionKey)) {
      sessionStorage.setItem(sessionKey, "1");
      client.trackEvent("return_visit", { path: window.location.pathname || "/" });
    }
    storage.setItem(visitKey, new Date().toISOString());
  } catch {
    // Return-visit tracking is non-critical.
  }
}

function enqueueEvents(storage, events) {
  saveQueue(storage, [...loadQueue(storage), ...events].slice(-MAX_QUEUE));
}

function loadQueue(storage) {
  return Array.isArray(safeGetJson(storage, QUEUE_KEY)) ? safeGetJson(storage, QUEUE_KEY) : [];
}

function saveQueue(storage, queue) {
  safeSetJson(storage, QUEUE_KEY, queue);
}

function scheduleRetry(client) {
  if (client.retryTimer) return;
  const delay = client.retryDelayMs;
  client.retryDelayMs = Math.min(MAX_BACKOFF_MS, client.retryDelayMs * 2);
  client.retryTimer = window.setTimeout(() => {
    client.retryTimer = null;
    client.flush();
  }, delay);
}

function sanitizeClientProperties(properties) {
  const out = {};
  for (const [key, value] of Object.entries(properties || {})) {
    const cleanKey = clean(key, 40);
    if (!/^[a-zA-Z0-9_:-]{1,40}$/.test(cleanKey)) continue;
    if (typeof value === "boolean" || typeof value === "number") out[cleanKey] = value;
    else if (typeof value === "string") out[cleanKey] = clean(value, 180);
  }
  return out;
}

function loadSet(storage, key) {
  const values = safeGetJson(storage, key);
  return new Set(Array.isArray(values) ? values.slice(-200) : []);
}

function saveSet(storage, key, values) {
  safeSetJson(storage, key, Array.from(values).slice(-200));
}

function safeGetJson(storage, key) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function safeSetJson(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be full or unavailable. Analytics stays non-blocking.
  }
}

function safeCampaignValue(value) {
  const cleaned = clean(value, 120);
  return /^[a-zA-Z0-9_.:/ -]{0,120}$/.test(cleaned) ? cleaned : "";
}

function safeCode(value) {
  const cleaned = clean(value, 80);
  return /^[a-zA-Z0-9_-]{0,80}$/.test(cleaned) ? cleaned : "";
}

function safePath(value) {
  const path = clean(value, 160);
  return path.startsWith("/") && !path.includes("?") ? path : "/";
}

function createEventId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `evt_${Date.now()}_${randomHex()}`;
}

function randomHex() {
  if (window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(8);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return Math.random().toString(16).slice(2);
}

function clean(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
