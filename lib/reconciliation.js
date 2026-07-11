import { withTransaction } from "./db.js";
import { emitOperationalEvent, recordOperationalEvent } from "./monitoring.js";

export const RECONCILIATION_CHECKS = [
  "paid_stripe_sessions_missing_purchases",
  "purchases_missing_entitlements",
  "expired_entitlements_still_active",
  "refunds_with_active_entitlements",
  "used_instructor_codes_without_redemption_records",
  "webhook_failures",
  "orphaned_sessions",
  "stale_login_tokens",
];

export async function runReliabilityReconciliation(databaseUrl, options = {}) {
  return withTransaction(databaseUrl, async (client) => {
    const run = await createRun(client, options);
    const findings = [];
    for (const checkKey of RECONCILIATION_CHECKS) {
      const rows = await runCheck(client, checkKey);
      for (const row of rows) {
        findings.push(normalizeFinding(checkKey, row));
      }
    }

    if (options.persist !== false) {
      for (const finding of findings) {
        await insertFinding(client, run.id, finding);
      }
      await finishRun(client, run.id, findings);
      if (findings.length) {
        await recordOperationalEvent(client, {
          eventType: "reconciliation_findings_detected",
          severity: findings.some((item) => item.severity === "critical" || item.severity === "error") ? "error" : "warning",
          source: "reconciliation",
          environment: environmentName(),
          message: `${findings.length} reconciliation findings detected.`,
          metadata: summarizeFindings(findings),
        });
      }
    }

    if (findings.length) {
      await emitOperationalEvent("reconciliation_findings_detected", "warning", summarizeFindings(findings), {
        source: "reconciliation",
      });
    }

    return {
      runId: run.id,
      checks: RECONCILIATION_CHECKS,
      findings,
      summary: summarizeFindings(findings),
    };
  });
}

async function createRun(client, options) {
  if (options.persist === false) {
    return { id: null };
  }
  const result = await client.query(
    `
      insert into reconciliation_runs (status, environment, metadata)
      values ('running', $1, $2::jsonb)
      returning id
    `,
    [environmentName(), JSON.stringify({ source: options.source || "manual" })],
  );
  return result.rows[0];
}

async function finishRun(client, runId, findings) {
  await client.query(
    `
      update reconciliation_runs
      set status = 'completed',
          completed_at = now(),
          findings_count = $2,
          high_severity_count = $3
      where id = $1
    `,
    [
      runId,
      findings.length,
      findings.filter((item) => ["critical", "error"].includes(item.severity)).length,
    ],
  );
}

async function insertFinding(client, runId, finding) {
  await client.query(
    `
      insert into reconciliation_findings (
        run_id,
        check_key,
        severity,
        subject_type,
        subject_id,
        message,
        metadata
      )
      values ($1, $2, $3, $4, $5, $6, $7::jsonb)
    `,
    [
      runId,
      finding.checkKey,
      finding.severity,
      finding.subjectType,
      finding.subjectId,
      finding.message,
      JSON.stringify(finding.metadata || {}),
    ],
  );
}

async function runCheck(client, checkKey) {
  const query = CHECK_QUERIES[checkKey];
  if (!query) return [];
  const result = await client.query(query);
  return result.rows;
}

const CHECK_QUERIES = {
  paid_stripe_sessions_missing_purchases: `
    select
      'stripe_checkout_session' as subject_type,
      payload #>> '{data,object,id}' as subject_id,
      'error' as severity,
      'Paid Stripe checkout session has no purchase record.' as message,
      jsonb_build_object(
        'stripe_event_id', stripe_event_id,
        'event_type', type,
        'last_received_at', last_received_at
      ) as metadata
    from stripe_events se
    left join purchases p
      on p.stripe_checkout_session_id = payload #>> '{data,object,id}'
    where type in ('checkout.session.completed', 'checkout.session.async_payment_succeeded')
      and payload #>> '{data,object,payment_status}' = 'paid'
      and p.id is null
    limit 100
  `,
  purchases_missing_entitlements: `
    select
      'purchase' as subject_type,
      p.id::text as subject_id,
      'error' as severity,
      'Learner purchase is missing an active entitlement.' as message,
      jsonb_build_object(
        'email_hash', encode(digest(lower(p.email), 'sha256'), 'hex'),
        'plan_key', p.plan_key,
        'stripe_checkout_session_id', p.stripe_checkout_session_id,
        'created_at', p.created_at
      ) as metadata
    from purchases p
    left join entitlements e
      on lower(e.email) = lower(p.email)
     and e.product = 'irish-theory-test-coach'
     and e.active = true
     and e.revoked_at is null
     and (e.expires_at is null or e.expires_at > now())
    where p.status in ('paid', 'succeeded', 'complete')
      and coalesce(p.plan_key, '') not like 'instructor_%'
      and e.id is null
    limit 100
  `,
  expired_entitlements_still_active: `
    select
      'entitlement' as subject_type,
      id::text as subject_id,
      'warning' as severity,
      'Entitlement is marked active after expiration.' as message,
      jsonb_build_object(
        'email_hash', encode(digest(lower(email), 'sha256'), 'hex'),
        'expires_at', expires_at,
        'source', source
      ) as metadata
    from entitlements
    where active = true
      and revoked_at is null
      and expires_at is not null
      and expires_at <= now()
    limit 100
  `,
  refunds_with_active_entitlements: `
    select
      'refund' as subject_type,
      pr.id::text as subject_id,
      'error' as severity,
      'Refund that should revoke access still has an active entitlement.' as message,
      jsonb_build_object(
        'email_hash', encode(digest(lower(pr.email), 'sha256'), 'hex'),
        'amount', pr.amount,
        'status', pr.status,
        'stripe_refund_id', pr.stripe_refund_id
      ) as metadata
    from payment_refunds pr
    join entitlements e
      on lower(e.email) = lower(pr.email)
     and e.product = 'irish-theory-test-coach'
     and e.active = true
     and e.revoked_at is null
    where pr.entitlement_effect = 'revoke'
      and pr.status in ('succeeded', 'paid', 'recorded')
    limit 100
  `,
  used_instructor_codes_without_redemption_records: `
    select
      'instructor_code' as subject_type,
      ic.code as subject_id,
      'warning' as severity,
      'Instructor code shows usage but has no redemption record.' as message,
      jsonb_build_object(
        'status', ic.status,
        'redemption_count', ic.redemption_count,
        'purchase_id', ic.purchase_id
      ) as metadata
    from instructor_codes ic
    left join instructor_code_redemptions r
      on r.code = ic.code
    where ic.redemption_count > 0
      and r.id is null
    limit 100
  `,
  webhook_failures: `
    select
      'stripe_event' as subject_type,
      stripe_event_id as subject_id,
      'error' as severity,
      'Stripe webhook event failed processing.' as message,
      jsonb_build_object(
        'type', type,
        'failure_reason', failure_reason,
        'last_received_at', last_received_at,
        'replay_count', replay_count
      ) as metadata
    from stripe_events
    where processing_status = 'failed'
    order by last_received_at desc
    limit 100
  `,
  orphaned_sessions: `
    select
      'session' as subject_type,
      s.id::text as subject_id,
      'warning' as severity,
      'Session no longer maps to a user account.' as message,
      jsonb_build_object(
        'email_hash', encode(digest(lower(s.email), 'sha256'), 'hex'),
        'created_at', s.created_at,
        'last_seen_at', s.last_seen_at
      ) as metadata
    from sessions s
    left join users u
      on u.id = s.user_id
      or lower(u.email) = lower(s.email)
    where u.id is null
    limit 100
  `,
  stale_login_tokens: `
    select
      'login_token' as subject_type,
      id::text as subject_id,
      'info' as severity,
      'Expired login token is past cleanup window.' as message,
      jsonb_build_object(
        'email_hash', encode(digest(lower(email), 'sha256'), 'hex'),
        'expires_at', expires_at,
        'delivery_status', delivery_status
      ) as metadata
    from login_tokens
    where consumed_at is null
      and expires_at < now() - interval '30 days'
    limit 100
  `,
};

function normalizeFinding(checkKey, row) {
  return {
    checkKey,
    severity: cleanSeverity(row.severity),
    subjectType: cleanText(row.subject_type || checkKey, 80),
    subjectId: cleanText(row.subject_id || "", 160),
    message: cleanText(row.message || checkKey, 240),
    metadata: row.metadata || {},
  };
}

export function summarizeFindings(findings) {
  const byCheck = {};
  const bySeverity = {};
  for (const finding of findings) {
    byCheck[finding.checkKey] = (byCheck[finding.checkKey] || 0) + 1;
    bySeverity[finding.severity] = (bySeverity[finding.severity] || 0) + 1;
  }
  return {
    total: findings.length,
    byCheck,
    bySeverity,
  };
}

function environmentName() {
  return cleanText(process.env.PAYMENT_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV || "local", 40);
}

function cleanSeverity(value) {
  const text = cleanText(value, 20);
  return ["info", "warning", "error", "critical"].includes(text) ? text : "warning";
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
