import assert from "node:assert/strict";
import {
  PRIVACY_PREFERENCES_KEY,
  readPrivacyPreferences,
  setAnalyticsConsent,
} from "../public/privacy-consent.js";
import {
  createAnalyticsClient,
  loadAnonymousId,
} from "../public/analytics-client.js";

const localStorage = memoryStorage();
const sessionStorage = memoryStorage();
const listeners = new Map();
const requests = [];

globalThis.window = {
  GROWTH_CONFIG: { schemaVersion: 2, experiments: [] },
  localStorage,
  sessionStorage,
  location: { pathname: "/", search: "" },
  navigator: { language: "en-IE", webdriver: false },
  screen: { width: 390 },
  crypto: globalThis.crypto,
  fetch: async (...args) => {
    requests.push(args);
    return { ok: true, json: async () => ({ saved: 1 }) };
  },
  setTimeout,
  clearTimeout,
  addEventListener(name, handler) {
    const handlers = listeners.get(name) || [];
    handlers.push(handler);
    listeners.set(name, handlers);
  },
  dispatchEvent(event) {
    for (const handler of listeners.get(event.type) || []) handler(event);
    return true;
  },
};
globalThis.document = { visibilityState: "visible" };

assert.equal(readPrivacyPreferences(localStorage).analytics, "unset");
assert.equal(loadAnonymousId(localStorage), "", "No analytics ID may be created before consent.");
assert.equal(localStorage.getItem("irish-theory-practice-anonymous-id-v1"), null);

const analytics = createAnalyticsClient({
  fetchImpl: window.fetch,
  storage: localStorage,
  sessionStorage,
  location: window.location,
  navigatorRef: window.navigator,
});

const blockedResult = await analytics.trackEvent("landing_view", { path: "/" });
assert.equal(blockedResult.consent, "not_granted");
assert.equal(requests.length, 0, "No analytics request may be sent before consent.");
assert.equal(localStorage.getItem("irish-theory-attribution-first-v1"), null);

setAnalyticsConsent(true, localStorage, sessionStorage);
assert.equal(readPrivacyPreferences(localStorage).analytics, "granted");
assert.match(analytics.anonymousId, /^anon_/);
await analytics.trackEvent("mode_selected", { mode: "revise" });
assert.equal(requests.length, 1, "Analytics should send after consent.");

localStorage.setItem("irish-theory-practice-progress-v2", "keep-me");
localStorage.setItem("irish-theory-analytics-queue-v2", "remove-me");
sessionStorage.setItem("irish-theory-analytics-session-v2", "remove-me");
setAnalyticsConsent(false, localStorage, sessionStorage);

assert.equal(readPrivacyPreferences(localStorage).analytics, "denied");
assert.equal(localStorage.getItem(PRIVACY_PREFERENCES_KEY) !== null, true);
assert.equal(localStorage.getItem("irish-theory-practice-anonymous-id-v1"), null);
assert.equal(localStorage.getItem("irish-theory-analytics-queue-v2"), null);
assert.equal(sessionStorage.getItem("irish-theory-analytics-session-v2"), null);
assert.equal(localStorage.getItem("irish-theory-practice-progress-v2"), "keep-me", "Rejecting analytics must preserve study progress.");

await analytics.trackEvent("mode_selected", { mode: "signs" });
assert.equal(requests.length, 1, "Analytics must stop after consent is withdrawn.");

console.log("Privacy consent tests passed (pre-consent block, grant, withdrawal, selective cleanup).");

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
  };
}
