import { createAnalyticsClient } from "./analytics-client.js";

(function () {
  "use strict";

  const config = window.PRICING_CONFIG || { plans: [] };
  const analytics = createAnalyticsClient();

  bindPlanButtons();
  trackPricingView();

  function bindPlanButtons() {
    document.querySelectorAll("[data-plan-checkout]").forEach((button) => {
      const plan = config.plans.find((item) => item.key === button.dataset.planCheckout);
      if (!plan || plan.enabled === false) {
        button.disabled = true;
        button.setAttribute("aria-disabled", "true");
        button.textContent = "Not currently available";
        const status = button.closest(".pricing-plan-card")?.querySelector(".pricing-plan-status");
        if (status) status.textContent = "The Full Study Pass is available below.";
        return;
      }
      button.addEventListener("click", () => startCheckout(button));
    });
  }

  async function startCheckout(button) {
    const planKey = button.dataset.planCheckout;
    const original = button.textContent;
    button.disabled = true;
    button.classList.add("is-loading");
    button.textContent = "Opening checkout...";
    analytics.trackEvent("checkout_clicked", { source: "pricing_page", mode: "pricing", planKey });

    try {
      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey, anonymousId: analytics.anonymousId || "" }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.url) throw new Error("checkout_failed");
      analytics.trackEvent("checkout_started", {
        source: "pricing_page",
        mode: "pricing",
        planKey,
        checkoutAttemptId: payload.attemptId || "",
      });
      await analytics.flush();
      window.location.href = payload.url;
    } catch {
      const status = button.closest(".pricing-plan-card")?.querySelector(".pricing-plan-status");
      if (status) status.textContent = "Checkout could not be opened. Try again or contact support.";
      button.disabled = false;
      button.classList.remove("is-loading");
      button.textContent = original;
    }
  }

  function trackPricingView() {
    analytics.trackEvent("pricing_page_viewed", { path: window.location.pathname || "/pricing.html" });
  }
})();
