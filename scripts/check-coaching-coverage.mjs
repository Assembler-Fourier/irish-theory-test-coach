import assert from "node:assert/strict";
import { buildFallbackExplanation } from "../server/api/ai-explain.js";
import {
  getPrivateQuestionBank,
  revealAnswer,
  selectQuestionsForMode,
  toInitialQuestionPayload,
} from "../lib/question-bank.js";

const bank = getPrivateQuestionBank(process.env);
const failures = [];

for (const question of bank) {
  const initial = toInitialQuestionPayload(question, {
    preview: true,
    publicAssetRoot: "data/preview-assets",
  });
  const initialText = JSON.stringify(initial);
  if (/"correct(Index|Answer)"\s*:|"explanation"\s*:/i.test(initialText)) {
    failures.push({ questionId: question.id, issue: "pre-answer payload exposes answer coaching" });
  }
  if (question.localImagePaths.length && !initial.imageAlt) {
    failures.push({ questionId: question.id, issue: "image has no neutral alt text" });
  }

  const selectedIndex = question.options.findIndex((option) => !option.isCorrect);
  const reveal = revealAnswer(question, selectedIndex >= 0 ? selectedIndex : question.correctIndex);
  if (!reveal.explanation || !reveal.memoryTip || !reveal.coaching?.whyThisMatters) {
    failures.push({ questionId: question.id, issue: "saved coaching response is incomplete" });
  }
  if (!Array.isArray(reveal.coaching?.relatedTopicTags) || !reveal.coaching.relatedTopicTags.length) {
    failures.push({ questionId: question.id, issue: "saved coaching response has no topic tags" });
  }

  const fallback = buildFallbackExplanation({
    questionId: question.id,
    questionText: question.question,
    answerChoices: question.options.map((option) => option.text),
    correctAnswer: reveal.correctAnswer,
    selectedAnswer: question.options[selectedIndex >= 0 ? selectedIndex : question.correctIndex]?.text || reveal.correctAnswer,
    category: question.category,
  });
  if (!fallback.shortExplanation || !fallback.selectedAnswerReview || !fallback.memoryTip || !fallback.relatedTopicTags.length) {
    failures.push({ questionId: question.id, issue: "AI-unavailable fallback is incomplete" });
  }
}

for (const mode of ["revise", "highYield", "hardest", "signs", "exam"]) {
  const selected = selectQuestionsForMode(bank, { mode, limit: mode === "exam" ? 40 : 80 });
  const groups = selected.map((question) => question.sessionGroupId || `sg_single_${question.id}`);
  assert.equal(new Set(groups).size, groups.length, `${mode} selected a repeated runtime duplicate group.`);
}

if (failures.length) {
  console.error(JSON.stringify(failures.slice(0, 50), null, 2));
}

assert.equal(failures.length, 0, "Every published question must have secure answer coaching and a complete fallback.");
console.log(`Coaching coverage passed (${bank.length} published questions, secure reveal plus AI-unavailable fallback).`);
