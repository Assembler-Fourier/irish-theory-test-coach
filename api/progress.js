import { getSessionUser } from "../lib/auth.js";
import { withDb } from "../lib/db.js";
import {
  getAuthServerEnv,
  safeErrorSummary,
  sendSafeConfigError,
} from "../lib/server-env.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
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

    const progress = await buildProgress(env.databaseUrl, user);
    return res.status(200).json({ ok: true, progress });
  } catch (error) {
    console.error("Could not load progress", safeErrorSummary(error));
    return res.status(500).json({ error: "Could not load progress" });
  }
}

async function buildProgress(databaseUrl, user) {
  return withDb(databaseUrl, async (client) => {
    const [attempts, missed, flags, categories] = await Promise.all([
      client.query(
        `
          select question_id,
                 count(*)::int as attempts,
                 count(*) filter (where correct)::int as correct,
                 count(*) filter (where not correct)::int as wrong
          from attempts
          where user_id = $1
          group by question_id
        `,
        [user.userId]
      ),
      client.query(
        `
          select question_id
          from (
            select distinct on (question_id)
                   question_id,
                   correct
            from attempts
            where user_id = $1
            order by question_id, created_at desc, id desc
          ) latest
          where correct = false
          order by question_id
        `,
        [user.userId]
      ),
      client.query(
        `
          select question_id
          from flags
          where user_id = $1
          order by question_id
        `,
        [user.userId]
      ),
      client.query(
        `
          with attempt_summary as (
            select coalesce(nullif(category, ''), 'Uncategorised') as category,
                   count(*)::int as answered,
                   count(*) filter (where correct)::int as correct_count
            from attempts
            where user_id = $1
            group by 1
          ),
          latest_attempts as (
            select distinct on (question_id)
                   question_id,
                   coalesce(nullif(category, ''), 'Uncategorised') as category,
                   correct
            from attempts
            where user_id = $1
            order by question_id, created_at desc, id desc
          ),
          missed_summary as (
            select category,
                   count(*)::int as missed_count
            from latest_attempts
            where correct = false
            group by category
          ),
          flagged_summary as (
            select coalesce(nullif(category, ''), 'Uncategorised') as category,
                   count(*)::int as flagged_count
            from flags
            where user_id = $1
            group by 1
          ),
          category_names as (
            select category from attempt_summary
            union
            select category from missed_summary
            union
            select category from flagged_summary
          )
          select c.category,
                 coalesce(a.answered, 0)::int as answered,
                 coalesce(a.correct_count, 0)::int as correct_count,
                 coalesce(m.missed_count, 0)::int as missed_count,
                 coalesce(f.flagged_count, 0)::int as flagged_count
          from category_names c
          left join attempt_summary a on a.category = c.category
          left join missed_summary m on m.category = c.category
          left join flagged_summary f on f.category = c.category
          order by c.category
        `,
        [user.userId]
      ),
    ]);

    const answers = {};
    for (const row of attempts.rows) {
      answers[String(row.question_id)] = {
        attempts: row.attempts,
        correct: row.correct,
        wrong: row.wrong,
      };
    }

    return {
      answers,
      missed: missed.rows.map((row) => row.question_id),
      flagged: flags.rows.map((row) => row.question_id),
      categories: categories.rows.map((row) => {
        const accuracy = row.answered ? Math.round((row.correct_count / row.answered) * 100) : 0;
        return {
          category: row.category,
          answered: row.answered,
          accuracy,
          missedCount: row.missed_count,
          flaggedCount: row.flagged_count,
          recommendedNextMode: recommendNextMode({
            answered: row.answered,
            accuracy,
            missedCount: row.missed_count,
            flaggedCount: row.flagged_count,
          }),
        };
      }),
    };
  });
}

function recommendNextMode(summary) {
  if (summary.missedCount || summary.flaggedCount) return "review";
  if (summary.answered >= 5 && summary.accuracy < 75) return "highYield";
  if (summary.answered >= 20 && summary.accuracy >= 85) return "exam";
  return "revise";
}
