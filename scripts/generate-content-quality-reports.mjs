import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeContentQuality } from "../lib/content-quality.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(root, "data", "questions.enriched.json");
const reportsDir = path.join(root, "reports", "content");

if (!fs.existsSync(dataPath)) {
  throw new Error("Missing data/questions.enriched.json.");
}

fs.mkdirSync(reportsDir, { recursive: true });

const questions = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const analysis = analyzeContentQuality(questions);

writeJson("content-quality-summary.json", {
  generatedAt: analysis.generatedAt,
  registryVersion: analysis.registryVersion,
  summary: analysis.summary,
  taxonomy: analysis.taxonomy,
  topLintTypes: countBy(analysis.lintFindings, "type").slice(0, 20),
  topDuplicateReasons: countBy(analysis.duplicateGroups, "duplicateReason").slice(0, 20),
});
writeMarkdown("content-quality-summary.md", renderMarkdownSummary(analysis));
writeCsv("duplicate-groups.csv", analysis.duplicateGroups.flatMap((group) =>
  group.questionIds.map((questionId) => ({
    variant_group_id: group.variantGroupId,
    canonical_question_id: group.canonicalQuestionId,
    question_id: questionId,
    duplicate_reason: group.duplicateReason,
    review_status: group.reviewStatus,
    answer_variant_candidates: group.answerVariantCandidates,
    conflicting_correct_answers: group.conflictingCorrectAnswers,
  }))
));
writeCsv("answer-variant-groups.csv", analysis.answerVariantGroups.flatMap((group) =>
  group.correctAnswers.map((answer) => ({
    variant_group_id: group.variantGroupId,
    canonical_question_id: group.canonicalQuestionId,
    question_id: answer.questionId,
    correct_index: answer.correctIndex,
    correct_answer: answer.correctAnswer,
    review_status: group.reviewStatus,
    image_scenario_variant: group.legitimateScenarioVariant,
  }))
));
writeCsv("conflicting-answer-groups.csv", analysis.conflictingAnswerGroups.flatMap((group) =>
  group.correctAnswers.map((answer) => ({
    variant_group_id: group.variantGroupId,
    canonical_question_id: group.canonicalQuestionId,
    question_id: answer.questionId,
    correct_index: answer.correctIndex,
    correct_answer: answer.correctAnswer,
    review_status: group.reviewStatus,
  }))
));
writeCsv("category-mapping.csv", analysis.categoryMappings.map((mapping) => ({
  original_category: mapping.originalCategory,
  canonical_key: mapping.canonicalKey,
  display_name: mapping.displayName,
  active: mapping.active,
  mapping_reason: mapping.mappingReason,
  order: mapping.order,
})));
writeCsv("editorial-backlog.csv", analysis.editorialBacklog.map((item) => ({
  item_type: item.itemType,
  priority: item.priority,
  group_id: item.groupId,
  question_ids: item.questionIds.join("|"),
  reason: item.reason,
  review_status: item.reviewStatus,
  message: item.message,
})));

console.log([
  `Content quality reports generated in ${path.relative(root, reportsDir)}`,
  `- questions: ${analysis.summary.totalQuestions}`,
  `- duplicate groups: ${analysis.summary.duplicateGroups}`,
  `- answer-set variant groups: ${analysis.summary.answerVariantGroups}`,
  `- conflicts: ${analysis.summary.conflictingAnswerGroups}`,
  `- lint findings: ${analysis.summary.lintFindings}`,
].join("\n"));

function writeJson(fileName, value) {
  fs.writeFileSync(path.join(reportsDir, fileName), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeMarkdown(fileName, value) {
  fs.writeFileSync(path.join(reportsDir, fileName), value, "utf8");
}

function writeCsv(fileName, rows) {
  const columns = rows.length ? Object.keys(rows[0]) : ["empty"];
  const lines = [columns.join(",")];
  rows.forEach((row) => {
    lines.push(columns.map((column) => csvCell(row[column])).join(","));
  });
  fs.writeFileSync(path.join(reportsDir, fileName), `${lines.join("\n")}\n`, "utf8");
}

function renderMarkdownSummary(analysis) {
  const { summary } = analysis;
  return `# Content Quality Summary

Generated: ${analysis.generatedAt}

## Overview

- Total questions analysed: ${summary.totalQuestions}
- Canonical categories: ${summary.canonicalCategories}
- Duplicate groups: ${summary.duplicateGroups}
- Answer-set variant groups: ${summary.answerVariantGroups}
- Conflicting-answer groups: ${summary.conflictingAnswerGroups}
- Lint findings: ${summary.lintFindings}
- Editorial backlog items: ${summary.editorialBacklog}

## Rules

- Content rights are confirmed by the project owner.
- No question is removed or quarantined by this report.
- Repeated stems with different answer sets remain in editorial review without being mislabeled as direct contradictions.
- A blocking conflict requires the same normalised stem and answer set to contain different correct-answer keys.
- No heuristic silently changes an answer.
- High-yield remains an estimated study-priority signal, not official exam frequency.

## Top Lint Types

${countBy(analysis.lintFindings, "type").slice(0, 12).map((item) => `- ${item.key}: ${item.count}`).join("\n") || "- None"}

## Duplicate Reasons

${countBy(analysis.duplicateGroups, "duplicateReason").slice(0, 12).map((item) => `- ${item.key}: ${item.count}`).join("\n") || "- None"}

## Next Editorial Actions

1. Review \`conflicting-answer-groups.csv\` first; these are direct structural contradictions.
2. Review \`answer-variant-groups.csv\` and mark legitimate answer-set or image scenarios.
3. Review exact/normalised duplicates and decide whether variants are legitimate.
4. Use \`category-mapping.csv\` to approve category aliases and identify unmapped categories.
5. Work through \`editorial-backlog.csv\` by priority.
`;
}

function countBy(rows, key) {
  const counts = new Map();
  rows.forEach((row) => {
    const value = String(row[key] || "unknown");
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([itemKey, count]) => ({ key: itemKey, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
