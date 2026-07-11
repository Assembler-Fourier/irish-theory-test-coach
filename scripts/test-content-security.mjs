import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import v1Media from "../server/api/v1-media.js";
import v1StudySessions from "../server/api/v1-study-sessions.js";
import { getPrivateQuestionBank } from "../lib/question-bank.js";
import { signMediaToken } from "../lib/study-session-tokens.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicData = path.join(root, "public", "data");
const TEST_EMAIL = "learner@example.test";
const TEST_SECRET = "test-study-session-secret-placeholder";

const tests = [
  ["public build contains no full dataset", testPublicBuildHasNoFullDataset],
  ["public preview contains no answer key", testPublicPreviewHasNoAnswerKey],
  ["logged-out users cannot access premium questions", testLoggedOutPremiumRejected],
  ["expired users cannot access premium questions", testExpiredPremiumRejected],
  ["active paid users can access premium questions", testActivePremiumAllowed],
  ["preview cannot exceed server-side limit", testPreviewLimitEnforced],
  ["answer data returns only after submission", testAnswerRevealAfterSubmission],
  ["mock score cannot be forged from client state", testMockScoreCannotBeForged],
  ["protected image routes reject unauthorised requests", testProtectedMediaRejectsUnauthorised],
];

await withTestEnv(async () => {
  for (const [name, test] of tests) {
    await test();
    console.log(`Content security passed: ${name}`);
  }
});

function testPublicBuildHasNoFullDataset() {
  for (const file of ["questions.json", "questions.enriched.json", "hardest_questions.json", "study_report.json", "recovery_report.json"]) {
    assert.equal(fs.existsSync(path.join(publicData, file)), false, `public/data/${file} must not exist.`);
  }
  assert.equal(fs.existsSync(path.join(publicData, "assets")), false, "public/data/assets must not expose the premium media tree.");
  assert.equal(fs.existsSync(path.join(publicData, "preview-questions.json")), true, "preview-questions.json must exist.");
}

function testPublicPreviewHasNoAnswerKey() {
  const preview = JSON.parse(fs.readFileSync(path.join(publicData, "preview-questions.json"), "utf8"));
  assert.ok(Array.isArray(preview.questions), "Preview package must include questions.");
  assert.ok(preview.questions.length <= preview.previewLimit, "Preview package exceeds preview limit.");
  assertNoAnswerKeys(preview);
}

async function testLoggedOutPremiumRejected() {
  const res = await callStudy({
    method: "POST",
    url: "/api/v1/study-sessions",
    body: { mode: "highYield" },
  });
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: "Active access required" });
}

async function testExpiredPremiumRejected() {
  const res = await callStudy({
    method: "POST",
    url: "/api/v1/study-sessions",
    headers: expiredHeaders(),
    body: { mode: "highYield" },
  });
  assert.equal(res.statusCode, 402);
  assert.deepEqual(res.body, { error: "Active access required" });
}

async function testActivePremiumAllowed() {
  const res = await startPremiumSession("highYield");
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.session.accessType, "premium");
  assert.ok(res.body.session.questions.length > 0);
  assertNoAnswerKeys(res.body.session);
}

async function testPreviewLimitEnforced() {
  const res = await callStudy({
    method: "POST",
    url: "/api/v1/study-sessions",
    body: { mode: "revise", limit: 999 },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.session.accessType, "preview");
  assert.ok(res.body.session.questions.length <= 15);
  assertNoAnswerKeys(res.body.session);
}

async function testAnswerRevealAfterSubmission() {
  const sessionRes = await callStudy({
    method: "POST",
    url: "/api/v1/study-sessions",
    body: { mode: "revise" },
  });
  assert.equal(sessionRes.statusCode, 200);
  assertNoAnswerKeys(sessionRes.body.session);

  const question = sessionRes.body.session.questions[0];
  const answerRes = await callStudy({
    method: "POST",
    url: `/api/v1/study-sessions/${encodeURIComponent(sessionRes.body.session.id)}/answers`,
    body: {
      questionId: question.id,
      selectedIndex: 0,
    },
  });
  assert.equal(answerRes.statusCode, 200);
  assert.equal(typeof answerRes.body.result.correct, "boolean");
  assert.equal(typeof answerRes.body.result.correctIndex, "number");
  assert.equal(typeof answerRes.body.result.correctAnswer, "string");
  assert.ok(answerRes.body.result.explanation, "Answer reveal should include explanation after submission.");
  assert.ok(answerRes.body.answerStateToken, "Answer reveal should return signed answer state.");
}

async function testMockScoreCannotBeForged() {
  const sessionRes = await startPremiumSession("exam");
  assert.equal(sessionRes.statusCode, 200);

  const forged = await callStudy({
    method: "POST",
    url: `/api/v1/study-sessions/${encodeURIComponent(sessionRes.body.session.id)}/complete`,
    headers: activeHeaders(),
    body: {
      score: 40,
      total: 40,
      passed: true,
      answerStateToken: "",
    },
  });
  assert.equal(forged.statusCode, 200);
  assert.equal(forged.body.score, 0);
  assert.equal(forged.body.answered, 0);
  assert.equal(forged.body.passed, false);
}

async function testProtectedMediaRejectsUnauthorised() {
  const bank = getPrivateQuestionBank(process.env);
  const question = bank.find((item) => Array.isArray(item.localImagePaths) && item.localImagePaths.length);
  assert.ok(question, "Private bank should include at least one image-backed question for media tests.");
  const token = signMediaToken({
    q: question.id,
    path: question.localImagePaths[0],
    sid: "test-session",
    access: "premium",
    exp: Date.now() + 60_000,
  }, TEST_SECRET);

  const res = await callMedia({
    method: "GET",
    url: `/api/v1/media/${encodeURIComponent(token)}`,
  });
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: "Active access required" });
}

async function startPremiumSession(mode) {
  return callStudy({
    method: "POST",
    url: "/api/v1/study-sessions",
    headers: activeHeaders(),
    body: { mode },
  });
}

function activeHeaders() {
  return {
    "x-test-user-email": TEST_EMAIL,
    "x-test-entitlement": "active",
  };
}

function expiredHeaders() {
  return {
    "x-test-user-email": TEST_EMAIL,
    "x-test-entitlement": "expired",
  };
}

function assertNoAnswerKeys(payload) {
  const text = JSON.stringify(payload);
  assert.doesNotMatch(text, /"correct(Index|Answer|_index|_answer)"\s*:/i);
  assert.doesNotMatch(text, /"isCorrect"\s*:\s*true/i);
  assert.doesNotMatch(text, /"is_correct"\s*:\s*true/i);
  assert.doesNotMatch(text, /"explanation"\s*:\s*"[^\"]+/i);
}

async function callStudy(req) {
  return callHandler(v1StudySessions, req);
}

async function callMedia(req) {
  return callHandler(v1Media, req);
}

async function callHandler(handler, req) {
  const res = createMockResponse();
  await handler({
    method: req.method || "GET",
    url: req.url || "/",
    headers: req.headers || {},
    body: req.body || {},
  }, res);
  return res;
}

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = Buffer.isBuffer(payload) ? payload : String(payload || "");
      return this;
    },
    end(payload = "") {
      this.body = payload;
      return this;
    },
  };
}

async function withTestEnv(callback) {
  const keys = ["NODE_ENV", "STUDY_SESSION_SECRET", "DATABASE_URL", "PUBLIC_SITE_URL"];
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  process.env.NODE_ENV = "test";
  process.env.STUDY_SESSION_SECRET = TEST_SECRET;
  process.env.PUBLIC_SITE_URL = "http://localhost:5173";
  delete process.env.DATABASE_URL;

  try {
    await callback();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}
