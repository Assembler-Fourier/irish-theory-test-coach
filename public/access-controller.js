export function createAccessController({ pricingConfig, productSummary, hasAccess }) {
  return {
    requiresAccess(mode) {
      return ["highYield", "hardest", "signs", "exam", "review"].includes(mode);
    },
    canUseMode(mode) {
      return !this.requiresAccess(mode) || hasAccess();
    },
    currentPlan(referralPlanKey = "") {
      const config = pricingConfig() || {};
      const plans = Array.isArray(config.plans) ? config.plans : [];
      const key = referralPlanKey || config.activeLearnerPlanKey || productSummary?.activePlanKey || "full_study_pass";
      return plans.find((plan) => plan.key === key && plan.enabled !== false)
        || plans.find((plan) => plan.key === "full_study_pass")
        || {
          key: "full_study_pass",
          label: "Full Study Pass",
          displayPrice: productSummary?.activePrice || "EUR 4.99",
          enabled: true,
        };
    },
  };
}
