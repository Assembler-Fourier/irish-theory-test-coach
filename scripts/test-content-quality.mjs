import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeContentQuality } from "../lib/content-quality.js";
import { canonicalCategoryFor } from "../shared/category-taxonomy.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = JSON.parse(fs.readFileSync(path.join(root, "tests", "fixtures", "content-quality-fixtures.json"), "utf8"));
const analysis = analyzeContentQuality(fixtures, { generatedAt: "fixture-test" });

assert.equal(canonicalCategoryFor("Techincal Matters").key, "technical_matters");
assert.equal(canonicalCategoryFor("Technical Matters with a Bearing on Road Safety").key, "technical_matters");

const duplicateWithReorderedAnswers = analysis.duplicateGroups.find((group) =>
  group.questionIds.includes(1) &&
  group.questionIds.includes(2) &&
  group.duplicateReason.includes("same_question_answers_reordered")
);
assert.ok(duplicateWithReorderedAnswers, "Expected same question/options in different order to be grouped.");

const conflict = analysis.conflictingAnswerGroups.find((group) =>
  group.questionIds.includes(1) &&
  group.questionIds.includes(3)
);
assert.ok(conflict, "Expected repeated stem with conflicting correct answers to enter conflict queue.");
assert.equal(conflict.reviewStatus, "conflict_queue");

const nearDuplicate = analysis.duplicateGroups.find((group) =>
  group.questionIds.includes(4) &&
  group.duplicateReason.includes("near_duplicate_stem")
);
assert.ok(nearDuplicate, "Expected near-duplicate stem to be detected.");

const lintTypes = new Set(analysis.lintFindings.map((finding) => finding.type));
assert.ok(lintTypes.has("duplicate_options"), "Expected duplicate options lint.");
assert.ok(lintTypes.has("weak_explanation"), "Expected weak explanation lint.");
assert.ok(lintTypes.has("malformed_image_path"), "Expected malformed image path lint.");
assert.ok(lintTypes.has("missing_alt_description"), "Expected missing image alt description lint.");
assert.ok(lintTypes.has("leading_symbol"), "Expected leading symbol lint.");
assert.ok(lintTypes.has("too_few_options"), "Expected too-few-options lint.");

const originalCorrect = fixtures.find((question) => question.id === 3).correct_answer;
assert.equal(originalCorrect, "The radio", "Analyzer must not silently change factual answers.");

console.log("Content quality fixture tests passed.");
