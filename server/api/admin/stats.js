import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireAdmin, sendAdminError } from "../../../lib/admin.js";
import { withDb } from "../../../lib/db.js";
import {
  getAuthServerEnv,
  safeErrorSummary,
  sendSafeConfigError,
} from "../../../lib/server-env.js";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..", "..", "..");
const FUNNEL_EVENTS = [
  "page_view",
  "preview_started",
  "paywall_viewed",
  "checkout_clicked",
  "checkout_success",
  "restore_access_clicked",
  "restore_access_started",
  "restore_access_success",
  "pricing_page_viewed",
  "referral_code_applied",
  "referral_checkout_started",
  "mock_started",
  "mock_completed",
];

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
    await requireAdmin(req, env.databaseUrl);
    const [dbStats, questionStats] = await Promise.all([
      loadDbStats(env.databaseUrl),
      loadQuestionStats(),
    ]);
    return res.status(200).json({ ok: true, stats: { ...dbStats, questions: questionStats } });
  } catch (error) {
    console.error("Admin stats failed", safeErrorSummary(error));
    return sendAdminError(res, error);
  }
}

async function loadDbStats(databaseUrl) {
  return withDb(databaseUrl, async (client) => {
    const [
      totals,
      attemptSummary,
      recentPurchases,
      recentAudit,
      revenue,
      planSales,
      referralPerformance,
    ] = await Promise.all([
      client.query(`
        select
          (select count(*)::int from users) as users,
          (select count(*)::int from users where role = 'admin') as admins,
          (select count(*)::int from purchases) as purchases,
          (
            select count(*)::int
            from entitlements
            where active = true
              and revoked_at is null
              and (expires_at is null or expires_at > now())
          ) as active_entitlements,
          (
            select count(*)::int
            from entitlements
            where active = false
              or revoked_at is not null
              or (expires_at is not null and expires_at <= now())
          ) as inactive_entitlements,
          (select count(*)::int from attempts) as attempts,
          (select count(*)::int from flags) as flags,
          (select count(*)::int from source_documents) as source_documents,
          (select count(*)::int from generated_questions where status = 'draft') as generated_question_drafts,
          (select count(*)::int from generated_questions where status = 'approved') as generated_question_approved
      `),
      client.query(`
        with latest_attempts as (
          select distinct on (user_id, question_id)
                 user_id,
                 question_id,
                 coalesce(nullif(category, ''), 'Uncategorised') as category,
                 correct
          from attempts
          where user_id is not null
          order by user_id, question_id, created_at desc, id desc
        ),
        flags_by_category as (
          select coalesce(nullif(category, ''), 'Uncategorised') as category,
                 count(*)::int as flagged_count
          from flags
          group by 1
        ),
        attempts_by_category as (
          select coalesce(nullif(category, ''), 'Uncategorised') as category,
                 count(*)::int as answered,
                 count(*) filter (where correct)::int as correct_count,
                 count(*) filter (where not correct)::int as missed_count
          from latest_attempts
          group by 1
        ),
        category_names as (
          select category from attempts_by_category
          union
          select category from flags_by_category
        )
        select c.category,
               coalesce(a.answered, 0)::int as answered,
               coalesce(a.correct_count, 0)::int as correct_count,
               coalesce(a.missed_count, 0)::int as missed_count,
               coalesce(f.flagged_count, 0)::int as flagged_count
        from category_names c
        left join attempts_by_category a on a.category = c.category
        left join flags_by_category f on f.category = c.category
        order by missed_count desc, flagged_count desc, answered desc
        limit 10
      `),
      client.query(`
        select email, stripe_checkout_session_id, stripe_payment_intent_id, plan_key, referral_code, amount, currency, status, created_at
        from purchases
        order by created_at desc
        limit 8
      `),
      client.query(`
        select admin_email, action, target_type, target_email, target_id, metadata, created_at
        from admin_audit_log
        order by created_at desc
        limit 10
      `),
      client.query(`
        select coalesce(sum(amount) filter (where status in ('paid', 'complete', 'succeeded')), 0)::int as gross_revenue,
               round((coalesce(sum(amount) filter (where status in ('paid', 'complete', 'succeeded')), 0) * 0.015) + (count(*) filter (where status in ('paid', 'complete', 'succeeded')) * 25))::int as estimated_stripe_fees,
               count(*) filter (where status in ('refunded'))::int as refund_count,
               coalesce(sum(amount) filter (where referral_code is not null and status in ('paid', 'complete', 'succeeded')), 0)::int as referral_revenue
        from purchases
      `),
      client.query(`
        select coalesce(nullif(plan_key, ''), 'unknown') as plan_key,
               count(*)::int as sales,
               coalesce(sum(amount) filter (where status in ('paid', 'complete', 'succeeded')), 0)::int as revenue
        from purchases
        group by 1
        order by revenue desc, sales desc
      `),
      client.query(`
        select rc.code,
               rc.description,
               rc.fixed_price_plan,
               count(rr.id)::int as redemptions,
               count(rr.id) filter (where rr.status = 'checkout_started')::int as checkout_starts,
               count(rr.id) filter (where rr.status = 'purchased')::int as purchases,
               coalesce(sum(p.amount) filter (where p.status in ('paid', 'complete', 'succeeded')), 0)::int as revenue
        from referral_codes rc
        left join referral_redemptions rr on rr.code = rc.code
        left join purchases p on p.stripe_checkout_session_id = rr.stripe_checkout_session_id
        group by rc.code
        order by revenue desc, redemptions desc
        limit 20
      `),
    ]);
    const analytics = await loadAnalyticsStats(client);
    const revenueRow = revenue.rows[0] || {};
    const grossRevenue = Number(revenueRow.gross_revenue || 0);
    const estimatedStripeFees = Number(revenueRow.estimated_stripe_fees || 0);

    return {
      totals: totals.rows[0],
      revenue: {
        grossRevenue,
        estimatedStripeFees,
        estimatedNetRevenue: Math.max(0, grossRevenue - estimatedStripeFees),
        refundCount: Number(revenueRow.refund_count || 0),
        referralRevenue: Number(revenueRow.referral_revenue || 0),
        salesByPlan: planSales.rows.map((row) => ({
          planKey: row.plan_key,
          sales: Number(row.sales || 0),
          revenue: Number(row.revenue || 0),
        })),
        referralPerformance: referralPerformance.rows.map((row) => ({
          code: row.code,
          description: row.description || "",
          fixedPricePlan: row.fixed_price_plan || "",
          redemptions: Number(row.redemptions || 0),
          checkoutStarts: Number(row.checkout_starts || 0),
          purchases: Number(row.purchases || 0),
          revenue: Number(row.revenue || 0),
          conversionRate: Number(row.checkout_starts || 0)
            ? Math.round((Number(row.purchases || 0) / Number(row.checkout_starts || 0)) * 100)
            : 0,
        })),
      },
      attemptSummary: attemptSummary.rows.map((row) => ({
        category: row.category,
        answered: row.answered,
        accuracy: row.answered ? Math.round((row.correct_count / row.answered) * 100) : 0,
        missedCount: row.missed_count,
        flaggedCount: row.flagged_count,
      })),
      recentPurchases: recentPurchases.rows,
      recentAudit: recentAudit.rows,
      analytics,
    };
  });
}

async function loadAnalyticsStats(client) {
  const tableResult = await client.query("select to_regclass('public.events') as table_name");
  if (!tableResult.rows[0]?.table_name) {
    return emptyAnalyticsStats();
  }

  const [
    funnel,
    missedCategories,
    missedQuestions,
    paywall,
    eventCount,
  ] = await Promise.all([
    client.query(
      `
        select event_name,
               count(*)::int as events,
               count(distinct anonymous_id)::int as visitors
        from events
        where created_at >= now() - interval '30 days'
          and event_name = any($1)
        group by event_name
      `,
      [FUNNEL_EVENTS]
    ),
    client.query(`
      select coalesce(nullif(properties->>'category', ''), 'Uncategorised') as category,
             count(*)::int as misses
      from events
      where event_name = 'answer_wrong'
        and created_at >= now() - interval '30 days'
      group by 1
      order by misses desc, category asc
      limit 10
    `),
    client.query(`
      select (properties->>'questionId')::int as question_id,
             coalesce(nullif(properties->>'category', ''), 'Uncategorised') as category,
             count(*)::int as misses
      from events
      where event_name = 'answer_wrong'
        and created_at >= now() - interval '30 days'
        and properties->>'questionId' ~ '^[0-9]+$'
      group by 1, 2
      order by misses desc, question_id asc
      limit 10
    `),
    client.query(`
      select count(*) filter (where event_name = 'paywall_viewed')::int as paywall_views,
             count(*) filter (where event_name = 'checkout_clicked')::int as checkout_clicks
      from events
      where created_at >= now() - interval '30 days'
        and event_name in ('paywall_viewed', 'checkout_clicked')
    `),
    client.query(`
      select count(*)::int as total
      from events
      where created_at >= now() - interval '30 days'
    `),
  ]);

  const byName = new Map(funnel.rows.map((row) => [row.event_name, row]));
  const paywallRow = paywall.rows[0] || {};
  const paywallViews = Number(paywallRow.paywall_views || 0);
  const checkoutClicks = Number(paywallRow.checkout_clicks || 0);

  return {
    last30DaysEventCount: Number(eventCount.rows[0]?.total || 0),
    funnel: FUNNEL_EVENTS.map((eventName) => ({
      eventName,
      events: Number(byName.get(eventName)?.events || 0),
      visitors: Number(byName.get(eventName)?.visitors || 0),
    })),
    paywall: {
      views: paywallViews,
      checkoutClicks,
      clickRate: paywallViews ? Math.round((checkoutClicks / paywallViews) * 100) : 0,
    },
    missedCategories: missedCategories.rows.map((row) => ({
      category: row.category,
      misses: row.misses,
    })),
    missedQuestions: missedQuestions.rows.map((row) => ({
      questionId: row.question_id,
      category: row.category,
      misses: row.misses,
    })),
  };
}

function emptyAnalyticsStats() {
  return {
    last30DaysEventCount: 0,
    funnel: FUNNEL_EVENTS.map((eventName) => ({ eventName, events: 0, visitors: 0 })),
    paywall: { views: 0, checkoutClicks: 0, clickRate: 0 },
    missedCategories: [],
    missedQuestions: [],
  };
}

async function loadQuestionStats() {
  const questions = await readQuestions();
  const byStatus = questions.reduce((acc, question) => {
    const status = question.status || "published";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const byReviewStatus = questions.reduce((acc, question) => {
    const reviewStatus = question.reviewed_status || "needs_official_cross_check";
    acc[reviewStatus] = (acc[reviewStatus] || 0) + 1;
    return acc;
  }, {});

  return {
    total: questions.length,
    withImages: questions.filter((question) => hasImages(question)).length,
    generatedDrafts: questions.filter((question) => question.status === "draft" || question.source_type === "ai_generated" || question.source === "ai").length,
    byStatus,
    byReviewStatus,
  };
}

async function readQuestions() {
  const candidates = [
    path.join(root, "public", "data", "questions.enriched.json"),
    path.join(root, "data", "questions.enriched.json"),
    path.join(root, "public", "data", "questions.json"),
    path.join(root, "data", "questions.json"),
  ];

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    }
  }

  return [];
}

function hasImages(question) {
  return Array.isArray(question.local_image_paths) && question.local_image_paths.length > 0;
}
