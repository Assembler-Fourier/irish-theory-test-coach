import { getSessionUser, readJsonBody } from "../../lib/auth.js";
import { withDb } from "../../lib/db.js";
import { checkRateLimit, limitFromEnv, rateLimitKey, sendRateLimited } from "../../lib/rate-limit.js";
import { rejectUnverifiedRequest, verifyStateChangingRequest } from "../../lib/security.js";
import {
  getAuthServerEnv,
  safeErrorSummary,
  sendSafeConfigError,
} from "../../lib/server-env.js";

const REASONS = new Set([
  "answer",
  "wording",
  "image",
  "explanation",
  "category",
  "technical",
  "other",
]);
const ANONYMOUS_ID_PATTERN = /^[a-zA-Z0-9:_-]{12,90}$/;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const limit = checkRateLimit({
    key: rateLimitKey(req, "question-feedback"),
    limit: limitFromEnv("RATE_LIMIT_QUESTION_FEEDBACK", 8),
    windowMs: 60_000,
  });
  if (!limit.allowed) return sendRateLimited(res, limit);

  let env;
  try {
    env = getAuthServerEnv();
  } catch (error) {
    return sendSafeConfigError(res, error);
  }

  const origin = verifyStateChangingRequest(req, env);
  if (!origin.ok) {
    return rejectUnverifiedRequest(res);
  }

  try {
    const body = await readJsonBody(req, { maxBytes: 8192 });
    const report = normalizeReport(body);
    if (!report) {
      return res.status(400).json({ error: "Question report could not be saved" });
    }

    const session = await getSessionUser(req, env.databaseUrl).catch(() => null);
    const saved = await saveReport(env.databaseUrl, session, report);
    return res.status(200).json({ ok: true, reportId: saved.id });
  } catch (error) {
    console.error("Could not save question report", safeErrorSummary(error));
    return res.status(500).json({ error: "Question report could not be saved" });
  }
}

function normalizeReport(body) {
  const questionId = Number(body.questionId || body.question_id);
  const reasonCategory = cleanText(body.reasonCategory || body.reason_category, 40).toLowerCase();
  const anonymousId = cleanText(body.anonymousId || body.anonymous_id, 90);

  if (!Number.isInteger(questionId) || !REASONS.has(reasonCategory)) return null;
  if (anonymousId && !ANONYMOUS_ID_PATTERN.test(anonymousId)) return null;

  return {
    questionId,
    reasonCategory,
    comment: cleanText(body.comment, 1200),
    appVersion: cleanText(body.appVersion || body.app_version, 120),
    contentVersion: cleanText(body.contentVersion || body.content_version, 120),
    anonymousId,
    reviewState: cleanText(body.reviewState || body.review_state || "open", 60),
  };
}

async function saveReport(databaseUrl, session, report) {
  return withDb(databaseUrl, async (client) => {
    const result = await client.query(
      `
        insert into question_problem_reports (
          question_id,
          reason_category,
          comment,
          app_version,
          content_version,
          anonymous_id,
          user_id,
          email,
          review_state
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        returning id
      `,
      [
        report.questionId,
        report.reasonCategory,
        report.comment || null,
        report.appVersion || null,
        report.contentVersion || null,
        report.anonymousId || null,
        session?.userId || null,
        session?.email || null,
        report.reviewState || "open",
      ]
    );
    return result.rows[0];
  });
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
