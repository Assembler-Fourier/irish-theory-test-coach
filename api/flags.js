import { getSessionUser, readJsonBody } from "../lib/auth.js";
import { withDb } from "../lib/db.js";
import {
  getAuthServerEnv,
  safeErrorSummary,
  sendSafeConfigError,
} from "../lib/server-env.js";

const MAX_FLAGS_PER_REQUEST = 200;

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
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

    if (req.method === "GET") {
      const flags = await listFlags(env.databaseUrl, user);
      return res.status(200).json({ ok: true, flags });
    }

    const body = await readJsonBody(req);
    const flags = normalizeFlags(body.flags || body.flag || []);
    if (!flags.length) {
      return res.status(400).json({ error: "No flags provided" });
    }

    await saveFlags(env.databaseUrl, user, flags);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Could not sync flags", safeErrorSummary(error));
    return res.status(500).json({ error: "Could not sync flags" });
  }
}

function normalizeFlags(value) {
  const items = Array.isArray(value) ? value : [value];
  return items
    .slice(0, MAX_FLAGS_PER_REQUEST)
    .map((item) => ({
      questionId: Number(item.questionId ?? item.question_id),
      category: cleanText(item.category || "Uncategorised", 160),
      active: Boolean(item.active),
      updatedAt: safeDate(item.updatedAt || item.updated_at),
    }))
    .filter((item) => Number.isInteger(item.questionId));
}

async function listFlags(databaseUrl, user) {
  return withDb(databaseUrl, async (client) => {
    const result = await client.query(
      `
        select question_id, category, updated_at
        from flags
        where user_id = $1
        order by updated_at desc
      `,
      [user.userId]
    );

    return result.rows.map((row) => ({
      questionId: row.question_id,
      category: row.category || "Uncategorised",
      updatedAt: row.updated_at,
    }));
  });
}

async function saveFlags(databaseUrl, user, flags) {
  return withDb(databaseUrl, async (client) => {
    for (const flag of flags) {
      if (flag.active) {
        await client.query(
          `
            insert into flags (user_id, email, question_id, category, created_at, updated_at)
            values ($1, $2, $3, $4, $5, $5)
            on conflict (email, question_id) do update
            set user_id = excluded.user_id,
                category = excluded.category,
                updated_at = excluded.updated_at
          `,
          [user.userId, user.email, flag.questionId, flag.category, flag.updatedAt]
        );
      } else {
        await client.query(
          `
            delete from flags
            where question_id = $3
              and (
                user_id = $1
                or lower(email) = lower($2)
              )
          `,
          [user.userId, user.email, flag.questionId]
        );
      }
    }
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
