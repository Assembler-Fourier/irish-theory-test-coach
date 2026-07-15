import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeContentQuality, annotateQuestionsWithQuality } from "../lib/content-quality.js";
import { getPrivateQuestionBank, selectQuestionsForMode } from "../lib/question-bank.js";
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

const answerVariant = analysis.answerVariantGroups.find((group) =>
  group.questionIds.includes(8) &&
  group.questionIds.includes(9)
);
assert.ok(answerVariant, "Expected repeated stem with different answer sets to enter answer-variant review.");
assert.equal(answerVariant.reviewStatus, "answer_variant_review");

const conflict = analysis.conflictingAnswerGroups.find((group) =>
  group.questionIds.includes(6) &&
  group.questionIds.includes(7)
);
assert.ok(conflict, "Expected the same stem and answer set with conflicting keys to enter conflict queue.");
assert.equal(conflict.reviewStatus, "conflict_queue");
assert.deepEqual(conflict.structuralConflictPairs, [[6, 7]]);

const nearDuplicate = analysis.duplicateGroups.find((group) =>
  group.questionIds.includes(4) &&
  group.duplicateReason.includes("near_duplicate_stem")
);
assert.ok(nearDuplicate, "Expected near-duplicate stem to be detected.");

const visualScenario = analysis.scenarioVariantGroups.find((group) =>
  group.questionIds.includes(10) && group.questionIds.includes(11)
);
assert.ok(visualScenario, "Distinct image-backed questions with a generic stem should be treated as scenario variants.");
assert.notEqual(
  analysis.questionIndex["10"].sessionGroupId,
  analysis.questionIndex["11"].sessionGroupId,
  "Distinct sign images must remain eligible in the same road-sign session."
);

assert.equal(
  analysis.questionIndex["12"].sessionGroupId,
  analysis.questionIndex["13"].sessionGroupId,
  "Equivalent non-image questions with reordered answers should share a runtime duplicate group."
);

const annotatedFixtures = annotateQuestionsWithQuality(fixtures);
const selectedRuntimeVariants = new Set();
for (const variantSeed of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
  const selected = selectQuestionsForMode(annotatedFixtures, {
    mode: "review",
    limit: 2,
    reviewQuestionIds: [12, 13],
    variantSeed,
  });
  assert.equal(selected.length, 1, "One runtime duplicate group should yield one question per session.");
  selectedRuntimeVariants.add(selected[0].id);
}
assert.equal(selectedRuntimeVariants.size, 2, "Equivalent variants should rotate across separate sessions.");

const productionFixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "ittc-quality-index-"));
try {
  const fixtureBankPath = path.join(productionFixtureDir, "questions.enriched.json");
  fs.writeFileSync(fixtureBankPath, JSON.stringify(fixtures), "utf8");
  assert.throws(
    () => getPrivateQuestionBank({
      VERCEL_ENV: "production",
      PRIVATE_QUESTION_BANK_PATH: fixtureBankPath,
      PRIVATE_QUESTION_QUALITY_INDEX_PATH: path.join(productionFixtureDir, "missing-index.json"),
    }),
    (error) => error?.code === "QUESTION_QUALITY_INDEX_MISSING",
    "Production must fail securely when the private quality index is missing."
  );
} finally {
  fs.rmSync(productionFixtureDir, { recursive: true, force: true });
}

const fullQuestions = JSON.parse(fs.readFileSync(path.join(root, "data", "questions.json"), "utf8"));
const roadLabelQuestion = fullQuestions.find((question) => question.id === 381);
const roadLabelText = JSON.stringify(roadLabelQuestion || {});
assert.doesNotMatch(roadLabelText, /€\s*2-plus-1/i, "A 2-plus-1 road label must not be rewritten as a euro amount.");
assert.match(roadLabelText, /2-plus-1 roads/i, "The 2-plus-1 road label should remain readable.");
for (const questionId of [23, 77, 118]) {
  const question = fullQuestions.find((item) => item.id === questionId);
  assert.equal(question?.category, "Traffic Signs and Regulatory Matters", `Direct sign question ${questionId} should use the traffic-sign category.`);
  assert.ok(question?.original_category, `Direct sign question ${questionId} should preserve its original category.`);
}

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
