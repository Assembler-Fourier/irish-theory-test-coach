import { createServer } from "node:http";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const publicDir = path.join(repoRoot, "public");
export const reportsDir = path.join(repoRoot, "reports");

export function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const local = tryRequirePlaywright(require, "project dependencies");
  if (local) return local;

  const configuredRoot = process.env.PLAYWRIGHT_NODE_MODULES;
  if (configuredRoot) {
    const configured = tryRequirePlaywrightFromRoot(require, configuredRoot, "PLAYWRIGHT_NODE_MODULES");
    if (configured) return configured;
  }

  const bundledRoot = path.join(
    os.homedir(),
    ".cache",
    "codex-runtimes",
    "codex-primary-runtime",
    "dependencies",
    "node",
    "node_modules"
  );
  const bundled = tryRequirePlaywrightFromRoot(require, bundledRoot, "Codex bundled runtime");
  if (bundled) return bundled;

  throw new Error("Playwright is not available. Install playwright or set PLAYWRIGHT_NODE_MODULES.");
}

export async function startStaticServer(options = {}) {
  const serverState = {
    sessions: new Map(),
    questions: options.mockApi ? await loadQuestionBank() : [],
  };

  const server = createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
      if (requestUrl.pathname.startsWith("/api/")) {
        if (await handleMockApi(req, res, requestUrl, serverState, options)) return;
      }

      const filePath = await resolvePublicPath(req.url || "/");
      if (!filePath) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      const body = await readFile(filePath);
      res.writeHead(200, { "Content-Type": contentTypeFor(filePath) });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

export async function resetDirectory(dirPath) {
  rmSync(dirPath, { recursive: true, force: true });
  mkdirSync(dirPath, { recursive: true });
}

export async function writeJson(filePath, data) {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function isHorizontalScrollSafe(metrics, tolerance = 1) {
  return metrics.scrollWidth <= metrics.clientWidth + tolerance && metrics.bodyScrollWidth <= metrics.innerWidth + tolerance;
}

export async function pageMetrics(page) {
  return page.evaluate(() => ({
    innerWidth: window.innerWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body?.scrollWidth || 0,
    overflowX: getComputedStyle(document.documentElement).overflowX,
    activeElement: document.activeElement?.tagName || "",
  }));
}

async function handleMockApi(req, res, requestUrl, state, options) {
  if (requestUrl.pathname.startsWith("/api/admin/")) {
    sendJson(res, 403, { error: "admin_access_required" });
    return true;
  }

  if (requestUrl.pathname === "/api/me") {
    sendJson(res, 200, { authenticated: false, entitlement: { active: false } });
    return true;
  }

  if (requestUrl.pathname === "/api/account") {
    sendJson(res, 200, { authenticated: false, entitlement: { active: false } });
    return true;
  }

  if (requestUrl.pathname === "/api/account-export") {
    sendJson(res, 401, { error: "Login required" });
    return true;
  }

  if (requestUrl.pathname === "/api/delete-account-request") {
    sendJson(res, 401, { error: "Login required" });
    return true;
  }

  if (requestUrl.pathname === "/api/logout" || requestUrl.pathname === "/api/logout-all") {
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (requestUrl.pathname === "/api/events") {
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (requestUrl.pathname === "/api/request-login-link") {
    sendJson(res, 200, { ok: true, message: "If that email has access, a link has been sent." });
    return true;
  }

  if (requestUrl.pathname === "/api/consume-login-link") {
    sendJson(res, 410, { error: "Login link expired", code: "expired_link" });
    return true;
  }

  if (requestUrl.pathname === "/api/ai-explain") {
    sendJson(res, 200, {
      ok: true,
      fallback: true,
      cached: false,
      explanation: {
        shortExplanation: "Use the rule in the question and compare the safest action.",
        selectedAnswerReview: "Check whether your selected answer matches the saved correct answer.",
        memoryTip: "Look for must, never, first, and safest before choosing.",
        relatedTopicTags: ["practice", "review"],
      },
    });
    return true;
  }

  if (!options.mockApi || !requestUrl.pathname.startsWith("/api/v1/study-sessions")) {
    sendJson(res, 404, { error: "API route not found" });
    return true;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/v1/study-sessions") {
    const body = await readJsonBody(req);
    const mode = cleanMode(body.mode || "revise");
    const isPremium = Boolean(body.premium) || ["highYield", "hardest", "signs", "review", "exam"].includes(mode);
    if (isPremium && !options.premiumAccess) {
      sendJson(res, 401, { error: "Active access required" });
      return true;
    }

    const selected = selectQuestions(state.questions, mode, mode === "exam" ? 40 : 15);
    const sessionId = `test-session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    state.sessions.set(sessionId, { mode, selected, answers: new Map(), startedAt: Date.now() });
    sendJson(res, 200, {
      ok: true,
      session: {
        id: sessionId,
        publicId: sessionId,
        mode,
        accessType: isPremium ? "premium" : "preview",
        questionCount: selected.length,
        startedAt: new Date().toISOString(),
        durationSeconds: mode === "exam" ? 45 * 60 : 0,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        questions: selected.map(toInitialQuestionPayload),
      },
    });
    return true;
  }

  const answerMatch = requestUrl.pathname.match(/^\/api\/v1\/study-sessions\/([^/]+)\/answers$/);
  if (req.method === "POST" && answerMatch) {
    const body = await readJsonBody(req);
    const session = state.sessions.get(decodeURIComponent(answerMatch[1]));
    const question = session?.selected.find((item) => Number(item.id) === Number(body.questionId));
    if (!session || !question) {
      sendJson(res, 400, { error: "Invalid answer submission" });
      return true;
    }

    const selectedIndex = Number(body.selectedIndex);
    const result = revealAnswer(question, selectedIndex);
    session.answers.set(String(question.id), { selectedIndex, correct: result.correct });
    sendJson(res, 200, { ok: true, result, answerStateToken: "test-answer-state" });
    return true;
  }

  const completeMatch = requestUrl.pathname.match(/^\/api\/v1\/study-sessions\/([^/]+)\/complete$/);
  if (req.method === "POST" && completeMatch) {
    const session = state.sessions.get(decodeURIComponent(completeMatch[1]));
    const answers = Array.from(session?.answers.values() || []);
    const score = answers.filter((answer) => answer.correct).length;
    const total = session?.mode === "exam" ? session.selected.length : answers.length;
    sendJson(res, 200, { ok: true, completed: true, mode: session?.mode || "revise", score, total, answered: answers.length, passed: score >= 35 });
    return true;
  }

  if (req.method === "POST" && /\/flags$/.test(requestUrl.pathname)) {
    sendJson(res, 200, { ok: true });
    return true;
  }

  sendJson(res, 404, { error: "Study session route not found" });
  return true;
}

async function resolvePublicPath(requestUrl) {
  const url = new URL(requestUrl, "http://127.0.0.1");
  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const resolved = path.resolve(publicDir, relativePath);
  if (!(resolved === publicDir || resolved.startsWith(`${publicDir}${path.sep}`))) return null;

  if (existsSync(resolved) && (await stat(resolved)).isDirectory()) {
    return path.join(resolved, "index.html");
  }
  if (existsSync(resolved)) return resolved;

  const htmlPath = `${resolved}.html`;
  if (existsSync(htmlPath)) return htmlPath;
  return null;
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".xml": "application/xml; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".png": "image/png",
    ".webp": "image/webp",
  }[ext] || "application/octet-stream";
}

function tryRequirePlaywright(require, label) {
  try {
    return require("playwright");
  } catch (error) {
    if (process.env.UI_BASELINE_DEBUG) console.warn(`Could not load Playwright from ${label}: ${error.message}`);
    return null;
  }
}

function tryRequirePlaywrightFromRoot(require, moduleRoot, label) {
  if (!moduleRoot || !existsSync(moduleRoot)) return null;

  try {
    const resolved = require.resolve("playwright", { paths: [moduleRoot] });
    return require(resolved);
  } catch (error) {
    if (process.env.UI_BASELINE_DEBUG) console.warn(`Direct Playwright load failed from ${label}: ${error.message}`);
  }

  const pnpmRoot = path.join(moduleRoot, ".pnpm");
  if (!existsSync(pnpmRoot)) return null;

  for (const entry of readdirSync(pnpmRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("playwright@")) continue;
    const candidate = path.join(pnpmRoot, entry.name, "node_modules", "playwright", "index.js");
    if (!existsSync(candidate)) continue;
    try {
      return require(candidate);
    } catch (error) {
      if (process.env.UI_BASELINE_DEBUG) console.warn(`PNPM Playwright load failed from ${candidate}: ${error.message}`);
    }
  }

  return null;
}

async function loadQuestionBank() {
  const raw = JSON.parse(await readFile(path.join(repoRoot, "data", "questions.enriched.json"), "utf8"));
  const questions = Array.isArray(raw) ? raw : raw.questions;
  return questions.filter((question) => question?.question && Array.isArray(question.options) && question.options.length >= 2);
}

function selectQuestions(questions, mode, limit) {
  let pool = questions.slice();
  if (mode === "highYield") pool = pool.filter((question) => Number(question.priority_score || 0) >= 68);
  if (mode === "signs") pool = pool.filter((question) => question.is_road_sign || question.local_image_paths?.length || question.image_urls?.length);
  if (mode === "hardest") pool = pool.filter((question) => Number(question.hardest_rank || 0) > 0);
  if (mode === "review") pool = questions.slice(0, limit);
  if (mode === "exam") pool = questions.slice(0, Math.max(limit, 40));
  return pool.slice(0, limit);
}

function toInitialQuestionPayload(question) {
  return {
    id: question.id,
    question: question.question,
    prompt: question.question,
    options: question.options.map((option, index) => ({ index, text: option.text })),
    category: question.category || "Uncategorised",
    categoryKey: question.category_key || "",
    originalCategory: question.original_category || question.category || "",
    canonicalQuestionId: question.canonical_question_id || question.id,
    variantGroupId: question.variant_group_id || "",
    duplicateReviewStatus: question.duplicate_review_status || "",
    priorityScore: Number(question.priority_score || 50),
    priorityLabel: question.priority_label || "Standard",
    studySignals: Array.isArray(question.study_signals) ? question.study_signals.slice(0, 6) : [],
    scoreBreakdown: question.score_breakdown || {},
    isRoadSign: Boolean(question.is_road_sign),
    hardestRank: Number.isFinite(question.hardest_rank) ? question.hardest_rank : null,
    communityCorrectRate: Number.isFinite(question.community_correct_rate) ? question.community_correct_rate : null,
    importanceNote: question.importance_note || "",
    images: (question.local_image_paths || question.image_urls || []).slice(0, 1),
  };
}

function revealAnswer(question, selectedIndex) {
  const correctIndex = Number.isInteger(question.correct_index)
    ? question.correct_index
    : question.options.findIndex((option) => option.is_correct);
  const correctAnswer = question.correct_answer || question.options[correctIndex]?.text || "";
  return {
    questionId: question.id,
    selectedIndex,
    correct: selectedIndex === correctIndex,
    correctIndex,
    correctAnswer,
    explanation: question.explanation || "Review the rule and compare the safest available action.",
    memoryTip: "Read the question slowly and identify the rule before choosing.",
  };
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function cleanMode(value) {
  return ["revise", "highYield", "hardest", "signs", "review", "exam"].includes(value) ? value : "revise";
}
