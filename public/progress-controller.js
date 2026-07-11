export function createProgressController({ dailyTarget }) {
  return {
    dailyTarget,
    targetRatio(todayCount) {
      return Math.min(1, Number(todayCount || 0) / dailyTarget);
    },
    remainingToday(todayCount) {
      return Math.max(0, dailyTarget - Number(todayCount || 0));
    },
    isHighYield(question) {
      return Number(question?.priorityScore || 0) >= 68;
    },
  };
}
