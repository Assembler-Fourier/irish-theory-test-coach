import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDbPool } from "../lib/db.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "reports", "final", "payment-test-evidence.json");
const previewOrigin = String(
  process.env.PAYMENT_EVIDENCE_PREVIEW_ORIGIN ||
  "https://irish-theory-test-coach-assembler-fourier-job-work.vercel.app",
).replace(/\/$/, "");
const deploymentId = String(process.env.PAYMENT_EVIDENCE_DEPLOYMENT_ID || "");

if (!process.env.DATABASE_URL || !/^dpl_[A-Za-z0-9]+$/.test(deploymentId)) {
  console.error("Payment evidence generation requires Preview database and deployment configuration.");
  process.exit(1);
}

const pool = createDbPool(process.env.DATABASE_URL);
const generatedAt = new Date().toISOString();

try {
  const tests = {};
  const full = await checkoutCase("audit_full_20260712", "full_study_pass", 499);
  tests.fullStudyPassCheckout = record([
    check("checkout attempt fulfilled", "fulfilled", full.attempt_status),
    check("learner amount in cents", 499, Number(full.amount || 0)),
    check("purchase recorded", true, Boolean(full.purchase_status)),
    check("currency", "eur", full.currency),
  ], suffixes("checkout", full.checkout_suffix, "payment_intent", full.pi_suffix));

  const launch = await checkoutCase("audit_launch_20260712", "launch_offer", 299);
  tests.launchOfferCheckout = record([
    check("launch checkout fulfilled", "fulfilled", launch.attempt_status),
    check("launch amount in cents", 299, Number(launch.amount || 0)),
    check("launch purchase recorded", true, Boolean(launch.purchase_status)),
  ], suffixes("checkout", launch.checkout_suffix, "payment_intent", launch.pi_suffix));

  const instructor10 = await checkoutCase("audit_instructor10_20260712", "instructor_10", 2900);
  tests.instructor10Checkout = record([
    check("10-code checkout fulfilled", "fulfilled", instructor10.attempt_status),
    check("10-code amount in cents", 2900, Number(instructor10.amount || 0)),
    check("10-code purchase recorded", true, Boolean(instructor10.purchase_status)),
  ], suffixes("checkout", instructor10.checkout_suffix, "payment_intent", instructor10.pi_suffix));

  const instructor25 = await checkoutCase("audit_instructor25_20260712", "instructor_25", 6900);
  tests.instructor25Checkout = record([
    check("25-code checkout fulfilled", "fulfilled", instructor25.attempt_status),
    check("25-code amount in cents", 6900, Number(instructor25.amount || 0)),
    check("25-code purchase recorded", true, Boolean(instructor25.purchase_status)),
  ], suffixes("checkout", instructor25.checkout_suffix, "payment_intent", instructor25.pi_suffix));

  const entitlement = await one(`
    select e.active, e.source, e.expires_at > now() as unexpired
    from checkout_attempts ca
    join purchases p on p.checkout_attempt_id = ca.id
    join entitlements e on lower(e.email) = lower(p.email)
      and e.product = 'irish-theory-test-coach'
    where ca.anonymous_id = 'audit_full_20260712'
  `);
  tests.webhookEntitlement = record([
    check("entitlement active", true, Boolean(entitlement.active)),
    check("entitlement unexpired", true, Boolean(entitlement.unexpired)),
    check("entitlement source", "stripe", entitlement.source),
  ], suffixes("checkout", full.checkout_suffix));

  const duplicate = await one(`
    select count(*)::int as purchase_count,
      (select count(*)::int from instructor_codes ic where ic.purchase_id = p.id) as code_count,
      coalesce((select bool_or(se.last_received_at > se.first_received_at) from stripe_events se
        where se.type = 'checkout.session.completed'
          and se.payload #>> '{data,object,id}' = p.stripe_checkout_session_id), false) as received_again
    from checkout_attempts ca
    join purchases p on p.checkout_attempt_id = ca.id
    where ca.anonymous_id = 'audit_instructor10_20260712'
    group by p.id
  `);
  tests.duplicateWebhook = record([
    check("purchase remains singular", 1, Number(duplicate.purchase_count || 0)),
    check("code inventory remains exact", 10, Number(duplicate.code_count || 0)),
    check("duplicate delivery observed", true, Boolean(duplicate.received_again)),
  ], suffixes("checkout", instructor10.checkout_suffix));

  const repeat = await one(`
    with learner as (
      select p.email
      from checkout_attempts ca join purchases p on p.checkout_attempt_id = ca.id
      where ca.anonymous_id = 'audit_full_20260712'
    )
    select count(p.id)::int as purchase_count,
      max(extract(epoch from (e.expires_at - now())) / 86400) as remaining_days
    from learner l
    join purchases p on lower(p.email) = lower(l.email) and p.plan_key = 'full_study_pass'
    join entitlements e on lower(e.email) = lower(l.email)
      and e.product = 'irish-theory-test-coach'
    group by e.expires_at
  `);
  tests.repeatPurchaseExtension = record([
    check("two learner purchases recorded", 2, Number(repeat.purchase_count || 0)),
    check("access extended close to 180 days", true, Number(repeat.remaining_days || 0) >= 179),
  ], suffixes("checkout", full.checkout_suffix));

  const cancelled = await one(`
    select ca.status,
      not exists (select 1 from purchases p where p.checkout_attempt_id = ca.id) as no_purchase,
      right(ca.stripe_checkout_session_id, 6) as checkout_suffix
    from checkout_attempts ca where ca.anonymous_id = 'audit_cancel_20260712'
  `);
  tests.checkoutCancellation = record([
    check("cancelled checkout not fulfilled", "stripe_session_created", cancelled.status),
    check("cancelled checkout grants no purchase", true, Boolean(cancelled.no_purchase)),
  ], suffixes("checkout", cancelled.checkout_suffix));

  const declined = await one(`
    select ca.status, ca.failure_reason,
      not exists (select 1 from purchases p where p.checkout_attempt_id = ca.id) as no_purchase,
      right(ca.stripe_checkout_session_id, 6) as checkout_suffix,
      right(ca.stripe_payment_intent_id, 6) as pi_suffix
    from checkout_attempts ca where ca.anonymous_id = 'audit_decline_trace_20260712'
  `);
  tests.declinedPayment = record([
    check("declined attempt state", "payment_failed", declined.status),
    check("declined attempt reason", "payment_intent_failed", declined.failure_reason),
    check("declined payment grants no purchase", true, Boolean(declined.no_purchase)),
  ], suffixes("checkout", declined.checkout_suffix, "payment_intent", declined.pi_suffix));

  const partial = await one(`
    select p.status as purchase_status, p.refunded_amount, p.entitlement_effect,
      pr.amount as refund_amount, pr.status as refund_status,
      right(pr.stripe_refund_id, 6) as refund_suffix
    from checkout_attempts ca
    join purchases p on p.checkout_attempt_id = ca.id
    join payment_refunds pr on pr.purchase_id = p.id
    where ca.anonymous_id = 'audit_instructor10_20260712'
    order by pr.created_at desc limit 1
  `);
  tests.partialRefund = record([
    check("partial refund amount", 100, Number(partial.refund_amount || 0)),
    check("partial refund succeeded", "succeeded", partial.refund_status),
    check("purchase partially refunded", "partially_refunded", partial.purchase_status),
    check("partial refund does not revoke", "record_only_partial_refund", partial.entitlement_effect),
  ], suffixes("refund", partial.refund_suffix));

  const fullRefund = await one(`
    select p.status as purchase_status, p.refunded_amount, p.entitlement_effect,
      pr.amount as refund_amount, pr.status as refund_status,
      e.active as entitlement_active, e.revoked_reason,
      right(pr.stripe_refund_id, 6) as refund_suffix
    from checkout_attempts ca
    join purchases p on p.checkout_attempt_id = ca.id
    join payment_refunds pr on pr.purchase_id = p.id
    left join entitlements e on lower(e.email) = lower(p.email)
      and e.product = 'irish-theory-test-coach'
    where ca.anonymous_id = 'audit_launch_20260712'
    order by pr.created_at desc limit 1
  `);
  tests.fullRefund = record([
    check("full refund amount", 299, Number(fullRefund.refund_amount || 0)),
    check("full refund succeeded", "succeeded", fullRefund.refund_status),
    check("purchase refunded", "refunded", fullRefund.purchase_status),
    check("refunded entitlement inactive", false, Boolean(fullRefund.entitlement_active)),
    check("refund revocation reason", "stripe_refund", fullRefund.revoked_reason),
  ], suffixes("refund", fullRefund.refund_suffix));

  const dispute = await one(`
    select d.status, d.entitlement_effect,
      d.revocation_applied_at is not null as revocation_applied,
      d.restoration_applied_at is not null as restoration_applied,
      e.active as entitlement_active, e.revoked_reason,
      e.revoked_by_dispute_id is not null as still_dispute_revoked,
      extract(epoch from (e.expires_at - d.revoked_entitlement_expires_at))::int as extension_seconds,
      right(d.stripe_dispute_id, 6) as dispute_suffix,
      exists(select 1 from stripe_events se where se.type='charge.dispute.created' and se.processing_status='processed') as opened_event,
      exists(select 1 from stripe_events se where se.type='charge.dispute.funds_withdrawn' and se.processing_status='processed') as withdrawn_event,
      exists(select 1 from stripe_events se where se.type='charge.dispute.funds_reinstated' and se.processing_status='processed') as reinstated_event,
      exists(select 1 from stripe_events se where se.type='charge.dispute.closed' and se.processing_status='processed') as closed_event
    from payment_disputes d
    join entitlements e on lower(e.email) = lower(d.email)
      and e.product = 'irish-theory-test-coach'
    order by d.created_at desc limit 1
  `);
  tests.disputeOpen = record([
    check("dispute open event processed", true, Boolean(dispute.opened_event)),
    check("funds withdrawn event processed", true, Boolean(dispute.withdrawn_event)),
    check("matching entitlement was revoked", true, Boolean(dispute.revocation_applied)),
  ], suffixes("dispute", dispute.dispute_suffix));
  tests.disputeWonClosed = record([
    check("dispute final state", "won", dispute.status),
    check("dispute restoration effect", "restore", dispute.entitlement_effect),
    check("funds reinstated event processed", true, Boolean(dispute.reinstated_event)),
    check("dispute closed event processed", true, Boolean(dispute.closed_event)),
    check("matching entitlement restored", true, Boolean(dispute.restoration_applied && dispute.entitlement_active)),
    check("dispute revocation marker cleared", false, Boolean(dispute.still_dispute_revoked)),
    check("remaining duration preserved", true, Number(dispute.extension_seconds || 0) > 0),
  ], suffixes("dispute", dispute.dispute_suffix));

  const inventories = await many(`
    select ca.anonymous_id, count(ic.code)::int as code_count
    from checkout_attempts ca
    join purchases p on p.checkout_attempt_id = ca.id
    left join instructor_codes ic on ic.purchase_id = p.id
    where ca.anonymous_id in ('audit_instructor10_20260712', 'audit_instructor25_20260712')
    group by ca.anonymous_id
  `);
  const inventoryMap = Object.fromEntries(inventories.map((row) => [row.anonymous_id, Number(row.code_count)]));
  tests.instructorCodeGeneration = record([
    check("10-code inventory", 10, inventoryMap.audit_instructor10_20260712 || 0),
    check("25-code inventory", 25, inventoryMap.audit_instructor25_20260712 || 0),
  ], suffixes("checkout", instructor10.checkout_suffix, "checkout", instructor25.checkout_suffix));

  const redemption = await one(`
    select count(distinct ic.code)::int as used_codes,
      max(ic.redemption_count)::int as redemption_count,
      count(icr.id)::int as redemption_records,
      exists(select 1 from entitlements e where e.source='instructor_code' and e.active=true) as active_entitlement
    from instructor_codes ic
    join checkout_attempts ca on ca.anonymous_id='audit_instructor10_20260712'
    join purchases p on p.checkout_attempt_id=ca.id and p.id=ic.purchase_id
    left join instructor_code_redemptions icr on icr.code=ic.code
    where ic.status='used'
  `);
  tests.instructorCodeRedemption = record([
    check("one instructor code used", 1, Number(redemption.used_codes || 0)),
    check("single redemption count", 1, Number(redemption.redemption_count || 0)),
    check("single redemption audit row", 1, Number(redemption.redemption_records || 0)),
    check("redeemed learner entitlement active", true, Boolean(redemption.active_entitlement)),
  ], []);

  const malformedResponse = await fetch(`${previewOrigin}/api/stripe-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Stripe-Signature": "t=1,v1=invalid" },
    body: "{}",
  });
  tests.malformedWebhookSignature = record([
    check("malformed signature HTTP status", 400, malformedResponse.status, "http_response"),
  ], []);

  const webhook = await one(`
    select count(*)::int as processed_count,
      count(*) filter (where processing_status='failed')::int as failed_count,
      right(max(stripe_event_id), 6) as event_suffix
    from stripe_events
    where first_received_at > now() - interval '4 hours'
  `);
  tests.validWebhookResponse = record([
    check("processed Stripe events observed", true, Number(webhook.processed_count || 0) > 0, "stripe_webhook_delivery"),
    check("unresolved failed Stripe events", 0, Number(webhook.failed_count || 0), "stripe_webhook_delivery"),
  ], suffixes("event", webhook.event_suffix));

  const reconciliation = await one(`
    select status, findings_count, high_severity_count
    from reconciliation_runs order by started_at desc limit 1
  `);
  tests.reconciliation = {
    ...record([
      check("reconciliation completed", "completed", reconciliation.status),
      check("reconciliation findings", 0, Number(reconciliation.findings_count || 0)),
      check("high severity findings", 0, Number(reconciliation.high_severity_count || 0)),
    ], []),
    unresolvedFindings: Number(reconciliation.findings_count || 0),
  };

  const evidence = {
    schemaVersion: 1,
    generatedAt,
    commit: git(["rev-parse", "HEAD"]),
    branch: git(["branch", "--show-current"]),
    vercelDeploymentId: deploymentId,
    previewOrigin,
    environment: "preview",
    stripeMode: "test",
    tests,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  const failures = Object.entries(tests).filter(([, test]) => test.status !== "PASS");
  console.log(`Payment evidence generated: ${Object.keys(tests).length - failures.length}/${Object.keys(tests).length} checks passed.`);
  if (failures.length) {
    console.error(`Failed evidence checks: ${failures.map(([key]) => key).join(", ")}`);
    process.exitCode = 1;
  }
} catch {
  console.error("Payment evidence generation failed safely.");
  process.exitCode = 1;
} finally {
  await pool.end();
}

async function checkoutCase(anonymousId, planKey, amount) {
  return one(`
    select ca.status as attempt_status, ca.environment, ca.stripe_mode,
      p.status as purchase_status, p.amount, p.currency, p.plan_key,
      right(ca.stripe_checkout_session_id, 6) as checkout_suffix,
      right(p.stripe_payment_intent_id, 6) as pi_suffix
    from checkout_attempts ca
    left join purchases p on p.checkout_attempt_id = ca.id
    where ca.anonymous_id = $1 and ca.resolved_plan_key = $2
      and (p.amount = $3 or p.amount is null)
    order by ca.created_at desc limit 1
  `, [anonymousId, planKey, amount]);
}

async function one(sql, values = []) {
  const result = await pool.query(sql, values);
  return result.rows[0] || {};
}

async function many(sql, values = []) {
  return (await pool.query(sql, values)).rows;
}

function check(name, expected, actual, source = "neon_query") {
  return { name, expected, actual, source };
}

function record(assertions, objectSuffixes) {
  const passed = assertions.every((item) => JSON.stringify(item.expected) === JSON.stringify(item.actual));
  return { status: passed ? "PASS" : "FAIL", observedAt: generatedAt, assertions, objectSuffixes };
}

function suffixes(...pairs) {
  const values = [];
  for (let index = 0; index < pairs.length; index += 2) {
    const type = pairs[index];
    const suffix = String(pairs[index + 1] || "");
    if (suffix) values.push(`${type}...${suffix}`);
  }
  return values;
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}
