import { createAnalyticsClient } from "./analytics-client.js";

(function () {
  "use strict";

  const analytics = createAnalyticsClient();
  const path = window.location.pathname || "/";
  const isMarketingEntry = !path.startsWith("/admin") && !path.startsWith("/api");

  if (isMarketingEntry) {
    analytics.trackEvent("landing_view", {
      path,
      pageType: pageType(path),
    });
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest?.("a[href]");
    if (!link) return;
    const href = new URL(link.getAttribute("href"), window.location.origin);
    const label = (link.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (href.pathname === "/app" && /start|preview|practice|app/.test(label)) {
      analytics.trackEvent("start_free_practice", {
        sourcePath: path,
        ctaText: label.slice(0, 80),
      });
    }
  });
})();

function pageType(path) {
  if (path === "/" || path === "/index.html") return "home";
  if (path === "/pricing" || path === "/pricing.html") return "pricing";
  if (path.includes("road-sign") || path === "/road-signs") return "road_signs";
  if (path.includes("mock")) return "mock_exam";
  if (path === "/learn") return "learning_hub";
  if (path.includes("instructor")) return "instructor";
  if (path.endsWith(".html")) return "seo_landing";
  return "public";
}
