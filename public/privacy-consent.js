export const PRIVACY_PREFERENCES_KEY = "ittc-privacy-preferences-v1";
export const PRIVACY_CONSENT_VERSION = "2026-07-15-v1";

const OPTIONAL_ANALYTICS_KEYS = [
  "irish-theory-practice-anonymous-id-v1",
  "irish-theory-analytics-queue-v2",
  "irish-theory-attribution-first-v1",
  "irish-theory-attribution-last-v1",
  "irish-theory-analytics-dedupe-v2",
  "irish-theory-analytics-session-v2",
  "irish-theory-visited-v1",
  "irish-theory-return-visit-sent-v1",
];

export function readPrivacyPreferences(storage = browserStorage("localStorage")) {
  if (!storage) return { analytics: "unset", version: PRIVACY_CONSENT_VERSION };
  try {
    const parsed = JSON.parse(storage.getItem(PRIVACY_PREFERENCES_KEY) || "null");
    if (!parsed || !["granted", "denied"].includes(parsed.analytics)) {
      return { analytics: "unset", version: PRIVACY_CONSENT_VERSION };
    }
    return {
      analytics: parsed.analytics,
      version: String(parsed.version || ""),
      updatedAt: String(parsed.updatedAt || ""),
    };
  } catch {
    return { analytics: "unset", version: PRIVACY_CONSENT_VERSION };
  }
}

export function hasAnalyticsConsent(storage = browserStorage("localStorage")) {
  return readPrivacyPreferences(storage).analytics === "granted";
}

export function setAnalyticsConsent(
  granted,
  storage = browserStorage("localStorage"),
  sessionStorage = browserStorage("sessionStorage"),
) {
  const preferences = {
    analytics: granted ? "granted" : "denied",
    version: PRIVACY_CONSENT_VERSION,
    updatedAt: new Date().toISOString(),
  };

  if (!granted) clearOptionalAnalyticsStorage(storage, sessionStorage);
  try {
    storage?.setItem(PRIVACY_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Consent remains usable for this page even when storage is unavailable.
  }

  dispatchConsentChange(preferences);
  return preferences;
}

export function clearOptionalAnalyticsStorage(
  storage = browserStorage("localStorage"),
  sessionStorage = browserStorage("sessionStorage"),
) {
  for (const key of OPTIONAL_ANALYTICS_KEYS) {
    try {
      storage?.removeItem(key);
      sessionStorage?.removeItem(key);
    } catch {
      // Privacy cleanup is best effort when browser storage is unavailable.
    }
  }
}

export function openPrivacySettings() {
  const panel = ensureConsentPanel();
  if (!panel) return;
  renderPanel(panel, { openedByUser: true });
  panel.hidden = false;
  panel.querySelector("[data-consent-reject]")?.focus({ preventScroll: true });
}

function mountConsentControls() {
  const panel = ensureConsentPanel();
  if (!panel) return;

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest?.("[data-privacy-settings]");
    if (!trigger) return;
    event.preventDefault();
    openPrivacySettings();
  });

  if (readPrivacyPreferences().analytics === "unset") {
    renderPanel(panel, { openedByUser: false });
    panel.hidden = false;
  }
}

function ensureConsentPanel() {
  if (typeof document === "undefined") return null;
  const existing = document.getElementById("privacyConsentPanel");
  if (existing) return existing;

  const panel = document.createElement("section");
  panel.id = "privacyConsentPanel";
  panel.className = "privacy-consent-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-labelledby", "privacyConsentTitle");
  panel.addEventListener("click", handlePanelAction);
  document.body.append(panel);
  return panel;
}

function renderPanel(panel, { openedByUser }) {
  const current = readPrivacyPreferences().analytics;
  panel.innerHTML = `
    <div class="privacy-consent-copy">
      <p class="eyebrow">Privacy choices</p>
      <h2 id="privacyConsentTitle">Optional analytics are your choice.</h2>
      <p>Essential storage keeps sign-in, security, checkout, and study progress working. Optional first-party analytics help us understand product use and stay off until you allow them.</p>
      <p class="privacy-consent-status">Current choice: <strong>${choiceLabel(current)}</strong>. Read the <a href="/cookies.html">Cookie &amp; Storage Notice</a> or <a href="/privacy.html">Privacy Notice</a>.</p>
    </div>
    <div class="privacy-consent-actions">
      <button class="button-secondary" type="button" data-consent-reject>Reject optional analytics</button>
      <button class="button-primary" type="button" data-consent-allow>Allow optional analytics</button>
      ${openedByUser && current !== "unset" ? '<button class="button-ghost" type="button" data-consent-close>Close</button>' : ""}
    </div>`;
}

function handlePanelAction(event) {
  const action = event.target.closest?.("button");
  if (!action) return;
  const panel = event.currentTarget;

  if (action.matches("[data-consent-close]")) {
    panel.hidden = true;
    return;
  }

  if (action.matches("[data-consent-allow]")) setAnalyticsConsent(true);
  else if (action.matches("[data-consent-reject]")) setAnalyticsConsent(false);
  else return;

  panel.hidden = true;
}

function dispatchConsentChange(preferences) {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  const event = typeof CustomEvent === "function"
    ? new CustomEvent("ittc:privacy-consent-changed", { detail: preferences })
    : new Event("ittc:privacy-consent-changed");
  window.dispatchEvent(event);
}

function choiceLabel(value) {
  if (value === "granted") return "allowed";
  if (value === "denied") return "rejected";
  return "not chosen";
}

function browserStorage(name) {
  try {
    return typeof window !== "undefined" ? window[name] : null;
  } catch {
    return null;
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountConsentControls, { once: true });
  else mountConsentControls();
}
