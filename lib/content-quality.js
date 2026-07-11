import crypto from "node:crypto";
import {
  CANONICAL_CATEGORIES,
  CATEGORY_REGISTRY_VERSION,
  canonicalCategoryFor,
  categoryMappingsFor,
} from "../shared/category-taxonomy.js";

const NEAR_DUPLICATE_THRESHOLD = 0.72;
const KNOWN_ACRONYMS = new Set(["RSA", "NCT", "ABS", "ESP", "MOT", "EU", "UK", "ROI", "PSV", "LGV", "HGV"]);
const MISSPELLINGS = new Map([
  ["techincal", "technical"],
  ["recieve", "receive"],
  ["seperate", "separate"],
  ["occurence", "occurrence"],
  ["neccessary", "necessary"],
  ["responsiblity", "responsibility"],
  ["wether", "whether"],
  ["teh", "the"],
  ["paeople", "people"],
]);
const AMERICANISMS = new Map([
  ["tire", "tyre"],
  ["tires", "tyres"],
  ["curb", "kerb"],
  ["license", "licence"],
  ["center", "centre"],
  ["behavior", "behaviour"],
]);

export function analyzeContentQuality(inputQuestions, options = {}) {
  const questions = normalizeQuestions(inputQuestions);
  const categoryMappings = categoryMappingsFor(questions.map((question) => question.originalCategory));
  const duplicateAnalysis = analyzeDuplicates(questions);
  const lintFindings = questions.flatMap((question) => lintQuestion(question));
  const editorialBacklog = buildEditorialBacklog({ duplicateAnalysis, lintFindings });

  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    registryVersion: CATEGORY_REGISTRY_VERSION,
    taxonomy: CANONICAL_CATEGORIES,
    summary: {
      totalQuestions: questions.length,
      canonicalCategories: new Set(questions.map((question) => question.categoryKey)).size,
      duplicateGroups: duplicateAnalysis.duplicateGroups.length,
      answerVariantGroups: duplicateAnalysis.answerVariantGroups.length,
      conflictingAnswerGroups: duplicateAnalysis.conflictingAnswerGroups.length,
      lintFindings: lintFindings.length,
      editorialBacklog: editorialBacklog.length,
    },
    questions,
    questionIndex: duplicateAnalysis.questionIndex,
    duplicateGroups: duplicateAnalysis.duplicateGroups,
    answerVariantGroups: duplicateAnalysis.answerVariantGroups,
    conflictingAnswerGroups: duplicateAnalysis.conflictingAnswerGroups,
    categoryMappings,
    lintFindings,
    editorialBacklog,
  };
}

export function annotateQuestionsWithQuality(inputQuestions) {
  const analysis = analyzeContentQuality(inputQuestions, { generatedAt: "runtime" });
  return inputQuestions.map((question) => {
    const row = analysis.questionIndex[String(question.id)] || {};
    const canonical = canonicalCategoryFor(question.category);
    return {
      ...question,
      originalCategory: canonical.originalCategory,
      categoryKey: canonical.key,
      canonicalCategoryKey: canonical.key,
      category: canonical.displayName,
      canonicalCategory: canonical.displayName,
      canonicalQuestionId: row.canonicalQuestionId || question.id,
      variantGroupId: row.variantGroupId || `vg_single_${question.id}`,
      duplicateReason: row.duplicateReason || "",
      duplicateReviewStatus: row.reviewStatus || "not_duplicate",
      qualityIssueCount: row.lintCount || 0,
    };
  });
}

export function normalizeStem(value) {
  return normalizeText(value)
    .replace(/\bwhat\s+should\s+you\s+do\b/g, "what do")
    .replace(/\bwhich\s+of\s+the\s+following\b/g, "which")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenSimilarity(a, b) {
  const left = new Set(tokensFor(a));
  const right = new Set(tokensFor(b));
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  left.forEach((token) => {
    if (right.has(token)) intersection += 1;
  });
  const union = left.size + right.size - intersection;
  return union ? intersection / union : 0;
}

function normalizeQuestions(inputQuestions) {
  return (Array.isArray(inputQuestions) ? inputQuestions : []).filter((question) => Number.isInteger(Number(question.id))).map((question) => {
    const category = canonicalCategoryFor(question.category);
    const options = normalizeOptions(question.options);
    const correctIndex = Number.isInteger(question.correct_index)
      ? question.correct_index
      : Number.isInteger(question.correctIndex)
        ? question.correctIndex
        : options.findIndex((option) => option.isCorrect);
    const correctOption = options[correctIndex] || options.find((option) => option.isCorrect) || null;
    const stem = cleanText(question.question || question.prompt);
    return {
      id: Number(question.id),
      question: stem,
      normalizedStem: normalizeStem(stem),
      stemHash: shortHash(normalizeStem(stem)),
      originalCategory: category.originalCategory,
      categoryKey: category.key,
      category: category.displayName,
      categoryMappingReason: category.mappingReason,
      explanation: cleanText(question.explanation),
      options,
      correctIndex,
      correctAnswer: cleanText(question.correct_answer || question.correctAnswer || correctOption?.text),
      normalizedCorrectAnswer: normalizeText(question.correct_answer || question.correctAnswer || correctOption?.text),
      optionSetKey: optionSetKey(options),
      orderedOptionsKey: options.map((option) => normalizeText(option.text)).join("|"),
      imageKeys: imageKeys(question),
      sourceType: cleanText(question.source_type || question.sourceType),
      reviewedStatus: cleanText(question.reviewed_status || question.reviewedStatus),
      safeToShow: question.safe_to_show !== false,
      raw: question,
    };
  });
}

function normalizeOptions(options) {
  return (Array.isArray(options) ? options : []).map((option, index) => ({
    index,
    text: cleanText(option.text || option.label || option.answer),
    normalized: normalizeText(option.text || option.label || option.answer),
    isCorrect: Boolean(option.is_correct || option.isCorrect),
  }));
}

function analyzeDuplicates(questions) {
  const groupCandidates = [];
  collectGroups(groupCandidates, questions, "exact_stem", (question) => cleanText(question.question).toLowerCase());
  collectGroups(groupCandidates, questions, "normalised_stem", (question) => question.normalizedStem);
  collectGroups(groupCandidates, questions, "same_question_answers_reordered", (question) => `${question.normalizedStem}|${question.optionSetKey}`);
  collectGroups(groupCandidates, questions, "same_image_repeated_question", (question) => `${question.imageKeys[0] || ""}|${question.normalizedStem}`, (question) => question.imageKeys.length > 0);
  collectNearDuplicateGroups(groupCandidates, questions);

  const merged = mergeGroups(groupCandidates);
  const duplicateGroups = merged.map((group) => formatDuplicateGroup(group, questions));
  const answerVariantGroups = duplicateGroups
    .filter((group) => group.answerVariantCandidates && !group.conflictingCorrectAnswers)
    .map((group) => ({
      ...group,
      reviewStatus: "answer_variant_review",
    }));
  const conflictingAnswerGroups = duplicateGroups
    .filter((group) => group.conflictingCorrectAnswers)
    .map((group) => ({
      ...group,
      reviewStatus: "conflict_queue",
    }));
  const questionIndex = buildQuestionIndex(questions, duplicateGroups);

  return { duplicateGroups, answerVariantGroups, conflictingAnswerGroups, questionIndex };
}

function collectGroups(target, questions, reason, keyFn, includeFn = () => true) {
  const byKey = new Map();
  questions.forEach((question) => {
    if (!includeFn(question)) return;
    const key = keyFn(question);
    if (!key) return;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(question.id);
  });
  byKey.forEach((ids, key) => {
    if (ids.length > 1) {
      target.push({ key, reasons: new Set([reason]), questionIds: ids.slice().sort((a, b) => a - b) });
    }
  });
}

function collectNearDuplicateGroups(target, questions) {
  const pairs = [];
  for (let left = 0; left < questions.length; left += 1) {
    for (let right = left + 1; right < questions.length; right += 1) {
      const score = tokenSimilarity(questions[left].normalizedStem, questions[right].normalizedStem);
      if (score >= NEAR_DUPLICATE_THRESHOLD && questions[left].normalizedStem !== questions[right].normalizedStem) {
        pairs.push([questions[left].id, questions[right].id]);
      }
    }
  }

  mergePairs(pairs).forEach((ids) => {
    if (ids.length > 1) {
      target.push({
        key: `near:${ids.join("-")}`,
        reasons: new Set(["near_duplicate_stem"]),
        questionIds: ids.slice().sort((a, b) => a - b),
      });
    }
  });
}

function mergeGroups(groups) {
  const result = [];
  groups.forEach((group) => {
    const existing = result.find((item) => intersects(item.questionIds, group.questionIds));
    if (existing) {
      existing.questionIds = Array.from(new Set([...existing.questionIds, ...group.questionIds])).sort((a, b) => a - b);
      group.reasons.forEach((reason) => existing.reasons.add(reason));
    } else {
      result.push({ ...group, reasons: new Set(group.reasons) });
    }
  });
  return result.sort((a, b) => a.questionIds[0] - b.questionIds[0]);
}

function formatDuplicateGroup(group, questions) {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const variants = group.questionIds.map((id) => byId.get(id)).filter(Boolean);
  const canonicalQuestionId = Math.min(...group.questionIds);
  const correctAnswers = Array.from(new Set(variants.map((question) => question.normalizedCorrectAnswer).filter(Boolean)));
  const variation = classifyAnswerVariation(variants);
  const reason = Array.from(group.reasons).sort().join("|");
  return {
    variantGroupId: `vg_${shortHash(group.questionIds.join(":"))}`,
    canonicalQuestionId,
    questionIds: group.questionIds,
    duplicateReason: reason,
    reviewStatus: variation.conflictingCorrectAnswers
      ? "conflict_queue"
      : variation.answerVariantCandidates
        ? "answer_variant_review"
        : "needs_review",
    conflictingCorrectAnswers: variation.conflictingCorrectAnswers,
    answerVariantCandidates: variation.answerVariantCandidates,
    structuralConflictPairs: variation.structuralConflictPairs,
    correctAnswerCount: correctAnswers.length,
    stems: variants.map((question) => ({ questionId: question.id, stem: question.question })),
    correctAnswers: variants.map((question) => ({
      questionId: question.id,
      correctIndex: question.correctIndex,
      correctAnswer: question.correctAnswer,
    })),
    legitimateScenarioVariant: variation.imageScenarioVariant,
  };
}

function classifyAnswerVariation(variants) {
  const byExactStem = groupBy(variants, (question) => question.normalizedStem);
  const structuralConflictPairs = [];
  let answerVariantCandidates = false;

  for (const exactStemVariants of byExactStem.values()) {
    const correctAnswers = new Set(exactStemVariants.map((question) => question.normalizedCorrectAnswer).filter(Boolean));
    if (correctAnswers.size > 1) answerVariantCandidates = true;

    const byOptionSet = groupBy(exactStemVariants, (question) => question.optionSetKey);
    for (const optionSetVariants of byOptionSet.values()) {
      const answers = new Set(optionSetVariants.map((question) => question.normalizedCorrectAnswer).filter(Boolean));
      if (answers.size < 2) continue;
      for (let left = 0; left < optionSetVariants.length; left += 1) {
        for (let right = left + 1; right < optionSetVariants.length; right += 1) {
          if (optionSetVariants[left].normalizedCorrectAnswer === optionSetVariants[right].normalizedCorrectAnswer) continue;
          structuralConflictPairs.push([optionSetVariants[left].id, optionSetVariants[right].id]);
        }
      }
    }
  }

  const imageFingerprints = variants.map((question) => question.imageKeys.slice().sort().join("|"));
  const imageScenarioVariant = variants.length > 1 &&
    imageFingerprints.every(Boolean) &&
    new Set(imageFingerprints).size === imageFingerprints.length;

  return {
    answerVariantCandidates,
    conflictingCorrectAnswers: structuralConflictPairs.length > 0,
    structuralConflictPairs,
    imageScenarioVariant,
  };
}

function groupBy(rows, keyFn) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = keyFn(row);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return groups;
}

function buildQuestionIndex(questions, duplicateGroups) {
  const lintCounts = new Map();
  questions.flatMap((question) => lintQuestion(question)).forEach((finding) => {
    lintCounts.set(finding.questionId, (lintCounts.get(finding.questionId) || 0) + 1);
  });
  const index = {};
  questions.forEach((question) => {
    index[String(question.id)] = {
      questionId: question.id,
      canonicalQuestionId: question.id,
      variantGroupId: `vg_single_${question.id}`,
      duplicateReason: "",
      reviewStatus: "not_duplicate",
      canonicalCategoryKey: question.categoryKey,
      canonicalCategory: question.category,
      lintCount: lintCounts.get(question.id) || 0,
    };
  });
  duplicateGroups.forEach((group) => {
    group.questionIds.forEach((id) => {
      index[String(id)] = {
        ...index[String(id)],
        canonicalQuestionId: group.canonicalQuestionId,
        variantGroupId: group.variantGroupId,
        duplicateReason: group.duplicateReason,
        reviewStatus: group.reviewStatus,
      };
    });
  });
  return index;
}

export function lintQuestion(question) {
  const q = question.raw ? question : normalizeQuestions([question])[0];
  if (!q) return [];
  const findings = [];
  const add = (type, severity, message, field = "question", metadata = {}) => {
    findings.push({
      findingId: `${q.id}:${type}:${shortHash(message + field)}`,
      questionId: q.id,
      type,
      severity,
      field,
      message,
      metadata,
      reviewStatus: "open",
    });
  };
  const textFields = [
    ["question", q.question],
    ["explanation", q.explanation],
    ...q.options.map((option) => [`option_${option.index}`, option.text]),
  ];

  textFields.forEach(([field, value]) => {
    if (/[�]|â€™|â€œ|â€�|â€“/.test(value)) add("broken_quotes", "error", "Text contains broken apostrophe or quote encoding.", field);
    if (/[!?.,]{3,}/.test(value)) add("repeated_punctuation", "warning", "Text contains repeated punctuation.", field);
    if (/^\s*[-_*#~>!?.,;:]+/.test(value)) add("leading_symbol", "warning", "Text starts with an accidental leading symbol.", field);
    if (/<script|<\/?[a-z][^>]*\son\w+=|javascript:/i.test(value)) add("unsafe_html", "error", "Text contains unsafe HTML or script-like content.", field);
    tokensFor(value).forEach((token) => {
      if (MISSPELLINGS.has(token)) add("misspelling", "warning", `Possible misspelling '${token}' should be '${MISSPELLINGS.get(token)}'.`, field);
      if (AMERICANISMS.has(token)) add("irish_british_english", "info", `Use Irish/British English '${AMERICANISMS.get(token)}' instead of '${token}'.`, field);
    });
  });

  if (q.question.length < 12) add("stem_too_short", "warning", "Question stem is unusually short.");
  if (q.question.length > 280) add("stem_too_long", "warning", "Question stem is unusually long.");
  if (q.options.length < 2) add("too_few_options", "error", "Question has fewer than two answer options.", "options");
  if (q.options.length < 4) add("non_standard_option_count", "info", "Question has fewer than four answer options.", "options", { optionsCount: q.options.length });
  if (hasDuplicateOptions(q.options)) add("duplicate_options", "error", "Question has duplicate answer options.", "options");
  if (q.correctIndex < 0 || q.correctIndex >= q.options.length || !q.correctAnswer) {
    add("answer_not_present", "error", "Correct answer is missing or not present in options.", "correct_answer");
  }
  if (!q.explanation || q.explanation.length < 18 || /^(tbd|todo|n\/a|no explanation|explanation)$/i.test(q.explanation)) {
    add("weak_explanation", "warning", "Explanation is missing, placeholder-like, or too short.", "explanation");
  }
  q.imageKeys.forEach((imagePath) => {
    if (!/^data\/assets\/.+\.(png|jpe?g|webp|gif|svg)$/i.test(imagePath)) {
      add("malformed_image_path", "error", "Image path is malformed or outside the expected asset tree.", "image", { imagePath });
    }
  });
  if (q.imageKeys.length && !hasAltDescription(q.raw)) {
    add("missing_alt_description", "info", "Image-backed question is missing an image alt description.", "image");
  }
  unexplainedAcronyms(q.question, q.explanation).forEach((acronym) => {
    add("unexplained_acronym", "info", `Acronym '${acronym}' may need explanation.`, "question");
  });
  if (q.categoryKey === "uncategorised") add("category_unmapped", "warning", "Question category maps to Uncategorised.", "category", { originalCategory: q.originalCategory });
  if (q.categoryMappingReason === "near_alias") add("category_near_alias", "info", "Question category was mapped by near-alias rule.", "category", { originalCategory: q.originalCategory });

  return findings;
}

function buildEditorialBacklog({ duplicateAnalysis, lintFindings }) {
  const duplicateRows = duplicateAnalysis.duplicateGroups.map((group) => ({
    itemType: group.conflictingCorrectAnswers ? "conflict" : group.answerVariantCandidates ? "answer_variant" : "duplicate",
    priority: group.conflictingCorrectAnswers ? "critical" : group.answerVariantCandidates ? "warning" : "medium",
    groupId: group.variantGroupId,
    questionIds: group.questionIds,
    reason: group.duplicateReason,
    reviewStatus: group.reviewStatus,
    message: group.conflictingCorrectAnswers
      ? "The same stem and answer set has conflicting correct answers; editorial decision required."
      : group.answerVariantCandidates
        ? "Repeated stem uses different answer sets or scenarios; review as a legitimate variant without changing answers automatically."
        : "Duplicate or near-duplicate variants need editorial grouping.",
  }));
  const lintRows = lintFindings.map((finding) => ({
    itemType: "lint",
    priority: finding.severity,
    groupId: finding.findingId,
    questionIds: [finding.questionId],
    reason: finding.type,
    reviewStatus: finding.reviewStatus,
    message: finding.message,
  }));
  return [...duplicateRows, ...lintRows].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
}

function priorityRank(priority) {
  return { critical: 0, error: 1, warning: 2, medium: 3, info: 4 }[priority] ?? 5;
}

function optionSetKey(options) {
  return options.map((option) => option.normalized).filter(Boolean).sort().join("|");
}

function imageKeys(question) {
  const paths = [
    ...(Array.isArray(question.local_image_paths) ? question.local_image_paths : []),
    ...(Array.isArray(question.localImagePaths) ? question.localImagePaths : []),
    ...(Array.isArray(question.images) ? question.images : []),
    ...(Array.isArray(question.image_urls) ? question.image_urls : []),
  ];
  return paths.map((item) => String(item || "").replace(/\\/g, "/").replace(/^\.?\//, "")).filter(Boolean);
}

function hasDuplicateOptions(options) {
  const values = options.map((option) => option.normalized).filter(Boolean);
  return new Set(values).size !== values.length;
}

function hasAltDescription(question) {
  return Boolean(
    question?.image_alt ||
    question?.imageAlt ||
    (Array.isArray(question?.image_alts) && question.image_alts.some(Boolean)) ||
    (Array.isArray(question?.images) && question.images.some((item) => item && typeof item === "object" && item.alt))
  );
}

function unexplainedAcronyms(questionText, explanation) {
  const text = `${questionText} ${explanation}`;
  const matches = Array.from(text.matchAll(/\b[A-Z]{2,5}\b/g)).map((match) => match[0]);
  return Array.from(new Set(matches)).filter((item) => !KNOWN_ACRONYMS.has(item));
}

function mergePairs(pairs) {
  const groups = [];
  pairs.forEach(([a, b]) => {
    const existing = groups.find((group) => group.has(a) || group.has(b));
    if (existing) {
      existing.add(a);
      existing.add(b);
    } else {
      groups.push(new Set([a, b]));
    }
  });
  return groups.map((group) => Array.from(group).sort((a, b) => a - b));
}

function intersects(left, right) {
  const set = new Set(left);
  return right.some((item) => set.has(item));
}

function tokensFor(value) {
  return normalizeText(value)
    .split(" ")
    .map(stemToken)
    .filter((token) => token.length > 1);
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/&/g, " and ")
    .replace(/<[^>]*>/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|a|an|to|of|for|and|or|in|on|at|is|are|be|you|your|when|what|which|with|should|driver|drivers|make|do|does)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stemToken(token) {
  return String(token || "")
    .replace(/ies$/i, "y")
    .replace(/ing$/i, "")
    .replace(/ed$/i, "")
    .replace(/es$/i, "")
    .replace(/s$/i, "");
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function shortHash(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex").slice(0, 12);
}
