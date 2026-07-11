import { createAnalyticsClient, loadAnonymousId } from "./analytics-client.js";

const analytics = createAnalyticsClient({
  anonymousId: loadAnonymousId(),
});

window.addEventListener("error", (event) => {
  trackFrontendError("error", {
    message: event.message,
    filename: event.filename,
    line: event.lineno,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  trackFrontendError("unhandledrejection", {
    message: event.reason?.message || event.reason,
  });
});

function trackFrontendError(kind, details = {}) {
  analytics.trackEvent("frontend_error", {
    kind,
    path: window.location.pathname || "/",
    message: sanitize(details.message, 160),
    filename: sanitize(details.filename, 120),
    line: Number.isFinite(Number(details.line)) ? Number(details.line) : 0,
  });
}

function sanitize(value, maxLength) {
  return String(value || "")
    .replace(/sk_(live|test)_[A-Za-z0-9_-]+/g, "[redacted-stripe-key]")
    .replace(/whsec_[A-Za-z0-9_-]+/g, "[redacted-webhook-secret]")
    .replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted-database-url]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[redacted-token]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}
