import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { signMediaToken } from "./study-session-tokens.js";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const DEFAULT_BANK_PATH = path.join(root, "data", "questions.enriched.json");
const HIGH_YIELD_THRESHOLD = 68;
const CRITICAL_THRESHOLD = 82;

let cachedBank = null;

export function getPrivateQuestionBank(env = process.env) {
  const bankPath = env.PRIVATE_QUESTION_BANK_PATH
    ? path.resolve(env.PRIVATE_QUESTION_BANK_PATH)
    : DEFAULT_BANK_PATH;

  if (!fs.existsSync(bankPath)) {
    const error = new Error("Private question bank is unavailable.");
    error.code = "PRIVATE_QUESTION_BANK_MISSING";
    throw error;
  }

  const cacheKey = `${bankPath}:${fs.statSync(bankPath).mtimeMs}`;
  if (cachedBank?.cacheKey === cacheKey) return cachedBank.questions;

  const raw = JSON.parse(fs.readFileSync(bankPath, "utf8"));
  const questions = (Array.isArray(raw) ? raw : raw.questions)
    .filter(isPublishedQuestion)
    .map(normalizeQuestion)
    .sort((a, b) => a.id - b.id);

  cachedBank = { cacheKey, questions };
  return questions;
}

export function selectQuestionsForMode(questions, options = {}) {
  const mode = cleanMode(options.mode);
  const limit = Math.max(1, Math.min(Number(options.limit || defaultLimitForMode(mode, options.preview)), 80));
  let pool = questions.slice();

  if (options.category) {
    pool = pool.filter((question) => question.category === options.category);
  }

  if (mode === "highYield") {
    pool = pool.filter((question) => question.priorityScore >= HIGH_YIELD_THRESHOLD)
      .sort((a, b) => b.priorityScore - a.priorityScore || a.id - b.id);
  } else if (mode === "hardest") {
    pool = pool.filter((question) => question.hardestRank)
      .sort((a, b) => a.hardestRank - b.hardestRank);
  } else if (mode === "signs") {
    pool = pool.filter((question) => question.isRoadSign)
      .sort((a, b) => b.priorityScore - a.priorityScore || a.id - b.id);
  } else if (mode === "review" && Array.isArray(options.reviewQuestionIds)) {
    const ids = new Set(options.reviewQuestionIds.map(Number));
    pool = pool.filter((question) => ids.has(question.id));
  } else if (mode === "exam") {
    return buildMockQuestions(pool, options).slice(0, 40);
  }

  return pool.slice(0, limit);
}

export function toInitialQuestionPayload(question, options = {}) {
  return {
    id: question.id,
    prompt: question.question,
    question: question.question,
    options: question.options.map((option, index) => ({ index, text: option.text })),
    category: question.category,
    priorityScore: question.priorityScore,
    priorityLabel: question.priorityLabel,
    studySignals: question.studySignals.slice(0, 6),
    scoreBreakdown: safeScoreBreakdown(question.scoreBreakdown),
    isRoadSign: question.isRoadSign,
    hardestRank: question.hardestRank,
    communityCorrectRate: question.communityCorrectRate,
    importanceNote: question.importanceNote,
    images: buildImageRefs(question, options),
  };
}

export function revealAnswer(question, selectedIndex) {
  const selected = question.options[selectedIndex];
  const correctOption = question.options[question.correctIndex] || question.options.find((option) => option.isCorrect);
  const correct = Boolean(selected && selected.isCorrect);
  return {
    questionId: question.id,
    selectedIndex,
    correct,
    correctIndex: Number.isInteger(question.correctIndex) ? question.correctIndex : question.options.findIndex((option) => option.isCorrect),
    correctAnswer: question.correctAnswer || correctOption?.text || "",
    explanation: question.explanation || fallbackExplanation(question),
    memoryTip: memoryTipFor(question, correct),
    coaching: {
      whyThisMatters: whyThisMatters(question),
      priorityLabel: question.priorityLabel,
      priorityScore: question.priorityScore,
      relatedTopicTags: relatedTags(question),
      highYieldReasons: highYieldReasons(question),
    },
  };
}

export function findQuestionById(questions, questionId) {
  return questions.find((question) => question.id === Number(questionId)) || null;
}

export function publicPreviewQuestions(questions, previewLimit, publicAssetRoot = "data/preview-assets") {
  return questions.slice(0, previewLimit).map((question) => toInitialQuestionPayload(question, {
    preview: true,
    publicAssetRoot,
  }));
}

export function sourceAssetPath(relativePath) {
  const clean = cleanAssetPath(relativePath);
  const resolved = path.resolve(root, clean);
  const dataAssets = path.resolve(root, "data", "assets");
  if (!resolved.startsWith(`${dataAssets}${path.sep}`)) {
    const error = new Error("Invalid media path.");
    error.code = "MEDIA_PATH_INVALID";
    throw error;
  }
  return resolved;
}

export function contentTypeForMedia(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml; charset=utf-8",
  }[ext] || "application/octet-stream";
}

export function cleanMode(mode) {
  return ["revise", "highYield", "hardest", "signs", "review", "exam"].includes(mode) ? mode : "revise";
}

function defaultLimitForMode(mode, preview) {
  if (preview) return 15;
  if (mode === "exam") return 40;
  if (mode === "hardest") return 50;
  if (mode === "review") return 50;
  return 50;
}

function normalizeQuestion(question) {
  const options = Array.isArray(question.options) ? question.options : [];
  const score = Number(question.priority_score || 0);
  const localImages = Array.isArray(question.local_image_paths) ? question.local_image_paths.filter(Boolean) : [];
  return {
    id: question.id,
    category: cleanText(question.category) || "Uncategorised",
    question: cleanText(question.question),
    explanation: cleanText(question.explanation),
    correctIndex: Number.isInteger(question.correct_index) ? question.correct_index : options.findIndex((option) => option.is_correct),
    correctAnswer: cleanText(question.correct_answer),
    options: options.map((option, index) => ({
      index,
      text: cleanText(option.text),
      isCorrect: Boolean(option.is_correct),
    })),
    localImagePaths: localImages,
    priorityScore: score,
    priorityLabel: cleanText(question.priority_label) || labelForScore(score),
    studySignals: Array.isArray(question.study_signals) ? question.study_signals.map(cleanText).filter(Boolean) : [],
    scoreBreakdown: question.score_breakdown && typeof question.score_breakdown === "object" ? question.score_breakdown : {},
    isRoadSign: Boolean(question.is_road_sign) || localImages.length > 0 || Number(question.score_breakdown?.road_sign_or_image_signal || 0) > 0,
    hardestRank: Number.isFinite(question.hardest_rank) ? question.hardest_rank : null,
    communityCorrectRate: Number.isFinite(question.community_correct_rate) ? question.community_correct_rate : null,
    importanceNote: cleanText(question.importance_note),
    sourceType: cleanText(question.source_type),
    reviewedStatus: cleanText(question.reviewed_status),
    safeToShow: question.safe_to_show !== false,
  };
}

function isPublishedQuestion(question) {
  if (!question || !Number.isInteger(question.id)) return false;
  return Boolean(question.question && Array.isArray(question.options) && question.options.length);
}

function buildMockQuestions(pool, options) {
  const categoryPool = options.category ? pool.filter((question) => question.category === options.category) : pool;
  return shuffle(categoryPool.length >= 40 ? categoryPool : pool)
    .sort((a, b) => b.priorityScore - a.priorityScore || a.id - b.id)
    .slice(0, 60)
    .sort(() => Math.random() - 0.5)
    .slice(0, 40);
}

function buildImageRefs(question, options) {
  const first = question.localImagePaths[0];
  if (!first) return [];
  if (options.preview) {
    return [`${options.publicAssetRoot || "data/preview-assets"}/${path.basename(first)}`];
  }
  const token = signMediaToken({
    q: question.id,
    path: first,
    sid: options.sessionPublicId || "",
    access: options.accessType || "premium",
    exp: Date.now() + 15 * 60 * 1000,
  }, options.secret);
  return [`/api/v1/media/${encodeURIComponent(token)}`];
}

function safeScoreBreakdown(value) {
  const breakdown = value || {};
  return {
    archived_hardest_signal: Number(breakdown.archived_hardest_signal || 0),
    road_sign_or_image_signal: Number(breakdown.road_sign_or_image_signal || 0),
    safety_critical_signal: Number(breakdown.safety_critical_signal || 0),
    legal_consequence_signal: Number(breakdown.legal_consequence_signal || 0),
    category_priority_signal: Number(breakdown.category_priority_signal || 0),
    user_miss_rate_signal: Number(breakdown.user_miss_rate_signal || 0),
    total: Number(breakdown.total || 0),
    note: "Study-priority estimate only; not official exam frequency.",
  };
}

function highYieldReasons(question) {
  const breakdown = question.scoreBreakdown || {};
  return [
    Number(breakdown.archived_hardest_signal || 0) > 0 || Number(breakdown.user_miss_rate_signal || 0) > 0 ? "commonly missed" : "",
    Number(breakdown.road_sign_or_image_signal || 0) > 0 || question.isRoadSign ? "road sign/image" : "",
    Number(breakdown.safety_critical_signal || 0) > 0 ? "safety-critical" : "",
    Number(breakdown.legal_consequence_signal || 0) > 0 ? "legal/rules topic" : "",
  ].filter(Boolean);
}

function memoryTipFor(question, correct) {
  if (question.isRoadSign) return "Look for the sign shape and colour first, then confirm the exact instruction.";
  if (question.priorityScore >= CRITICAL_THRESHOLD) return "Pause on safety words such as must, should, first, only, and except.";
  return correct ? "Keep the rule behind the answer in mind, not only the answer text." : "Read the safest action first, then compare it with each option.";
}

function whyThisMatters(question) {
  if (question.isRoadSign) return "Fast sign recognition helps you choose the safer action before pressure builds.";
  if (/rule|legal|road/i.test(question.category)) return "Rules questions often turn on exact wording and legal duties.";
  return "Understanding the reason helps the answer transfer to similar practice questions.";
}

function relatedTags(question) {
  return [question.category, question.priorityLabel, question.isRoadSign ? "road signs" : ""].filter(Boolean).slice(0, 5);
}

function fallbackExplanation(question) {
  return `Review the rule being tested in ${question.category}. The safest answer is the one that matches the supplied rule and road context.`;
}

function labelForScore(score) {
  if (score >= CRITICAL_THRESHOLD) return "Critical";
  if (score >= HIGH_YIELD_THRESHOLD) return "High";
  if (score >= 54) return "Medium";
  return "Standard";
}

function shuffle(items) {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanAssetPath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
}
