import { SESSION_COOKIE, getSessionUser, readJsonBody } from "../../lib/auth.js";
import {
  getPrivateQuestionBank,
  findQuestionById,
  revealAnswer,
  selectQuestionsForMode,
  toInitialQuestionPayload,
  cleanMode,
} from "../../lib/question-bank.js";
import { checkRateLimit, limitFromEnv, rateLimitKey, sendRateLimited } from "../../lib/rate-limit.js";
import { recordMockSession } from "../../lib/account-data.js";
import {
  getStudySessionSecret,
  sessionPublicId,
  signAnswerState,
  signSession,
  verifyAnswerStateToken,
  verifySessionToken,
} from "../../lib/study-session-tokens.js";
import { getAuthServerEnv, safeErrorSummary, sendSafeConfigError } from "../../lib/server-env.js";
import { rejectUnverifiedRequest, verifyStateChangingRequest } from "../../lib/security.js";

const PREVIEW_LIMIT = 15;
const PREMIUM_MODES = new Set(["highYield", "hardest", "signs", "review", "exam"]);
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const PREVIEW_SESSION_TTL_MS = 30 * 60 * 1000;

export default async function handler(req, res) {
  try {
    if (req.method === "POST") {
      const origin = verifyStateChangingRequest(req, {
        publicSiteUrl: process.env.PUBLIC_SITE_URL || "http://localhost:5173",
        isProduction: process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production",
      });
      if (!origin.ok) return rejectUnverifiedRequest(res);
    }

    if (req.method === "POST" && routeParts(req).length === 2) {
      return startStudySession(req, res);
    }

    const parts = routeParts(req);
    if (req.method === "GET" && parts.length === 3) {
      return getStudySession(req, res, parts[2]);
    }
    if (req.method === "POST" && parts.length === 4 && parts[3] === "answers") {
      return submitAnswer(req, res, parts[2]);
    }
    if (req.method === "POST" && parts.length === 4 && parts[3] === "flags") {
      return syncFlag(req, res, parts[2]);
    }
    if (req.method === "POST" && parts.length === 4 && parts[3] === "complete") {
      return completeSession(req, res, parts[2]);
    }

    return res.status(404).json({ error: "Study session route not found" });
  } catch (error) {
    if (error?.code === "SERVER_ENV_INVALID" || error?.code === "STUDY_SESSION_SECRET_MISSING") {
      return sendSafeConfigError(res, error);
    }
    console.error("Study session API failed", safeErrorSummary(error));
    return res.status(500).json({ error: "Study session is unavailable" });
  }
}

async function startStudySession(req, res) {
  if (!rateLimit(req, res, "study-session:start", limitFromEnv("RATE_LIMIT_STUDY_SESSION_START", 30), 60_000)) return;

  const secret = getStudySessionSecret(process.env);
  const body = await readJsonBody(req, { maxBytes: 8192 });
  const mode = cleanMode(body.mode || "revise");
  const premiumRequired = PREMIUM_MODES.has(mode) || Boolean(body.premium);
  const user = await resolveStudyUser(req, premiumRequired);

  if (premiumRequired && !hasActiveEntitlement(user)) {
    return res.status(user ? 402 : 401).json({ error: "Active access required" });
  }

  const questions = getPrivateQuestionBank(process.env);
  const accessType = premiumRequired || hasActiveEntitlement(user) ? "premium" : "preview";
  const limit = accessType === "preview" ? PREVIEW_LIMIT : Number(body.limit || 50);
  const selected = selectQuestionsForMode(questions, {
    mode,
    limit,
    preview: accessType === "preview",
    category: cleanText(body.category, 160),
    reviewQuestionIds: Array.isArray(body.reviewQuestionIds) ? body.reviewQuestionIds : [],
  });
  const now = Date.now();
  const durationSeconds = mode === "exam" ? 45 * 60 : 0;
  const sessionPayload = {
    accessType,
    mode,
    q: selected.map((question) => question.id),
    email: user?.email || "",
    startedAt: now,
    durationSeconds,
    exp: now + (accessType === "preview" ? PREVIEW_SESSION_TTL_MS : SESSION_TTL_MS),
  };
  const sessionId = signSession(sessionPayload, secret);
  const publicId = sessionPublicId(sessionId);

  return res.status(200).json({
    ok: true,
    session: buildSessionResponse({
      sessionId,
      publicId,
      payload: sessionPayload,
      questions: selected,
      secret,
    }),
  });
}

async function getStudySession(req, res, sessionId) {
  if (!rateLimit(req, res, "study-session:get", limitFromEnv("RATE_LIMIT_STUDY_SESSION_GET", 80), 60_000)) return;
  const secret = getStudySessionSecret(process.env);
  const payload = verifySessionToken(decodeURIComponent(sessionId), secret);
  if (payload.exp <= Date.now()) return res.status(410).json({ error: "Study session expired" });
  if (payload.accessType === "premium") {
    const user = await resolveStudyUser(req, true);
    if (!hasActiveEntitlement(user) || (payload.email && payload.email !== user.email)) {
      return res.status(401).json({ error: "Active access required" });
    }
  }

  const bank = getPrivateQuestionBank(process.env);
  const selected = payload.q.map((id) => findQuestionById(bank, id)).filter(Boolean);
  return res.status(200).json({
    ok: true,
    session: buildSessionResponse({
      sessionId,
      publicId: sessionPublicId(sessionId),
      payload,
      questions: selected,
      secret,
    }),
  });
}

async function submitAnswer(req, res, sessionId) {
  if (!rateLimit(req, res, "study-session:answer", limitFromEnv("RATE_LIMIT_STUDY_SESSION_ANSWER", 120), 60_000)) return;
  const secret = getStudySessionSecret(process.env);
  const payload = verifySessionToken(decodeURIComponent(sessionId), secret);
  if (payload.exp <= Date.now()) return res.status(410).json({ error: "Study session expired" });
  if (payload.accessType === "premium") {
    const user = await resolveStudyUser(req, true);
    if (!hasActiveEntitlement(user) || (payload.email && payload.email !== user.email)) {
      return res.status(401).json({ error: "Active access required" });
    }
  }

  const body = await readJsonBody(req, { maxBytes: 8192 });
  const questionId = Number(body.questionId);
  const selectedIndex = Number(body.selectedIndex);
  if (!payload.q.includes(questionId) || !Number.isInteger(selectedIndex)) {
    return res.status(400).json({ error: "Invalid answer submission" });
  }

  const bank = getPrivateQuestionBank(process.env);
  const question = findQuestionById(bank, questionId);
  if (!question || selectedIndex < 0 || selectedIndex >= question.options.length) {
    return res.status(400).json({ error: "Invalid answer submission" });
  }

  const previousState = verifyAnswerStateSafely(body.answerStateToken, secret, payload, sessionPublicId(sessionId));
  const result = revealAnswer(question, selectedIndex);
  const answers = {
    ...previousState,
    [String(questionId)]: {
      questionId,
      selectedIndex,
      correct: result.correct,
      answeredAt: Date.now(),
    },
  };
  const answerStateToken = signAnswerState({
    sid: sessionPublicId(sessionId),
    q: payload.q,
    answers,
    exp: payload.exp,
  }, secret);

  return res.status(200).json({
    ok: true,
    result,
    answerStateToken,
  });
}

async function syncFlag(req, res, sessionId) {
  if (!rateLimit(req, res, "study-session:flag", limitFromEnv("RATE_LIMIT_STUDY_SESSION_FLAG", 60), 60_000)) return;
  const secret = getStudySessionSecret(process.env);
  const payload = verifySessionToken(decodeURIComponent(sessionId), secret);
  if (payload.exp <= Date.now()) return res.status(410).json({ error: "Study session expired" });
  const body = await readJsonBody(req, { maxBytes: 4096 });
  const questionId = Number(body.questionId);
  if (!payload.q.includes(questionId)) {
    return res.status(400).json({ error: "Invalid flag request" });
  }
  if (payload.accessType === "premium") {
    const user = await resolveStudyUser(req, true);
    if (!hasActiveEntitlement(user)) return res.status(401).json({ error: "Active access required" });
  }
  return res.status(200).json({ ok: true, questionId, active: Boolean(body.active) });
}

async function completeSession(req, res, sessionId) {
  if (!rateLimit(req, res, "study-session:complete", limitFromEnv("RATE_LIMIT_STUDY_SESSION_COMPLETE", 30), 60_000)) return;
  const secret = getStudySessionSecret(process.env);
  const payload = verifySessionToken(decodeURIComponent(sessionId), secret);
  if (payload.exp <= Date.now()) return res.status(410).json({ error: "Study session expired" });
  let user = null;
  if (payload.accessType === "premium") {
    user = await resolveStudyUser(req, true);
    if (!hasActiveEntitlement(user)) return res.status(401).json({ error: "Active access required" });
  } else {
    user = await resolveStudyUser(req, false);
  }

  const body = await readJsonBody(req, { maxBytes: 8192 });
  const answerState = verifyAnswerStateSafely(body.answerStateToken, secret, payload, sessionPublicId(sessionId));
  const answers = Object.values(answerState).filter((answer) => payload.q.includes(answer.questionId));
  const correct = answers.filter((answer) => answer.correct).length;
  const total = payload.mode === "exam" ? payload.q.length : answers.length;

  const result = {
    ok: true,
    completed: true,
    mode: payload.mode,
    score: correct,
    total,
    answered: answers.length,
    passed: payload.mode === "exam" ? correct >= 35 : null,
    durationSeconds: payload.durationSeconds || 0,
  };

  if (payload.mode === "exam" && user?.userId) {
    await recordMockSession(process.env.DATABASE_URL, user, {
      sessionPublicId: sessionPublicId(sessionId),
      mode: payload.mode,
      score: result.score,
      total: result.total,
      answered: result.answered,
      passed: result.passed,
      durationSeconds: result.durationSeconds,
      startedAt: new Date(payload.startedAt).toISOString(),
    });
  }

  return res.status(200).json(result);
}

function buildSessionResponse({ sessionId, publicId, payload, questions, secret }) {
  return {
    id: sessionId,
    publicId,
    mode: payload.mode,
    accessType: payload.accessType,
    questionCount: questions.length,
    startedAt: new Date(payload.startedAt).toISOString(),
    durationSeconds: payload.durationSeconds || 0,
    expiresAt: new Date(payload.exp).toISOString(),
    questions: questions.map((question) => toInitialQuestionPayload(question, {
      accessType: payload.accessType,
      preview: payload.accessType === "preview",
      sessionPublicId: publicId,
      secret,
    })),
  };
}

async function resolveStudyUser(req, required) {
  const testUser = testHeaderUser(req);
  if (testUser) return testUser;
  if (!required) return null;
  if (!hasCookie(req, SESSION_COOKIE)) return null;
  let env;
  try {
    env = getAuthServerEnv();
  } catch (error) {
    throw error;
  }
  return getSessionUser(req, env.databaseUrl);
}

function hasCookie(req, name) {
  const header = String(req.headers?.cookie || "");
  return header.split(";").map((part) => part.trim()).some((part) => part.startsWith(`${name}=`));
}

function testHeaderUser(req) {
  if (process.env.NODE_ENV !== "test") return null;
  const email = cleanText(req.headers?.["x-test-user-email"], 200);
  if (!email) return null;
  const entitlement = String(req.headers?.["x-test-entitlement"] || "").toLowerCase();
  return {
    userId: "00000000-0000-0000-0000-000000000001",
    email,
    role: "user",
    entitlement: {
      active: entitlement === "active",
      expired: entitlement === "expired",
      product: "irish-theory-test-coach",
    },
  };
}

function hasActiveEntitlement(user) {
  return Boolean(user?.entitlement?.active);
}

function verifyAnswerStateSafely(token, secret, sessionPayload, expectedSid) {
  if (!token) return {};
  try {
    const payload = verifyAnswerStateToken(token, secret);
    if (payload.sid !== expectedSid) return {};
    if (payload.exp <= Date.now()) return {};
    return payload.answers && typeof payload.answers === "object" ? payload.answers : {};
  } catch {
    return {};
  }
}

function rateLimit(req, res, scope, limit, windowMs) {
  const result = checkRateLimit({ key: rateLimitKey(req, scope), limit, windowMs });
  if (!result.allowed) {
    sendRateLimited(res, result);
    return false;
  }
  return true;
}

function routeParts(req) {
  const url = new URL(req.url || "/", "http://localhost");
  return url.pathname.replace(/^\/api\/?/, "").split("/").map((part) => part.trim()).filter(Boolean);
}

function cleanText(value, maxLength = 120) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
