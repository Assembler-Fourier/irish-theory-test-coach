export function normalizeClientQuestion(question) {
  const options = Array.isArray(question.options) ? question.options : [];
  const score = Number(question.priorityScore ?? question.priority_score ?? 50);
  return {
    id: Number(question.id),
    category: clean(question.category) || "Uncategorised",
    question: clean(question.question || question.prompt),
    explanation: clean(question.explanation),
    correctIndex: Number.isInteger(question.correctIndex) ? question.correctIndex : -1,
    correctAnswer: clean(question.correctAnswer),
    options: options.map((option, index) => ({
      index,
      text: clean(option.text),
      isCorrect: Boolean(option.isCorrect),
    })),
    images: Array.isArray(question.images)
      ? question.images
      : Array.isArray(question.local_image_paths)
        ? question.local_image_paths
        : [],
    coachVisuals: Array.isArray(question.coachVisuals) ? question.coachVisuals : [],
    priorityScore: score,
    priorityLabel: clean(question.priorityLabel || question.priority_label) || labelForScore(score),
    studySignals: Array.isArray(question.studySignals) ? question.studySignals.map(clean).filter(Boolean) : [],
    scoreBreakdown: normalizeScoreBreakdown(question.scoreBreakdown || question.score_breakdown),
    sourceType: clean(question.sourceType || question.source_type),
    sourceReference: "",
    reviewedStatus: "",
    reviewedBy: "",
    reviewedAt: "",
    reviewNotes: "",
    safeToShow: true,
    hardestRank: Number.isFinite(question.hardestRank) ? question.hardestRank : null,
    communityCorrectRate: Number.isFinite(question.communityCorrectRate) ? question.communityCorrectRate : null,
    isRoadSign: Boolean(question.isRoadSign || question.is_road_sign),
    importanceNote: clean(question.importanceNote || question.importance_note),
  };
}

export function applyAnswerReveal(question, result) {
  question.correctIndex = Number.isInteger(result.correctIndex) ? result.correctIndex : question.correctIndex;
  question.correctAnswer = clean(result.correctAnswer);
  question.explanation = clean(result.explanation);
  question.memoryTip = clean(result.memoryTip);
  question.answerRevealed = true;
  question.options = question.options.map((option, index) => ({
    ...option,
    isCorrect: index === question.correctIndex,
  }));
}

export function resolveImageSrc(src) {
  const value = String(src || "").replace(/\\/g, "/");
  if (!value) return "";
  if (/^(https?:)?\/\//i.test(value) || value.startsWith("/")) return value;
  return `./${value.replace(/^\.?\//, "")}`;
}

export function labelForScore(score) {
  if (score >= 82) return "Critical";
  if (score >= 68) return "High";
  if (score >= 54) return "Medium";
  return "Standard";
}

function normalizeScoreBreakdown(value) {
  if (!value || typeof value !== "object") return {};
  return {
    ...value,
    archived_hardest_signal: Number(value.archived_hardest_signal || 0),
    road_sign_or_image_signal: Number(value.road_sign_or_image_signal || 0),
    safety_critical_signal: Number(value.safety_critical_signal || 0),
    legal_consequence_signal: Number(value.legal_consequence_signal || 0),
    category_priority_signal: Number(value.category_priority_signal || 0),
    user_miss_rate_signal: Number(value.user_miss_rate_signal || 0),
  };
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
