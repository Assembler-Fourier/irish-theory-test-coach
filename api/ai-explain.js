import crypto from "node:crypto";
import { getSessionUser, readJsonBody } from "../lib/auth.js";
import { withDb } from "../lib/db.js";
import {
  getAuthServerEnv,
  safeErrorSummary,
  sendSafeConfigError,
} from "../lib/server-env.js";

const AI_TIMEOUT_MS = 12000;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const USER_RATE_LIMIT = 30;
const GUEST_RATE_LIMIT = 8;
const MAX_OPTIONS = 6;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let env;
  try {
    env = getAuthServerEnv();
  } catch (error) {
    return sendSafeConfigError(res, error);
  }

  try {
    const body = await readJsonBody(req);
    const input = normalizeExplanationRequest(body);
    const user = await getSessionUser(req, env.databaseUrl);
    const selectedAnswerHash = hashValue(input.selectedAnswer);
    const rateKey = buildRateKey(req, user);

    const cached = await withDb(env.databaseUrl, async (client) => {
      await enforceRateLimit(client, rateKey, user ? USER_RATE_LIMIT : GUEST_RATE_LIMIT);
      return findCachedExplanation(client, input.questionId, selectedAnswerHash);
    });

    if (cached) {
      return res.status(200).json({
        ok: true,
        cached: true,
        fallback: Boolean(cached.fallback),
        explanation: cached.payload,
      });
    }

    const providerEnv = getAiProviderEnv();
    let explanation;
    let provider = "fallback";
    let model = "local-fallback";
    let fallback = true;

    if (providerEnv.configured) {
      try {
        explanation = await generateAiExplanation(input, providerEnv);
        provider = providerEnv.provider;
        model = providerEnv.model;
        fallback = false;
      } catch (error) {
        console.error("AI explanation provider failed", safeErrorSummary(error));
      }
    }

    if (!explanation) {
      explanation = buildFallbackExplanation(input);
    }

    const saved = await saveCachedExplanation(env.databaseUrl, {
      input,
      selectedAnswerHash,
      explanation,
      provider,
      model,
      fallback,
    });

    return res.status(200).json({
      ok: true,
      cached: false,
      fallback,
      explanation: saved.payload,
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({ error: "Question details are incomplete" });
    }

    if (error.statusCode === 429) {
      return res.status(429).json({ error: "Too many explanation requests. Try again later." });
    }

    console.error("Could not build explanation", safeErrorSummary(error));
    return res.status(500).json({ error: "Could not create explanation" });
  }
}

function normalizeExplanationRequest(body) {
  const questionId = Number(body.questionId ?? body.question_id);
  const questionText = cleanText(body.questionText || body.question || body.text, 1200);
  const answerChoices = normalizeAnswerChoices(body.answerChoices || body.options || body.answers);
  const correctAnswer = cleanText(body.correctAnswer || body.correct_answer, 700);
  const selectedAnswer = cleanText(body.selectedAnswer || body.selected_answer, 700);
  const category = cleanText(body.category || "Uncategorised", 160) || "Uncategorised";

  if (
    !Number.isInteger(questionId) ||
    !questionText ||
    !answerChoices.length ||
    !correctAnswer ||
    !selectedAnswer
  ) {
    throwStatus(400);
  }

  return {
    questionId,
    questionText,
    answerChoices,
    correctAnswer,
    selectedAnswer,
    category,
  };
}

function normalizeAnswerChoices(value) {
  const items = Array.isArray(value) ? value : [];
  return items
    .slice(0, MAX_OPTIONS)
    .map((item) => {
      if (typeof item === "string") return cleanText(item, 700);
      return cleanText(item?.text || item?.label || item?.answer, 700);
    })
    .filter(Boolean);
}

async function enforceRateLimit(client, rateKey, limit) {
  const windowStart = new Date(Math.floor(Date.now() / RATE_WINDOW_MS) * RATE_WINDOW_MS).toISOString();
  const result = await client.query(
    `
      insert into ai_explanation_rate_limits (rate_key, window_start, request_count)
      values ($1, $2, 1)
      on conflict (rate_key, window_start)
      do update
        set request_count = ai_explanation_rate_limits.request_count + 1,
            updated_at = now()
      returning request_count
    `,
    [rateKey, windowStart]
  );

  if (Number(result.rows[0]?.request_count || 0) > limit) {
    throwStatus(429);
  }
}

async function findCachedExplanation(client, questionId, selectedAnswerHash) {
  const result = await client.query(
    `
      update ai_explanations
      set last_used_at = now()
      where question_id = $1
        and selected_answer_hash = $2
      returning payload, fallback
    `,
    [questionId, selectedAnswerHash]
  );

  return result.rows[0] || null;
}

async function saveCachedExplanation(databaseUrl, record) {
  return withDb(databaseUrl, async (client) => {
    const result = await client.query(
      `
        insert into ai_explanations (
          question_id,
          selected_answer_hash,
          selected_answer,
          correct_answer,
          category,
          question_text_hash,
          payload,
          provider,
          model,
          fallback
        )
        values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)
        on conflict (question_id, selected_answer_hash)
        do update
          set payload = excluded.payload,
              provider = excluded.provider,
              model = excluded.model,
              fallback = excluded.fallback,
              updated_at = now(),
              last_used_at = now()
        returning payload, fallback
      `,
      [
        record.input.questionId,
        record.selectedAnswerHash,
        record.input.selectedAnswer,
        record.input.correctAnswer,
        record.input.category,
        hashValue(record.input.questionText),
        JSON.stringify(record.explanation),
        record.provider,
        record.model,
        record.fallback,
      ]
    );

    return result.rows[0];
  });
}

function getAiProviderEnv() {
  const apiKey = process.env.AI_EXPLANATION_API_KEY || process.env.OPENAI_API_KEY || "";
  return {
    configured: Boolean(apiKey),
    provider: "openai-compatible",
    apiKey,
    apiUrl: process.env.AI_EXPLANATION_API_URL || "https://api.openai.com/v1/chat/completions",
    model: process.env.AI_EXPLANATION_MODEL || "gpt-4o-mini",
  };
}

async function generateAiExplanation(input, env) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const response = await fetch(env.apiUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You are an Irish driving theory practice coach for an independent practice app.",
              "Use only the supplied question, answer choices, selected answer, correct answer, and category.",
              "Keep the explanation concise and practical for a learner driver.",
              "Do not claim official exam prediction.",
              "Do not mention RSA affiliation.",
              "Do not invent legal certainty beyond supplied content.",
              "Return JSON only with keys: shortExplanation, selectedAnswerReview, memoryTip, relatedTopicTags.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              questionId: input.questionId,
              category: input.category,
              question: input.questionText,
              answerChoices: input.answerChoices,
              correctAnswer: input.correctAnswer,
              selectedAnswer: input.selectedAnswer,
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error("AI provider rejected explanation request.");
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    return normalizeAiExplanation(parseJsonObject(content), input);
  } finally {
    clearTimeout(timeout);
  }
}

export function buildFallbackExplanation(input) {
  const selectedIsCorrect = answersMatch(input.selectedAnswer, input.correctAnswer);
  const category = input.category || "this topic";

  return {
    shortExplanation: cleanText(
      `The saved correct answer is: ${input.correctAnswer}. Focus on the key rule in the question before comparing the options.`,
      420
    ),
    selectedAnswerReview: selectedIsCorrect
      ? "Your selected answer matches the saved correct answer. Now make sure you understand the rule, not just the wording."
      : cleanText(
          `Your selected answer was: ${input.selectedAnswer}. Compare it with the saved correct answer and look for the safety or rule detail that changes the outcome.`,
          420
        ),
    memoryTip: cleanText(
      `For ${category} questions, pause on words like must, should, safest, first, and except before choosing.`,
      260
    ),
    relatedTopicTags: buildFallbackTags(category, selectedIsCorrect),
  };
}

export function normalizeAiExplanation(value, input = {}) {
  const fallback = buildFallbackExplanation({
    questionId: input.questionId || 0,
    questionText: input.questionText || "",
    answerChoices: input.answerChoices || [],
    correctAnswer: input.correctAnswer || "the saved correct answer",
    selectedAnswer: input.selectedAnswer || "your selected answer",
    category: input.category || "practice",
  });

  const tags = Array.isArray(value?.relatedTopicTags)
    ? value.relatedTopicTags
    : Array.isArray(value?.related_topic_tags)
      ? value.related_topic_tags
      : [];

  const normalizedTags = tags.map((tag) => cleanTag(tag)).filter(Boolean).slice(0, 5);

  return {
    shortExplanation:
      cleanText(value?.shortExplanation || value?.short_explanation || value?.explanation, 420) ||
      fallback.shortExplanation,
    selectedAnswerReview:
      cleanText(value?.selectedAnswerReview || value?.selected_answer_review || value?.answerReview, 420) ||
      fallback.selectedAnswerReview,
    memoryTip: cleanText(value?.memoryTip || value?.memory_tip, 260) || fallback.memoryTip,
    relatedTopicTags: normalizedTags.length ? normalizedTags : fallback.relatedTopicTags,
  };
}

function parseJsonObject(content) {
  if (!content || typeof content !== "string") {
    throw new Error("AI provider response was empty.");
  }

  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI provider response was not JSON.");
    return JSON.parse(match[0]);
  }
}

function buildFallbackTags(category, selectedIsCorrect) {
  const tags = [category, selectedIsCorrect ? "answer check" : "missed answer", "memory tip"];
  return tags.map((tag) => cleanTag(tag)).filter(Boolean).slice(0, 5);
}

function answersMatch(left, right) {
  return cleanComparable(left) === cleanComparable(right);
}

function cleanComparable(value) {
  return cleanText(value, 700).toLowerCase();
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanTag(value) {
  return cleanText(value, 40).replace(/[^\w\s/-]/g, "").trim();
}

function buildRateKey(req, user) {
  if (user?.userId) return `user:${user.userId}`;
  const ip = firstHeaderValue(req.headers?.["x-forwarded-for"]) || req.socket?.remoteAddress || "unknown";
  const ua = firstHeaderValue(req.headers?.["user-agent"]) || "unknown";
  return `guest:${hashValue(`${ip}:${ua}`)}`;
}

function firstHeaderValue(value) {
  if (Array.isArray(value)) return value[0] || "";
  return String(value || "").split(",")[0].trim();
}

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function throwStatus(statusCode) {
  const error = new Error(`HTTP ${statusCode}`);
  error.statusCode = statusCode;
  throw error;
}
