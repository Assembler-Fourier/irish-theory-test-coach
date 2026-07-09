import { getSessionUser, readJsonBody } from "../lib/auth.js";
import { withDb } from "../lib/db.js";
import {
  getAuthServerEnv,
  safeErrorSummary,
  sendSafeConfigError,
} from "../lib/server-env.js";

const MAX_ATTEMPTS_PER_REQUEST = 100;

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
    const user = await getSessionUser(req, env.databaseUrl);
    if (!user) {
      return res.status(401).json({ error: "Login required" });
    }

    const body = await readJsonBody(req);
    const attempts = normalizeAttempts(body.attempts || body.attempt || []);
    if (!attempts.length) {
      return res.status(400).json({ error: "No attempts provided" });
    }

    const saved = await saveAttempts(env.databaseUrl, user, attempts);
    return res.status(200).json({ ok: true, saved });
  } catch (error) {
    console.error("Could not save attempts", safeErrorSummary(error));
    return res.status(500).json({ error: "Could not save progress" });
  }
}

function normalizeAttempts(value) {
  const items = Array.isArray(value) ? value : [value];
  return items
    .slice(0, MAX_ATTEMPTS_PER_REQUEST)
    .map((item) => ({
      clientEventId: cleanText(item.clientEventId || item.client_event_id, 120),
      questionId: Number(item.questionId ?? item.question_id),
      selectedIndex: Number.isInteger(item.selectedIndex)
        ? item.selectedIndex
        : Number.isInteger(item.selected_index)
          ? item.selected_index
          : null,
      correct: Boolean(item.correct),
      mode: cleanText(item.mode || "revise", 40),
      category: cleanText(item.category || "Uncategorised", 160),
      answeredAt: safeDate(item.answeredAt || item.created_at),
    }))
    .filter((item) => item.clientEventId && Number.isInteger(item.questionId));
}

async function saveAttempts(databaseUrl, user, attempts) {
  return withDb(databaseUrl, async (client) => {
    let saved = 0;
    for (const attempt of attempts) {
      const result = await client.query(
        `
          insert into attempts (
            user_id,
            email,
            question_id,
            selected_index,
            correct,
            mode,
            category,
            client_event_id,
            created_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          on conflict (user_id, client_event_id)
          where user_id is not null and client_event_id is not null
          do nothing
        `,
        [
          user.userId,
          user.email,
          attempt.questionId,
          attempt.selectedIndex,
          attempt.correct,
          attempt.mode,
          attempt.category,
          attempt.clientEventId,
          attempt.answeredAt,
        ]
      );
      saved += result.rowCount;
    }
    return saved;
  });
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function safeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}
