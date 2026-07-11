import fs from "node:fs";
import path from "node:path";
import { withDb, withTransaction } from "./db.js";
import { safeErrorSummary } from "./server-env.js";
import { DEFAULT_ENTITLEMENT_DAYS, PRODUCT_KEY, getPricingPlan } from "../shared/pricing-config.js";

const PRODUCT = PRODUCT_KEY;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_TARGET = 25;

export function maskEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  const [local, domain] = normalized.split("@");
  if (!local || !domain) return "";
  const visibleLocal = local.length <= 2 ? `${local[0] || ""}*` : `${local.slice(0, 2)}***${local.slice(-1)}`;
  const [domainName, ...suffix] = domain.split(".");
  const visibleDomain = domainName.length <= 2 ? `${domainName[0] || ""}*` : `${domainName.slice(0, 2)}***`;
  return `${visibleLocal}@${visibleDomain}${suffix.length ? `.${suffix.join(".")}` : ""}`;
}

export function remainingAccessDays(expiresAt, now = new Date()) {
  if (!expiresAt) return null;
  const expires = new Date(expiresAt);
  if (Number.isNaN(expires.getTime())) return null;
  return Math.max(0, Math.ceil((expires.getTime() - now.getTime()) / DAY_MS));
}

export function classifyAccess(entitlement, now = new Date()) {
  if (!entitlement) {
    return {
      status: "none",
      active: false,
      label: "No paid access",
      expiresAt: null,
      remainingDays: 0,
    };
  }

  if (entitlement.revoked_at) {
    return {
      status: "revoked",
      active: false,
      label: "Access revoked",
      expiresAt: entitlement.expires_at || null,
      remainingDays: 0,
    };
  }

  const days = remainingAccessDays(entitlement.expires_at, now);
  const expired = entitlement.expires_at && days === 0 && new Date(entitlement.expires_at).getTime() <= now.getTime();
  const active = Boolean(entitlement.active) && !expired;
  return {
    status: active ? "active" : "expired",
    active,
    label: active ? "Active" : "Expired",
    expiresAt: entitlement.expires_at || null,
    remainingDays: active ? days : 0,
  };
}

export async function buildAccountSnapshot(databaseUrl, sessionUser) {
  return withDb(databaseUrl, async (client) => {
    const user = await fetchUser(client, sessionUser);
    const entitlement = await fetchEntitlement(client, sessionUser.email);
    const purchases = await fetchPurchases(client, sessionUser.email);
    const progress = await buildServerProgressSummary(client, sessionUser);
    const recentMockResults = await fetchRecentMockResults(client, sessionUser);
    const restoreStatus = await fetchRestoreStatus(client, sessionUser.email);
    const sessionSummary = await fetchSessionSummary(client, sessionUser);
    const deletionRequest = await fetchDeletionRequest(client, sessionUser);
    const product = loadProductSummary();
    const latestPurchase = purchases[0] || null;
    const planKey = latestPurchase?.plan_key || product.activePlanKey || "full_study_pass";
    const plan = getPricingPlan(planKey);
    const access = classifyAccess(entitlement);

    return {
      authenticated: true,
      email: sessionUser.email,
      maskedEmail: maskEmail(sessionUser.email),
      role: sessionUser.role || user?.role || "user",
      account: {
        createdAt: user?.created_at || null,
        lastLoginAt: user?.last_login_at || null,
        lastActiveAt: user?.last_active_at || null,
        deleteRequestedAt: user?.delete_requested_at || deletionRequest?.created_at || null,
      },
      access: {
        ...access,
        product: PRODUCT,
        source: entitlement?.source || null,
      },
      plan: {
        key: planKey,
        name: plan?.label || latestPurchase?.plan_key || product.activePlanLabel || "Full Study Pass",
        accessDurationDays: plan?.entitlementDays || product.accessDurationDays || DEFAULT_ENTITLEMENT_DAYS,
      },
      purchase: latestPurchase
        ? {
            purchasedAt: latestPurchase.created_at,
            amount: latestPurchase.amount,
            currency: latestPurchase.currency,
            status: latestPurchase.status,
            planKey: latestPurchase.plan_key || "",
            checkoutSessionId: latestPurchase.stripe_checkout_session_id || "",
            paymentIntentId: latestPurchase.stripe_payment_intent_id || "",
            referralCode: latestPurchase.referral_code || "",
          }
        : null,
      product: {
        productVersion: product.productVersion || "local-dev",
        contentVersion: product.contentVersion || "unknown",
        schemaVersion: product.schemaVersion || "unknown",
      },
      progress,
      recentMockResults,
      restoreStatus,
      sessions: sessionSummary,
      support: {
        email: process.env.SUPPORT_EMAIL || "support@irish-theory-test-coach.com",
      },
    };
  });
}

export async function buildAccountExport(databaseUrl, sessionUser) {
  return withDb(databaseUrl, async (client) => {
    const user = await fetchUser(client, sessionUser);
    const entitlement = await fetchEntitlement(client, sessionUser.email);
    const purchases = await fetchPurchases(client, sessionUser.email, 100);
    const progress = await buildServerProgressSummary(client, sessionUser);
    const attempts = await client.query(
      `
        select question_id,
               canonical_question_id,
               selected_index,
               correct,
               mode,
               category,
               client_event_id,
               created_at
        from attempts
        where user_id = $1 or lower(email) = lower($2)
        order by created_at asc
      `,
      [sessionUser.userId, sessionUser.email]
    );
    const flags = await client.query(
      `
        select question_id, category, created_at, updated_at
        from flags
        where user_id = $1 or lower(email) = lower($2)
        order by updated_at asc
      `,
      [sessionUser.userId, sessionUser.email]
    );
    const mocks = await client.query(
      `
        select session_public_id,
               mode,
               score,
               total,
               answered,
               passed,
               duration_seconds,
               product_version,
               content_version,
               started_at,
               completed_at
        from mock_sessions
        where user_id = $1 or lower(email) = lower($2)
        order by completed_at asc
      `,
      [sessionUser.userId, sessionUser.email]
    );
    const sessions = await client.query(
      `
        select created_at, last_seen_at, expires_at, revoked_at, revoked_reason
        from sessions
        where user_id = $1 or lower(email) = lower($2)
        order by created_at asc
      `,
      [sessionUser.userId, sessionUser.email]
    );

    return {
      exportedAt: new Date().toISOString(),
      product: loadProductSummary(),
      account: {
        email: sessionUser.email,
        maskedEmail: maskEmail(sessionUser.email),
        role: sessionUser.role || user?.role || "user",
        createdAt: user?.created_at || null,
        lastLoginAt: user?.last_login_at || null,
        lastActiveAt: user?.last_active_at || null,
        deleteRequestedAt: user?.delete_requested_at || null,
      },
      access: classifyAccess(entitlement),
      purchases: purchases.map((purchase) => ({
        purchasedAt: purchase.created_at,
        amount: purchase.amount,
        currency: purchase.currency,
        status: purchase.status,
        planKey: purchase.plan_key || "",
        checkoutSessionId: purchase.stripe_checkout_session_id || "",
        paymentIntentId: purchase.stripe_payment_intent_id || "",
        referralCode: purchase.referral_code || "",
      })),
      progress,
      attempts: attempts.rows,
      flags: flags.rows,
      mockSessions: mocks.rows,
      sessions: sessions.rows,
    };
  });
}

export async function requestAccountDeletion(databaseUrl, sessionUser, reason = "") {
  return withTransaction(databaseUrl, async (client) => {
    await client.query(
      `
        update users
        set delete_requested_at = coalesce(delete_requested_at, now()),
            updated_at = now()
        where id = $1
      `,
      [sessionUser.userId]
    );
    const result = await client.query(
      `
        insert into account_deletion_requests (user_id, email, reason)
        values ($1, $2, $3)
        returning id, status, created_at
      `,
      [sessionUser.userId, sessionUser.email, cleanText(reason, 500)]
    );
    await recordAuthAudit(client, {
      userId: sessionUser.userId,
      email: sessionUser.email,
      eventType: "account_deletion_requested",
      severity: "warning",
    });
    return result.rows[0];
  });
}

export async function recordMockSession(databaseUrl, sessionUser, result) {
  if (!databaseUrl) return false;
  if (!sessionUser?.userId || !result?.sessionPublicId) return false;

  try {
    await withDb(databaseUrl, async (client) => {
      await client.query(
        `
          insert into mock_sessions (
            user_id,
            email,
            session_public_id,
            mode,
            score,
            total,
            answered,
            passed,
            duration_seconds,
            product_version,
            content_version,
            started_at,
            completed_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
          on conflict (user_id, session_public_id)
          where user_id is not null
          do update
          set score = excluded.score,
              total = excluded.total,
              answered = excluded.answered,
              passed = excluded.passed,
              duration_seconds = excluded.duration_seconds,
              product_version = excluded.product_version,
              content_version = excluded.content_version,
              completed_at = now()
        `,
        [
          sessionUser.userId,
          sessionUser.email,
          result.sessionPublicId,
          result.mode || "exam",
          Number(result.score || 0),
          Number(result.total || 0),
          Number(result.answered || 0),
          result.passed === null || result.passed === undefined ? null : Boolean(result.passed),
          Number(result.durationSeconds || 0),
          result.productVersion || "",
          result.contentVersion || "",
          result.startedAt || null,
        ]
      );
    });
    return true;
  } catch (error) {
    console.error("Could not record mock session", safeErrorSummary(error));
    return false;
  }
}

export async function recordAuthAudit(client, event) {
  await client.query(
    `
      insert into auth_audit_log (
        user_id,
        email,
        event_type,
        severity,
        ip_address,
        user_agent,
        origin,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
    `,
    [
      event.userId || null,
      event.email || null,
      event.eventType,
      event.severity || "info",
      event.ipAddress || null,
      event.userAgent || null,
      event.origin || null,
      JSON.stringify(event.metadata || {}),
    ]
  );
}

export function mergeProgressSnapshots({ server, local, pendingAttempts = [], pendingFlags = [] }) {
  const mergedAnswers = { ...(server?.answers || {}) };
  for (const [questionId, localAnswer] of Object.entries(local?.answers || {})) {
    const serverAnswer = mergedAnswers[questionId];
    if (!serverAnswer || Number(localAnswer.attempts || 0) > Number(serverAnswer.attempts || 0)) {
      mergedAnswers[questionId] = localAnswer;
    }
  }

  const missed = new Set(server?.missed || []);
  for (const attempt of pendingAttempts) {
    if (attempt.correct) missed.delete(attempt.questionId);
    else missed.add(attempt.questionId);
  }

  const flagged = new Set(server?.flagged || []);
  for (const questionId of local?.flagged || []) flagged.add(questionId);
  for (const flag of pendingFlags) {
    if (flag.active) flagged.add(flag.questionId);
    else flagged.delete(flag.questionId);
  }

  return {
    answers: mergedAnswers,
    missed: Array.from(missed),
    flagged: Array.from(flagged),
    categories: Array.isArray(server?.categories) ? server.categories : [],
  };
}

export function collapseOperationsById(items) {
  const byKey = new Map();
  for (const item of items || []) {
    const key = item.operationId || item.clientEventId || `${item.questionId}:${item.updatedAt || ""}`;
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing || new Date(item.updatedAt || item.answeredAt || 0) >= new Date(existing.updatedAt || existing.answeredAt || 0)) {
      byKey.set(key, item);
    }
  }
  return Array.from(byKey.values());
}

async function fetchUser(client, sessionUser) {
  const result = await client.query(
    `
      select id,
             email,
             role,
             display_name,
             last_login_at,
             last_active_at,
             delete_requested_at,
             created_at
      from users
      where id = $1 or lower(email) = lower($2)
      limit 1
    `,
    [sessionUser.userId, sessionUser.email]
  );
  return result.rows[0] || null;
}

async function fetchEntitlement(client, email) {
  const result = await client.query(
    `
      select email,
             product,
             active,
             source,
             expires_at,
             revoked_at,
             created_at,
             updated_at
      from entitlements
      where lower(email) = lower($1)
        and product = $2
      order by updated_at desc
      limit 1
    `,
    [email, PRODUCT]
  );
  return result.rows[0] || null;
}

async function fetchPurchases(client, email, limit = 5) {
  const result = await client.query(
    `
      select stripe_checkout_session_id,
             stripe_payment_intent_id,
             amount,
             currency,
             status,
             plan_key,
             stripe_price_id,
             referral_code,
             created_at
      from purchases
      where lower(email) = lower($1)
      order by created_at desc
      limit $2
    `,
    [email, limit]
  );
  return result.rows;
}

async function fetchRestoreStatus(client, email) {
  const result = await client.query(
    `
      select created_at,
             expires_at,
             consumed_at,
             sent_at,
             delivery_status
      from login_tokens
      where lower(email) = lower($1)
      order by created_at desc
      limit 1
    `,
    [email]
  );
  const token = result.rows[0];
  if (!token) {
    return { status: "none", label: "No restore link requested yet" };
  }
  if (token.consumed_at) {
    return { status: "used", label: "Last restore link was used", createdAt: token.created_at, consumedAt: token.consumed_at };
  }
  if (new Date(token.expires_at).getTime() <= Date.now()) {
    return { status: "expired", label: "Last restore link expired", createdAt: token.created_at, expiresAt: token.expires_at };
  }
  return {
    status: token.delivery_status || "pending",
    label: token.sent_at ? "Restore link sent" : "Restore link prepared",
    createdAt: token.created_at,
    expiresAt: token.expires_at,
  };
}

async function fetchSessionSummary(client, sessionUser) {
  const result = await client.query(
    `
      select count(*) filter (where revoked_at is null and expires_at > now())::int as active_count,
             max(last_seen_at) as last_seen_at
      from sessions
      where user_id = $1 or lower(email) = lower($2)
    `,
    [sessionUser.userId, sessionUser.email]
  );
  const row = result.rows[0] || {};
  return {
    activeCount: Number(row.active_count || 0),
    lastSeenAt: row.last_seen_at || null,
  };
}

async function fetchDeletionRequest(client, sessionUser) {
  const result = await client.query(
    `
      select status, created_at
      from account_deletion_requests
      where user_id = $1 or lower(email) = lower($2)
      order by created_at desc
      limit 1
    `,
    [sessionUser.userId, sessionUser.email]
  );
  return result.rows[0] || null;
}

async function buildServerProgressSummary(client, sessionUser) {
  const params = [sessionUser.userId, sessionUser.email];
  const [totals, latestRows, flags, categories, modes, days] = await Promise.all([
    client.query(
      `
        select count(*)::int as answered,
               count(*) filter (where correct)::int as correct,
               max(created_at) as last_answered_at
        from attempts
        where user_id = $1 or lower(email) = lower($2)
      `,
      params
    ),
    client.query(
      `
        select question_id, correct, selected_index, mode, category, created_at
        from (
          select distinct on (question_id)
                 question_id,
                 correct,
                 selected_index,
                 mode,
                 coalesce(nullif(category, ''), 'Uncategorised') as category,
                 created_at
          from attempts
          where user_id = $1 or lower(email) = lower($2)
          order by question_id, created_at desc, id desc
        ) latest
        order by created_at desc
        limit 25
      `,
      params
    ),
    client.query(
      `
        select count(*)::int as flagged_count
        from flags
        where user_id = $1 or lower(email) = lower($2)
      `,
      params
    ),
    client.query(categorySummarySql(), params),
    client.query(
      `
        select mode,
               count(*)::int as answered,
               max(created_at) as last_used_at
        from attempts
        where user_id = $1 or lower(email) = lower($2)
        group by mode
        order by answered desc, mode asc
      `,
      params
    ),
    client.query(
      `
        select (created_at at time zone 'Europe/Dublin')::date as day,
               count(*)::int as answered
        from attempts
        where (user_id = $1 or lower(email) = lower($2))
          and created_at >= now() - interval '90 days'
        group by 1
        order by 1 desc
      `,
      params
    ),
  ]);

  const total = totals.rows[0] || {};
  const answered = Number(total.answered || 0);
  const correct = Number(total.correct || 0);
  const latest = latestRows.rows;
  const missedLatest = latest.filter((row) => row.correct === false);
  const dailyRows = days.rows.map((row) => ({
    day: isoDay(row.day),
    answered: Number(row.answered || 0),
  }));
  const today = isoDay(new Date());
  const todayCount = dailyRows.find((row) => row.day === today)?.answered || 0;

  return {
    answered,
    correct,
    accuracy: answered ? Math.round((correct / answered) * 100) : 0,
    latestAnswer: latest[0] || null,
    totalAnswerHistory: answered,
    missedCount: missedLatest.length,
    flaggedCount: Number(flags.rows[0]?.flagged_count || 0),
    categoryAccuracy: categories.rows.map(toCategorySummary),
    modeHistory: modes.rows.map((row) => ({
      mode: row.mode || "revise",
      answered: Number(row.answered || 0),
      lastUsedAt: row.last_used_at || null,
    })),
    studyStreak: calculateStudyStreak(dailyRows),
    dailyTarget: {
      target: DAILY_TARGET,
      today: todayCount,
      remaining: Math.max(0, DAILY_TARGET - todayCount),
      lastActiveDate: dailyRows[0]?.day || null,
    },
    missedQuestions: missedLatest.map((row) => row.question_id),
  };
}

function categorySummarySql() {
  return `
    with attempt_summary as (
      select coalesce(nullif(category, ''), 'Uncategorised') as category,
             count(*)::int as answered,
             count(*) filter (where correct)::int as correct_count
      from attempts
      where user_id = $1 or lower(email) = lower($2)
      group by 1
    ),
    latest_attempts as (
      select distinct on (question_id)
             question_id,
             coalesce(nullif(category, ''), 'Uncategorised') as category,
             correct
      from attempts
      where user_id = $1 or lower(email) = lower($2)
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
      where user_id = $1 or lower(email) = lower($2)
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
  `;
}

function toCategorySummary(row) {
  const answered = Number(row.answered || 0);
  const accuracy = answered ? Math.round((Number(row.correct_count || 0) / answered) * 100) : 0;
  return {
    category: row.category || "Uncategorised",
    answered,
    accuracy,
    missedCount: Number(row.missed_count || 0),
    flaggedCount: Number(row.flagged_count || 0),
    recommendedNextMode: recommendNextMode({
      answered,
      accuracy,
      missedCount: Number(row.missed_count || 0),
      flaggedCount: Number(row.flagged_count || 0),
    }),
  };
}

async function fetchRecentMockResults(client, sessionUser) {
  const result = await client.query(
    `
      select session_public_id,
             score,
             total,
             answered,
             passed,
             duration_seconds,
             completed_at
      from mock_sessions
      where user_id = $1 or lower(email) = lower($2)
      order by completed_at desc
      limit 5
    `,
    [sessionUser.userId, sessionUser.email]
  );
  return result.rows.map((row) => ({
    sessionPublicId: row.session_public_id,
    score: Number(row.score || 0),
    total: Number(row.total || 0),
    answered: Number(row.answered || 0),
    passed: row.passed,
    durationSeconds: Number(row.duration_seconds || 0),
    completedAt: row.completed_at,
  }));
}

function recommendNextMode(summary) {
  if (summary.missedCount || summary.flaggedCount) return "review";
  if (summary.answered >= 5 && summary.accuracy < 75) return "highYield";
  if (summary.answered >= 20 && summary.accuracy >= 85) return "exam";
  return "revise";
}

function calculateStudyStreak(rows) {
  if (!rows.length) {
    return { current: 0, lastActiveDate: null };
  }

  const days = new Set(rows.map((row) => row.day));
  let cursor = new Date(rows[0].day);
  let streak = 0;
  while (days.has(isoDay(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }
  return { current: streak, lastActiveDate: rows[0].day };
}

function loadProductSummary() {
  const filePath = path.join(process.cwd(), "public", "product-summary.json");
  try {
    const summary = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return {
      productVersion: summary.productVersion,
      contentVersion: summary.contentVersion,
      schemaVersion: summary.schemaVersion,
      accessDurationDays: summary.accessDurationDays,
      activePlanKey: summary.activePlanKey,
      activePlanLabel: summary.activePlanLabel,
      activePrice: summary.activePrice,
    };
  } catch {
    return {
      productVersion: "local-dev",
      contentVersion: "unknown",
      schemaVersion: "unknown",
      accessDurationDays: DEFAULT_ENTITLEMENT_DAYS,
      activePlanKey: "full_study_pass",
      activePlanLabel: "Full Study Pass",
      activePrice: "EUR 4.99",
    };
  }
}

function isoDay(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
