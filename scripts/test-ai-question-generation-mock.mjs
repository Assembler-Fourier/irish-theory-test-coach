import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildLocalDraftQuestions,
  findNearestExistingQuestion,
} from "../api/admin/generate-questions.js";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const privateQuestionsPath = path.join(root, "data", "questions.enriched.json");
const publicPreviewPath = path.join(root, "public", "data", "preview-questions.json");
const questions = JSON.parse(fs.readFileSync(privateQuestionsPath, "utf8"));
const beforeCount = questions.length;

const sourceNote = [
  "When road conditions are wet, stopping distances increase and visibility can be reduced by spray.",
  "A careful driver should leave a larger gap, avoid harsh braking or steering, and reduce speed early.",
  "Learners should connect poor weather with extra time, extra space, and smoother control inputs.",
].join(" ");

const drafts = buildLocalDraftQuestions({
  sourceText: sourceNote,
  category: "Managing Risk",
  topic: "Wet road safety margins",
  count: 5,
  difficulty: "mixed",
});

if (drafts.length !== 5) {
  throw new Error(`Expected 5 draft questions, got ${drafts.length}.`);
}

const corpus = questions.map((question) => ({
  questionId: question.id,
  questionText: question.question,
}));

for (const draft of drafts) {
  if (!draft.category || !draft.difficulty || !draft.explanation || !draft.high_yield_tags?.length) {
    throw new Error("Draft is missing required metadata.");
  }

  const nearest = findNearestExistingQuestion(draft.question, corpus);
  if (nearest.score >= 0.72) {
    throw new Error(`Draft was too similar to public question ${nearest.questionId}.`);
  }

  if (questions.some((question) => question.question === draft.question)) {
    throw new Error("Draft unexpectedly appeared in public practice data.");
  }
}

const afterCount = JSON.parse(fs.readFileSync(privateQuestionsPath, "utf8")).length;
if (afterCount !== beforeCount) {
  throw new Error("Private practice data changed during mock generation.");
}

if (fs.existsSync(publicPreviewPath)) {
  const preview = JSON.parse(fs.readFileSync(publicPreviewPath, "utf8"));
  if (JSON.stringify(preview).includes(drafts[0].question)) {
    throw new Error("Draft unexpectedly appeared in the public preview package.");
  }
}

console.log(`Generated ${drafts.length} admin-only draft candidates. Private practice data remains at ${afterCount} questions.`);
