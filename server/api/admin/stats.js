import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireAdmin, sendAdminError, testAuthzOk } from "../../../lib/admin.js";
import { withDb } from "../../../lib/db.js";
import {
  getAuthServerEnv,
  sendSafeConfigError,
} from "../../../lib/server-env.js";
import { FUNNEL_EVENTS } from "../../../shared/growth-config.js";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..", "..", "..");
const FUNNEL_EVENT_NAMES = FUNNEL_EVENTS.map((event) => event.eventName);

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
    const admin = await requireAdmin(req, env.databaseUrl, { permission: "view_overview" });
    if (testAuthzOk(req, res, admin, "view_overview")) return;
    const range = parseDateRange(req.query || {});
    const [dbStats, questionStats] = await Promise.all([
      loadDbStats(env.databaseUrl, range),
      loadQuestionStats(),
    ]);
    return res.status(200).json({ ok: true, stats: { ...dbStats, questions: questionStats } });
  } catch (error) {
    return sendAdminError(res, error, "Admin stats failed");
  }
}

async function loadDbStats(databaseUrl, range) {
  return withDb(databaseUrl, async (client) => {
    const [
      totals,
      attemptSummary,
      recentPurchases,
      recentAudit,
      revenue,
      planSales,
      referralPerformance,
      operationalWarnings,
    ] = await Promise.all([
      client.query(`
        select
          (select count(*)::int from users) as users,
          (select count(*)::int from users where role in ('owner', 'admin')) as admins,
          (select count(*)::int from users where role = 'content_editor') as content_editors,
          (select count(*)::int from users where role = 'support') as support_users,
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
          (
            select count(*)::int
            from entitlements
            where expires_at is not null
              and expires_at <= now()
              and revoked_at is null
          ) as expired_entitlements,
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
        where created_at >= $1::timestamptz
          and created_at < $2::timestamptz
        order by created_at desc
        limit 8
      `, [range.start, range.end]),
      client.query(`
        select admin_email, action, target_type, target_email, target_id,
               reason, request_correlation_id, metadata, created_at
        from admin_audit_log
        order by created_at desc
        limit 10
      `),
      client.query(`
        with paid_purchases as (
          select *
          from purchases
          where status in ('paid', 'complete', 'succeeded', 'partially_refunded', 'refunded')
            and created_at >= $1::timestamptz
            and created_at < $2::timestamptz
        ),
        purchase_summary as (
          select coalesce(sum(amount), 0)::int as gross_revenue,
                 count(*)::int as purchase_count,
                 coalesce(sum(amount) filter (where referral_code is not null), 0)::int as referral_revenue,
                 coalesce(sum(amount) filter (where plan_key like 'instructor_%'), 0)::int as instructor_revenue
          from paid_purchases
        ),
        refund_summary as (
          select count(*) filter (where status in ('succeeded', 'paid', 'recorded'))::int as refund_count,
                 coalesce(sum(amount) filter (where status in ('succeeded', 'paid', 'recorded')), 0)::int as refund_amount
          from payment_refunds
          where created_at >= $1::timestamptz
            and created_at < $2::timestamptz
        )
        select ps.gross_revenue,
               round((ps.gross_revenue * 0.015) + (ps.purchase_count * 25))::int as estimated_stripe_fees,
               rs.refund_count,
               rs.refund_amount,
               ps.referral_revenue,
               ps.instructor_revenue
        from purchase_summary ps
        cross join refund_summary rs
      `, [range.start, range.end]),
      client.query(`
        select coalesce(nullif(plan_key, ''), 'unknown') as plan_key,
               count(*)::int as sales,
               coalesce(sum(amount) filter (where status in ('paid', 'complete', 'succeeded', 'partially_refunded', 'refunded')), 0)::int as revenue
        from purchases
        where created_at >= $1::timestamptz
          and created_at < $2::timestamptz
        group by 1
        order by revenue desc, sales desc
      `, [range.start, range.end]),
      client.query(`
        select rc.code,
               rc.description,
               rc.fixed_price_plan,
               count(rr.id)::int as redemptions,
               count(rr.id) filter (where rr.status = 'checkout_started')::int as checkout_starts,
               count(rr.id) filter (where rr.status = 'purchased')::int as purchases,
               coalesce(sum(p.amount) filter (where p.status in ('paid', 'complete', 'succeeded', 'partially_refunded', 'refunded')), 0)::int as revenue
        from referral_codes rc
        left join referral_redemptions rr on rr.code = rc.code
        left join purchases p on p.stripe_checkout_session_id = rr.stripe_checkout_session_id
          and p.created_at >= $1::timestamptz
          and p.created_at < $2::timestamptz
        group by rc.code
        order by revenue desc, redemptions desc
        limit 20
      `, [range.start, range.end]),
      client.query(`
        select *
        from (
          select 'failed_webhook' as warning_type,
                 stripe_event_id as target_id,
                 type as title,
                 failure_reason as detail,
                 last_received_at as created_at
          from stripe_events
          where processing_status = 'failed'
          union all
          select 'failed_checkout' as warning_type,
                 coalesce(stripe_checkout_session_id, id::text) as target_id,
                 resolved_plan_key as title,
                 failure_reason as detail,
                 updated_at as created_at
          from checkout_attempts
          where status in ('stripe_request_failed', 'stripe_rejected', 'async_payment_failed', 'payment_failed')
          union all
          select 'open_support_case' as warning_type,
                 id::text as target_id,
                 category as title,
                 priority as detail,
                 updated_at as created_at
          from support_cases
          where status in ('open', 'waiting')
            and priority in ('high', 'urgent')
          union all
          select 'payment_dispute' as warning_type,
                 stripe_dispute_id as target_id,
                 status as title,
                 reason as detail,
                 updated_at as created_at
          from payment_disputes
          where status not in ('won', 'warning_closed')
        ) warnings
        order by created_at desc
        limit 20
      `),
    ]);
    const analytics = await loadAnalyticsStats(client, range);
    const revenueRow = revenue.rows[0] || {};
    const grossRevenue = Number(revenueRow.gross_revenue || 0);
    const estimatedStripeFees = Number(revenueRow.estimated_stripe_fees || 0);
    const refundAmount = Number(revenueRow.refund_amount || 0);

    return {
      totals: totals.rows[0],
      range,
      revenue: {
        grossRevenue,
        estimatedStripeFees,
        estimatedNetRevenue: Math.max(0, grossRevenue - estimatedStripeFees - refundAmount),
        refundCount: Number(revenueRow.refund_count || 0),
        refundAmount,
        referralRevenue: Number(revenueRow.referral_revenue || 0),
        instructorRevenue: Number(revenueRow.instructor_revenue || 0),
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
      operationalWarnings: operationalWarnings.rows,
      analytics,
    };
  });
}

async function loadAnalyticsStats(client, range) {
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
        where created_at >= $2::timestamptz
          and created_at < $3::timestamptz
          and event_name = any($1)
        group by event_name
      `,
      [FUNNEL_EVENT_NAMES, range.start, range.end]
    ),
    client.query(`
      select coalesce(nullif(properties->>'category', ''), 'Uncategorised') as category,
             count(*)::int as misses
      from events
      where event_name = 'answer_wrong'
        and created_at >= $1::timestamptz
        and created_at < $2::timestamptz
      group by 1
      order by misses desc, category asc
      limit 10
    `, [range.start, range.end]),
    client.query(`
      select (properties->>'questionId')::int as question_id,
             coalesce(nullif(properties->>'category', ''), 'Uncategorised') as category,
             count(*)::int as misses
      from events
      where event_name = 'answer_wrong'
        and created_at >= $1::timestamptz
        and created_at < $2::timestamptz
        and properties->>'questionId' ~ '^[0-9]+$'
      group by 1, 2
      order by misses desc, question_id asc
      limit 10
    `, [range.start, range.end]),
    client.query(`
      select count(*) filter (where event_name = 'paywall_viewed')::int as paywall_views,
             count(*) filter (where event_name = 'checkout_started')::int as checkout_starts
      from events
      where created_at >= $1::timestamptz
        and created_at < $2::timestamptz
        and event_name in ('paywall_viewed', 'checkout_started')
    `, [range.start, range.end]),
    client.query(`
      select count(*)::int as total
      from events
      where created_at >= $1::timestamptz
        and created_at < $2::timestamptz
    `, [range.start, range.end]),
  ]);

  const [modeUsage, deviceClass, conversionSource, mockCompletion, reportFrequency] = await Promise.all([
    client.query(`
      select coalesce(nullif(properties->>'mode', ''), 'unknown') as mode,
             count(*)::int as events
      from events
      where created_at >= $1::timestamptz
        and created_at < $2::timestamptz
        and event_name in ('mode_selected', 'question_answered', 'mock_started')
      group by 1
      order by events desc
      limit 12
    `, [range.start, range.end]),
    client.query(`
      select coalesce(nullif(bot_signals->>'deviceClass', ''), 'unknown') as device_class,
             count(*)::int as events
      from events
      where created_at >= $1::timestamptz
        and created_at < $2::timestamptz
      group by 1
      order by events desc
      limit 8
    `, [range.start, range.end]),
    client.query(`
      select coalesce(
               nullif(attribution->'lastTouch'->>'utmSource', ''),
               nullif(properties->>'source', ''),
               'direct'
             ) as source,
             coalesce(nullif(attribution->'lastTouch'->>'utmCampaign', ''), '') as campaign,
             coalesce(nullif(attribution->'lastTouch'->>'referralCode', ''), '') as referral_code,
             coalesce(nullif(attribution->'lastTouch'->>'instructorCode', ''), '') as instructor_code,
             count(*)::int as events,
             count(distinct anonymous_id)::int as visitors
      from events
      where created_at >= $1::timestamptz
        and created_at < $2::timestamptz
        and event_name in ('checkout_started', 'checkout_completed', 'referral_checkout_started')
      group by 1, 2, 3, 4
      order by events desc
      limit 12
    `, [range.start, range.end]),
    client.query(`
      select count(*) filter (where event_name in ('first_mock_started', 'mock_started'))::int as starts,
             count(*) filter (where event_name in ('first_mock_completed', 'mock_completed'))::int as completions
      from events
      where created_at >= $1::timestamptz
        and created_at < $2::timestamptz
        and event_name in ('first_mock_started', 'first_mock_completed', 'mock_started', 'mock_completed')
    `, [range.start, range.end]),
    client.query(`
      select question_id,
             count(*)::int as reports
      from question_problem_reports
      where created_at >= $1::timestamptz
        and created_at < $2::timestamptz
      group by question_id
      order by reports desc
      limit 10
    `, [range.start, range.end]),
  ]);

  const byName = new Map(funnel.rows.map((row) => [row.event_name, row]));
  const paywallRow = paywall.rows[0] || {};
  const paywallViews = Number(paywallRow.paywall_views || 0);
  const checkoutStarts = Number(paywallRow.checkout_starts || 0);

  return {
    last30DaysEventCount: Number(eventCount.rows[0]?.total || 0),
    funnel: FUNNEL_EVENT_NAMES.map((eventName) => ({
      eventName,
      events: Number(byName.get(eventName)?.events || 0),
      visitors: Number(byName.get(eventName)?.visitors || 0),
    })),
    conversions: buildConversionRows(byName),
    paywall: {
      views: paywallViews,
      checkoutStarts,
      checkoutClicks: checkoutStarts,
      clickRate: paywallViews ? Math.round((checkoutStarts / paywallViews) * 100) : 0,
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
    modeUsage: modeUsage.rows,
    deviceClass: deviceClass.rows,
    conversionSource: conversionSource.rows,
    mockCompletion: {
      starts: Number(mockCompletion.rows[0]?.starts || 0),
      completions: Number(mockCompletion.rows[0]?.completions || 0),
    },
    reportFrequency: reportFrequency.rows,
  };
}

function emptyAnalyticsStats() {
  return {
    last30DaysEventCount: 0,
    funnel: FUNNEL_EVENT_NAMES.map((eventName) => ({ eventName, events: 0, visitors: 0 })),
    conversions: [],
    paywall: { views: 0, checkoutClicks: 0, clickRate: 0 },
    missedCategories: [],
    missedQuestions: [],
    modeUsage: [],
    deviceClass: [],
    conversionSource: [],
    mockCompletion: { starts: 0, completions: 0 },
    reportFrequency: [],
  };
}

function buildConversionRows(byName) {
  const count = (eventName) => Number(byName.get(eventName)?.visitors || byName.get(eventName)?.events || 0);
  const rows = [
    ["landing_to_preview", "Landing to preview", "landing_view", "start_free_practice"],
    ["preview_to_paywall", "Preview to paywall", "preview_started", "paywall_viewed"],
    ["paywall_to_checkout", "Paywall to checkout", "paywall_viewed", "checkout_started"],
    ["checkout_to_purchase", "Checkout to purchase", "checkout_started", "checkout_completed"],
    ["purchase_to_first_paid_session", "Purchase to first paid session", "checkout_completed", "first_paid_session"],
    ["mock_completion", "Mock completion", "first_mock_started", "first_mock_completed"],
    ["restore_success", "Restore success", "restore_access_started", "access_restored"],
  ];

  return rows.map(([key, label, fromEvent, toEvent]) => {
    const from = count(fromEvent);
    const to = count(toEvent);
    return {
      key,
      label,
      fromEvent,
      toEvent,
      from,
      to,
      rate: from ? Math.round((to / from) * 100) : 0,
      sampleWarning: from > 0 && from < 30,
    };
  });
}

function parseDateRange(query) {
  const endDate = parseDate(query.to) || new Date();
  const startDate = parseDate(query.from) || new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (startDate >= endDate) {
    return {
      start: new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      end: endDate.toISOString(),
    };
  }
  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  };
}

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
