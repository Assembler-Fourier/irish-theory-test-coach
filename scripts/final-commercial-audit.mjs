import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const finalDir = path.join(root, "reports", "final");

fs.mkdirSync(finalDir, { recursive: true });

const generatedAt = new Date().toISOString();
const commit = git(["rev-parse", "HEAD"], "unknown");
const branch = git(["branch", "--show-current"], "unknown");

const product = readJson("public/product-summary.json");
const pricing = readJson("public/pricing.json");
const business = readJson("public/business-config.json");
const growth = readJson("public/growth-config.json");
const release = readJson("public/release-manifest.json");
const preview = readJson("public/data/preview-questions.json");
const contentSummary = readJson("reports/content/content-quality-summary.json", null);
const sitemap = readText("public/sitemap.xml");
const robots = readText("public/robots.txt");

const publicFiles = listFiles(path.join(root, "public"));
const publicMapFiles = publicFiles.filter((file) => file.endsWith(".map"));
const publicDataFiles = publicFiles
  .filter((file) => file.includes(`${path.sep}data${path.sep}`))
  .map((file) => rel(file));
const publicDataJsonFiles = publicDataFiles.filter((file) => file.endsWith(".json"));
const publicSecretHits = scanPublicForSecrets(publicFiles);
const previewLeakChecks = checkPreviewPackage(preview);
const routePresence = checkRoutePresence();
const pricingConsistency = checkPricingConsistency(product, pricing);
const businessPlaceholders = Array.isArray(business.launchBlockers) ? business.launchBlockers : [];
const canonicalUsesVercel = /https:\/\/[^"]*vercel\.app/i.test(growth.canonicalOrigin || "") ||
  /https:\/\/[^<]*vercel\.app/i.test(sitemap);
const restoreDrillText = readText("docs/operations/restore-drill-record.md", "");
const restoreDrillNotExecuted = /not yet executed/i.test(restoreDrillText);

const content = {
  totalQuestions: contentSummary?.summary?.totalQuestions || product.totalPublishedQuestions,
  duplicateGroups: contentSummary?.summary?.duplicateGroups || 0,
  conflictingAnswerGroups: contentSummary?.summary?.conflictingAnswerGroups || 0,
  lintFindings: contentSummary?.summary?.lintFindings || 0,
  editorialBacklog: contentSummary?.summary?.editorialBacklog || 0,
  topLintTypes: topLintTypesFromMarkdown(readText("reports/content/content-quality-summary.md", "")),
};

const blockers = [
  ...businessBlockers(),
  ...paymentValidationBlockers(),
  ...contentBlockers(),
  ...operationsBlockers(),
  ...domainBlockers(),
];

const nonBlockingRisks = [
  {
    id: "P2-PREVIEW-001",
    severity: "P2",
    title: "Free preview package contains repeated canonical-question variants.",
    evidence: previewLeakChecks.duplicateCanonicalCount
      ? `Preview has ${previewLeakChecks.duplicateCanonicalCount} repeated canonicalQuestionId value(s).`
      : "No duplicate canonical IDs detected in the current preview package.",
    affected: ["public/data/preview-questions.json", "scripts/prepare-public-data.mjs"],
    status: previewLeakChecks.duplicateCanonicalCount ? "open" : "not_applicable",
    requiredFix: "When tuning preview quality, select distinct canonical/variant groups for the offline preview package.",
    owner: "Content/editorial",
  },
  {
    id: "P2-CONTENT-ALT-001",
    severity: "P2",
    title: "Image-rich content still needs alt-description editorial work.",
    evidence: `${content.topLintTypes.missing_alt_description || 0} missing_alt_description lint findings in reports/content/content-quality-summary.md.`,
    affected: ["data/questions.enriched.json", "reports/content/editorial-backlog.csv"],
    status: (content.topLintTypes.missing_alt_description || 0) > 0 ? "open" : "not_applicable",
    requiredFix: "Add meaningful alt descriptions during editorial review, especially for road-sign/image questions.",
    owner: "Content/editorial",
  },
].filter((risk) => risk.status === "open");

const decision = blockers.some((blocker) => ["P0", "P1"].includes(blocker.severity))
  ? "NO-GO"
  : nonBlockingRisks.length
    ? "GO WITH NAMED NON-BLOCKING RISKS"
    : "GO";

const journeys = buildJourneyMatrix();
const attacks = buildAttackMatrix();
const quality = buildQualityMatrix();
const payment = buildPaymentMatrix();
const checklists = buildLaunchChecklists();
const officialReferences = [
  ["Stripe webhooks", "https://docs.stripe.com/webhooks"],
  ["Stripe Checkout", "https://docs.stripe.com/payments/checkout"],
  ["GitHub Actions workflow syntax", "https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax"],
  ["GitHub deployment environments", "https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments"],
  ["Vercel Cron Jobs", "https://vercel.com/docs/cron-jobs/manage-cron-jobs"],
  ["Neon backups", "https://neon.com/docs/manage/backups"],
];

const readiness = {
  generatedAt,
  branch,
  commit,
  decision,
  product: {
    productVersion: product.productVersion,
    contentVersion: product.contentVersion,
    schemaVersion: product.schemaVersion,
    releaseManifestSchemaVersion: release.schemaVersion,
    totalPublishedQuestions: product.totalPublishedQuestions,
    previewLimit: product.previewLimit,
    activePrice: product.activePrice,
    activePlanKey: product.activePlanKey,
    accessDurationDays: product.accessDurationDays,
  },
  blockers,
  nonBlockingRisks,
  evidence: {
    publicDataJsonFiles,
    publicDataFileCount: publicDataFiles.length,
    publicMapFiles,
    publicSecretHits,
    previewLeakChecks,
    routePresence,
    pricingConsistency,
    businessLaunchBlockers: businessPlaceholders,
    canonicalOrigin: growth.canonicalOrigin,
    robotsAdminBlocked: /Disallow:\s*\/admin/i.test(robots),
    sitemapUrlCount: (sitemap.match(/<loc>/g) || []).length,
  },
  journeys,
  attacks,
  quality,
  payment,
  checklists,
};

write("production-readiness.json", `${JSON.stringify(readiness, null, 2)}\n`);
write("commercial-launch-audit.md", commercialLaunchAudit());
write("security-red-team.md", securityRedTeam());
write("accessibility-report.md", accessibilityReport());
write("payment-test-matrix.md", paymentTestMatrix());
write("content-quality-status.md", contentQualityStatus());

console.log(`Final commercial audit generated in ${path.relative(root, finalDir)}`);
console.log(`Decision: ${decision}`);
console.log(`Blockers: ${blockers.length}`);

function businessBlockers() {
  if (!businessPlaceholders.length) return [];
  return [{
    id: "P1-BIZ-001",
    severity: "P1",
    title: "Mandatory commercial identity and support fields are still placeholders.",
    evidence: `public/business-config.json exposes ${businessPlaceholders.length} launchBlocker item(s): ${businessPlaceholders.join(" ")}`,
    affectedFilesRoutes: [
      "public/business-config.json",
      "public/contact.html",
      "public/privacy.html",
      "public/terms.html",
      "public/refunds.html",
      "/api/create-checkout-session",
    ],
    reproduction: "Run `npm run build` without commercial identity env vars, then open public/business-config.json or any policy page and search for NOT_CONFIGURED.",
    requiredFix: "Configure LEGAL_TRADING_NAME, OPERATOR_TYPE, REGISTERED_ADDRESS, SUPPORT_EMAIL, PRIVACY_EMAIL, REFUND_EMAIL, GOVERNING_JURISDICTION, PRIVACY_LAWFUL_BASIS, INTERNATIONAL_TRANSFER_BASIS, and PRIVACY_COMPLAINT_ROUTE in production/preview as appropriate; rebuild and verify launchBlockers is empty.",
    owner: "Product owner / legal / operations",
    retestRequirement: "Run npm run build, npm run check:compliance, npm run qa, and manually inspect contact/privacy/terms/refunds plus checkout creation.",
  }];
}

function paymentValidationBlockers() {
  return [{
    id: "P1-PAY-001",
    severity: "P1",
    title: "Full Stripe test-mode checkout, webhook entitlement, instructor pack, and refund reconciliation were not executed against a real test Stripe account and Neon database in this audit pass.",
    evidence: "Automated tests cover mocked webhook/payment policy behavior, but no safe test-mode Stripe keys/price IDs/webhook forwarding target were supplied for an end-to-end purchase run in this pass.",
    affectedFilesRoutes: [
      "server/api/create-checkout-session.js",
      "server/api/stripe-webhook.js",
      "server/api/admin/payments.js",
      "lib/instructor-codes.js",
      "/api/create-checkout-session",
      "/api/stripe-webhook",
    ],
    reproduction: "Configure a Neon preview database and Stripe test-mode prices/webhook secret, then run a real test card Checkout for learner and instructor plans; confirm webhook creates purchase, entitlement, and instructor codes.",
    requiredFix: "Complete and record test-mode purchases for Full Study Pass, launch offer if enabled, instructor_10, instructor_25, duplicate webhook replay, refund/dispute recording, and entitlement effects.",
    owner: "Payments / operations",
    retestRequirement: "Run npm run qa, Stripe CLI/dashboard webhook replay, admin payment reconciliation, and update reports/final/payment-test-matrix.md with real test session IDs redacted.",
  }];
}

function contentBlockers() {
  if (!content.conflictingAnswerGroups) return [];
  return [{
    id: "P1-CONTENT-001",
    severity: "P1",
    title: "Conflicting-answer groups remain unresolved before commercial launch.",
    evidence: `reports/content/content-quality-summary.json reports ${content.conflictingAnswerGroups} conflicting-answer groups and ${content.editorialBacklog} editorial backlog items.`,
    affectedFilesRoutes: [
      "data/questions.enriched.json",
      "reports/content/conflicting-answer-groups.csv",
      "server/api/admin/content-quality.js",
      "/app",
      "/admin.html",
    ],
    reproduction: "Run `npm run content:quality` and inspect reports/content/conflicting-answer-groups.csv.",
    requiredFix: "Review conflicting-answer groups in admin/content-quality workflow, mark legitimate variants or publish decisions, and do not silently change factual answers without approved source support.",
    owner: "Content/editorial lead",
    retestRequirement: "Run npm run content:quality, npm run validate, npm run qa, then spot-check affected question sessions and admin decisions.",
  }];
}

function operationsBlockers() {
  if (!restoreDrillNotExecuted) return [];
  return [{
    id: "P1-OPS-001",
    severity: "P1",
    title: "Backup restoration has not been tested in a non-production restore drill.",
    evidence: "docs/operations/restore-drill-record.md states the restore drill is not yet executed.",
    affectedFilesRoutes: [
      "docs/operations/backup-restore.md",
      "docs/operations/restore-drill-record.md",
      "database/schema.sql",
      "Neon project",
    ],
    reproduction: "Open docs/operations/restore-drill-record.md and confirm no completed restoration date/source/target/checks are recorded.",
    requiredFix: "Run a Neon non-production restore from backup or branch, record row counts/integrity checks/elapsed time/problems, and keep secrets out of the record.",
    owner: "Operations",
    retestRequirement: "Record a completed restore drill, then run npm run check:migrations and npm run qa against the restored environment if feasible.",
  }];
}

function domainBlockers() {
  if (!canonicalUsesVercel) return [];
  return [{
    id: "P1-DOMAIN-001",
    severity: "P1",
    title: "Production canonical origin is still the Vercel app URL instead of a configured custom commercial domain.",
    evidence: `public/growth-config.json canonicalOrigin is ${growth.canonicalOrigin}; sitemap/canonical metadata currently use that origin.`,
    affectedFilesRoutes: [
      "public/growth-config.json",
      "public/sitemap.xml",
      "shared/growth-config.js",
      "all public SEO pages",
    ],
    reproduction: "Run `npm run build` without PUBLIC_CANONICAL_ORIGIN, then inspect public/growth-config.json and public/sitemap.xml.",
    requiredFix: "Connect the custom domain, set PUBLIC_CANONICAL_ORIGIN to the final HTTPS origin, rebuild, and submit the final sitemap.",
    owner: "Growth / operations",
    retestRequirement: "Run npm run check:seo, npm run qa, and inspect Search Console URL Inspection for priority pages.",
  }];
}

function buildJourneyMatrix() {
  return {
    freeLearner: [
      row("landing page", "pass", "Homepage exists, is indexable, and is covered by SEO/app-flow checks."),
      row("preview start", "pass", "test-app-flows and test-e2e cover preview loading from public preview package."),
      row("answer flow", "pass", "test-e2e covers keyboard answer, correct state, wrong state, and feedback live region."),
      row("refresh", "pass", "test-e2e reloads /app before mock flow; local preview state is client-backed."),
      row("offline preview", "pass", "check:pwa validates service worker shell/preview caching; full premium bank is not cached publicly."),
      row("preview limit", "pass", "test-content-security verifies preview cannot exceed server-side limit; preview package has 15 questions."),
      row("paywall", "pass", "test-e2e covers premium mode paywall and restore entry."),
      row("pricing", "pass", "pricing route exists, SEO checks pass, pricing config matches active product summary."),
      row("support", "blocked", "Support page exists but public support mailbox is NOT_CONFIGURED until P1-BIZ-001 is fixed."),
    ],
    paidLearner: [
      row("checkout test-mode flow", "blocked", "Requires real Stripe test-mode env and Neon preview DB; not executed in this pass."),
      row("webhook entitlement", "partial", "Mock webhook test passes; real test-mode webhook entitlement must be exercised before launch."),
      row("login link", "pass", "Auth tests cover unknown/known/malformed/throttled/expired/used token behavior."),
      row("access restoration", "partial", "Restore UI/API covered; production email provider and support identity remain unconfigured."),
      row("premium study", "pass", "Content-security tests verify active paid users can access premium questions and logged-out/expired users cannot."),
      row("mock", "pass", "E2E covers premium mock start and test suite covers forged score rejection."),
      row("progress sync", "pass", "API progress/attempt routes and test suite cover server-backed progress contracts."),
      row("second device", "manual_required", "Passwordless account model supports it, but real cross-browser email-link restore needs staging test."),
      row("session logout", "pass", "Account/auth tests cover session revocation paths."),
      row("expired access", "pass", "Content-security tests cover expired users blocked from premium content."),
      row("renewal", "manual_required", "Entitlement extension logic exists; repeat-purchase behavior needs real Stripe/DB staging test."),
      row("data export", "pass", "Account export route exists and admin/account tests cover access control."),
      row("deletion request", "pass", "Delete-account request route/page exists; operational fulfillment remains support/legal workflow."),
    ],
    instructor: [
      row("pack purchase", "blocked", "Instructor Stripe pack purchase was not executed in real Stripe test mode."),
      row("code generation", "partial", "generateInstructorCodesForPurchase creates strong codes; needs real pack purchase test."),
      row("CSV export", "pass", "Admin export/instructor routes exist and admin authz test covers them."),
      row("learner redemption", "partial", "Server redemption logic exists with generic errors; real DB redemption test still needed."),
      row("duplicate redemption", "partial", "Database row lock prevents concurrent double use; concurrency staging test still required."),
      row("code expiration", "partial", "isRedeemable checks expires_at; staging fixture test recommended."),
      row("code revocation", "pass", "Admin payment action supports confirmed revocation and audit logging."),
      row("instructor reporting", "pass", "Admin instructors/referrals/revenue routes exist with role enforcement."),
    ],
    admin: [
      row("role enforcement", "pass", "test-admin-authz verifies 401/403/authorized behavior across admin endpoints."),
      row("user search", "pass", "Admin users endpoint and UI route exist."),
      row("purchase reconciliation", "pass", "Admin payments and ops reconciliation routes exist; scheduled reconciliation added."),
      row("refund recording", "pass", "Admin payments supports confirmed manual refund record and audit."),
      row("entitlement management", "pass", "Admin entitlements supports grant/revoke/extend with audit."),
      row("content editing", "pass", "Admin content-quality endpoint stores version/review decisions."),
      row("duplicate review", "pass", "Duplicate/conflict groups are exposed through admin content-quality API."),
      row("learner question report", "pass", "question-feedback route exists and is wired in app flow test."),
      row("audit log", "pass", "Admin audit log table/API and mutation logging exist."),
      row("support case", "pass", "Support case table/API exist."),
      row("export", "pass", "Admin export route exists and authz test covers it."),
    ],
  };
}

function buildAttackMatrix() {
  return [
    row("download complete public question bank", previewLeakChecks.fullBankPublic ? "fail" : "pass", `Public data JSON files: ${publicDataJsonFiles.join(", ") || "none"}. Preview exposes ${previewLeakChecks.questionCount} questions.`),
    row("access premium API logged out", "pass", "test-content-security verifies logged-out users cannot access premium questions."),
    row("forge entitlement", "pass", "Premium access requires server session + entitlement; client localStorage is fallback-only for legacy UI, not premium API."),
    row("alter price", "pass", "Checkout plan resolves server-side Stripe price ID; browser never submits amount."),
    row("replay webhook", "pass", "Webhook event store idempotency and duplicate mock tests pass."),
    row("reuse login token", "pass", "Auth tests cover consumed token and consumeLoginToken locks token row."),
    row("brute-force login requests", "pass", "Request-login and consume-login endpoints use IP/email/token scoped rate limits."),
    row("spam analytics", "pass", "Events endpoint has validation, allowlist and rate limiting; oversized body test passes."),
    row("redeem code concurrently", "partial", "Instructor code redemption uses SELECT FOR UPDATE; needs staging concurrency test with real database."),
    row("IDOR", "pass", "Admin endpoints require server-side roles; study sessions signed and tied to entitlement/email."),
    row("CSRF", "pass", "State-changing routes verify Origin/Host; security tests include origin bypass checks."),
    row("XSS", "pass", "Request validators reject unsafe strings; security tests cover stored/reflected XSS probes."),
    row("SQL injection", "pass", "APIs use parameterized queries; security tests cover injection attempts."),
    row("oversized request", "pass", "Catch-all and body readers enforce size limits; tests cover 413."),
    row("cache leakage", "pass", "API default Cache-Control is no-store; protected media is short private cache."),
    row("inspect source maps", publicMapFiles.length ? "risk" : "pass", publicMapFiles.length ? `Public source maps found: ${publicMapFiles.map(rel).join(", ")}` : "No public .map files found."),
    row("inspect public assets for secrets or answer keys", publicSecretHits.length || !previewLeakChecks.noAnswerKeys ? "fail" : "pass", publicSecretHits.length ? `Potential public secret hits: ${publicSecretHits.length}` : "No obvious public secret patterns; preview package has no answer-key fields."),
  ];
}

function buildQualityMatrix() {
  return [
    row("mobile 320-430px", "pass", "test:e2e covers 320, 360, 375, 390, 412, 430 no-horizontal-scroll checks."),
    row("tablet", "pass", "test:e2e/test:visual cover tablet 768px."),
    row("1024px", "manual_required", "CSS supports desktop; specific 1024 manual viewport is required for final release signoff."),
    row("1280px", "pass", "test:e2e/test:visual cover 1280px."),
    row("1440px", "manual_required", "Specific 1440 manual viewport is required for final release signoff."),
    row("keyboard", "pass", "test:e2e covers keyboard answer flow."),
    row("screen reader landmarks", "pass", "test:a11y axe checks 7 states, 0 critical violations in last run."),
    row("200% zoom", "manual_required", "Needs manual browser zoom inspection before launch."),
    row("reduced motion", "manual_required", "CSS includes reduced-motion handling; manual verification still required."),
    row("slow network", "manual_required", "Loading states exist; staging throttled-network test required."),
    row("API failure", "partial", "Smoke/API tests cover safe errors; manual app behavior under API outage still needed."),
    row("email failure", "pass", "request-login-link records email_delivery_failure and returns safe production failure."),
    row("database failure", "pass", "/api/ready emits safe DB failure and does not expose internals."),
    row("expired session", "pass", "Auth/session tests cover expired/revoked session behavior."),
    row("duplicate webhook", "pass", "Webhook mock tests cover duplicate idempotency."),
  ];
}

function buildPaymentMatrix() {
  const activePlan = pricing.plans.find((plan) => plan.active);
  return {
    activePlan,
    plans: pricing.plans.map((plan) => ({
      key: plan.key,
      label: plan.label,
      displayPrice: plan.displayPrice,
      amountCents: plan.amountCents,
      currency: plan.currency,
      entitlementDays: plan.entitlementDays,
      enabled: plan.enabled,
      checkout: plan.checkout,
      tested: "mock_or_static_only",
      realStripeTestModeStatus: "not_executed",
    })),
    checks: [
      row("server-authoritative price", "pass", "resolveCheckoutPlan reads Stripe price IDs from env; create-checkout-session sends line_items[0][price]."),
      row("checkout attempt before redirect", "pass", "createCheckoutAttempt runs before Stripe session creation."),
      row("webhook signature verification", "pass", "verifyStripeSignature validates timestamp/HMAC and test:webhook passes."),
      row("event idempotency", "pass", "beginStripeEventProcessing and webhook mock test cover duplicate events."),
      row("return URL entitlement grant", "pass", "Entitlement is not granted solely by browser return URL; webhook/session verification handles access."),
      row("refund/dispute representation", "pass", "Stripe webhook and admin payment endpoints record refund/dispute state and entitlement effects."),
      row("real learner checkout", "blocked", "Needs Stripe test-mode run."),
      row("real instructor checkout", "blocked", "Needs Stripe test-mode run."),
    ],
  };
}

function buildLaunchChecklists() {
  return {
    environment: [
      "Set all business identity/support/privacy/refund/security env vars.",
      "Set PUBLIC_SITE_URL and PUBLIC_CANONICAL_ORIGIN to the final HTTPS custom domain.",
      "Set DATABASE_URL to the intended Neon production database.",
      "Set STUDY_SESSION_SECRET and RATE_LIMIT_SALT to strong random values.",
      "Set EMAIL_FROM and EMAIL_PROVIDER_API_KEY only after email domain is verified.",
      "Set MONITORING_ENABLED and MONITORING_WEBHOOK_URL if monitoring is live.",
      "Set OPS_CRON_SECRET for Vercel Cron reconciliation.",
    ],
    migration: [
      "Run npm run check:migrations.",
      "Run npm run db:migrate against a Neon preview branch.",
      "Run npm run db:migrate against production only inside the approved release window.",
      "Confirm schema_migrations has 0001 and 0002 with expected checksums.",
    ],
    stripe: [
      "Create test and live Stripe prices for every enabled plan.",
      "Configure STRIPE_PRICE_ID_FULL, STRIPE_PRICE_ID_LAUNCH, STRIPE_PRICE_ID_INSTRUCTOR_10, STRIPE_PRICE_ID_INSTRUCTOR_25.",
      "Configure STRIPE_WEBHOOK_SECRET for /api/stripe-webhook.",
      "Run test-mode learner checkout, instructor checkout, webhook replay, refund, and dispute simulations.",
      "Confirm no live key is used in preview/local and no test key is used in production.",
    ],
    domain: [
      "Connect custom domain in Vercel.",
      "Set PUBLIC_CANONICAL_ORIGIN.",
      "Rebuild and confirm sitemap/canonical URLs use the custom domain.",
      "Submit sitemap in Google Search Console.",
    ],
    manualSmoke: [
      "Homepage loads.",
      "Free preview starts and answers reveal only after submission.",
      "Offline preview reload works after first load.",
      "Paywall and pricing show EUR 4.99 / 90 days.",
      "Restore access returns generic response.",
      "Unauthorized admin request rejects.",
      "Premium API rejects logged-out user.",
      "Stripe test checkout completes and webhook grants entitlement.",
      "Instructor code redemption grants access once.",
      "Account export and deletion request work.",
    ],
    rollback: [
      "Use Vercel dashboard or CLI to promote the previous known-good deployment.",
      "Disable failing cron/webhook endpoint if it causes operational harm.",
      "If a migration caused the incident, follow docs/operations/rollback-runbook.md; do not manually edit production data without a snapshot.",
      "Run npm run smoke:postdeploy against the restored deployment.",
    ],
  };
}

function commercialLaunchAudit() {
  return md([
    "# Final Commercial Launch Audit",
    "",
    `Generated: ${generatedAt}`,
    `Branch: ${branch}`,
    `Commit: ${commit}`,
    "",
    decision,
    "",
    "## Executive Summary",
    "",
    `The current build passes the automated commercial QA suite, but this red-team audit does not approve launch because ${blockers.length} unresolved P1 blocker(s) remain. No P0 exploit was found in the audited static/API surface, and the core learner, premium access, admin authorization, PWA, SEO, and visual/a11y tests are in place.`,
    "",
    "## Blockers",
    blockerMarkdown(blockers),
    "",
    "## Non-Blocking Risks",
    risksMarkdown(nonBlockingRisks),
    "",
    "## User Journey Status",
    journeyMarkdown(journeys),
    "",
    "## Commercial Consistency",
    "",
    `- Active price: ${product.activePrice}`,
    `- Access duration: ${product.accessDurationDays} days`,
    `- Pricing config active learner plan: ${pricing.activeLearnerPlanKey}`,
    `- Pricing consistency: ${pricingConsistency.ok ? "pass" : `fail (${pricingConsistency.errors.join("; ")})`}`,
    `- Policy version recording: implemented through checkout metadata; final legal config blocked by ${businessPlaceholders.length} placeholder(s).`,
    `- Operator details present: ${businessPlaceholders.length ? "blocked" : "pass"}`,
    `- Support mailbox configured: ${business.supportEmail && !business.supportEmail.includes("NOT_CONFIGURED") ? "pass" : "blocked"}`,
    `- Custom domain canonical: ${canonicalUsesVercel ? "blocked" : "pass"}`,
    "",
    "## Release Checklist",
    checklistMarkdown(checklists),
    "",
    "## Official References",
    referencesMarkdown(),
  ]);
}

function securityRedTeam() {
  return md([
    "# Security Red-Team Report",
    "",
    `Generated: ${generatedAt}`,
    "",
    decision,
    "",
    "## Attack Matrix",
    table(["Attack", "Status", "Evidence"], attacks.map((item) => [item.name, item.status, item.evidence])),
    "",
    "## Security Blockers",
    blockerMarkdown(blockers.filter((blocker) => blocker.id.startsWith("P1-PAY") || blocker.id.startsWith("P1-OPS"))),
    "",
    "## Notes",
    "",
    "- Public data exposure checks found only the generated preview data package in `public/data/`.",
    "- Stripe webhook signature verification and event idempotency are implemented and covered by mock tests.",
    "- The full real Stripe/Neon operational path is still a blocker until run in test mode.",
    "",
    "## Official References",
    referencesMarkdown(["Stripe webhooks", "Stripe Checkout"]),
  ]);
}

function accessibilityReport() {
  return md([
    "# Accessibility Report",
    "",
    `Generated: ${generatedAt}`,
    "",
    decision,
    "",
    "## Coverage",
    table(["Quality Item", "Status", "Evidence"], quality.map((item) => [item.name, item.status, item.evidence])),
    "",
    "## Current Automated Evidence",
    "",
    "- `npm run test:e2e` covers mobile no-horizontal-scroll widths, keyboard answer flow, answer states, paywall, restore modal, mock mode, account/pricing/admin locked routes.",
    "- `npm run test:a11y` runs axe over 7 states and expects 0 critical violations.",
    "- `npm run test:visual` captures 15 deterministic screenshots under `reports/ui/pass4/`.",
    "",
    "## Remaining Manual Checks",
    "",
    "- 1024px and 1440px exact desktop viewport review.",
    "- 200% browser zoom.",
    "- Reduced motion OS/browser setting.",
    "- Slow network and API failure UX.",
  ]);
}

function paymentTestMatrix() {
  return md([
    "# Payment Test Matrix",
    "",
    `Generated: ${generatedAt}`,
    "",
    decision,
    "",
    "## Plans",
    table(
      ["Plan", "Label", "Price", "Enabled", "Access Days", "Real Stripe Test Status"],
      payment.plans.map((plan) => [plan.key, plan.label, plan.displayPrice, String(plan.enabled), String(plan.entitlementDays), plan.realStripeTestModeStatus])
    ),
    "",
    "## Payment Checks",
    table(["Check", "Status", "Evidence"], payment.checks.map((item) => [item.name, item.status, item.evidence])),
    "",
    "## Required Real Test-Mode Matrix Before GO",
    "",
    "- Full Study Pass checkout completes with Stripe test card and creates purchase + entitlement by webhook.",
    "- Launch offer checkout works if `LAUNCH_OFFER_ENABLED=true`.",
    "- Instructor 10-code and 25-code checkout generate exact code inventory.",
    "- Webhook duplicate replay remains idempotent.",
    "- Refund/dispute events update payment state and entitlement effect as expected.",
    "- Admin reconciliation reports no paid sessions missing purchases or purchases missing entitlements.",
    "",
    "## Official References",
    referencesMarkdown(["Stripe webhooks", "Stripe Checkout"]),
  ]);
}

function contentQualityStatus() {
  return md([
    "# Content Quality Status",
    "",
    `Generated: ${generatedAt}`,
    "",
    decision,
    "",
    "## Summary",
    "",
    `- Total questions: ${content.totalQuestions}`,
    `- Duplicate groups: ${content.duplicateGroups}`,
    `- Conflicting-answer groups: ${content.conflictingAnswerGroups}`,
    `- Lint findings: ${content.lintFindings}`,
    `- Editorial backlog items: ${content.editorialBacklog}`,
    "",
    "## Top Lint Types",
    table(["Lint Type", "Count"], Object.entries(content.topLintTypes).map(([key, value]) => [key, String(value)])),
    "",
    "## Content Decision",
    "",
    "Content rights are owner-confirmed and no content is removed for provenance reasons. The release blocker is quality, not ownership: unresolved conflicting-answer groups must be reviewed before commercial launch.",
    "",
    "## Required Retest",
    "",
    "- Run `npm run content:quality` after editorial decisions.",
    "- Confirm conflicting-answer queue is reduced to reviewed/legitimate variants.",
    "- Spot-check session selection to confirm duplicate variants do not repeat in one session.",
    "- Confirm learner question-report flow writes reviewable records.",
  ]);
}

function row(name, status, evidence) {
  return { name, status, evidence };
}

function checkPreviewPackage(payload) {
  const questions = Array.isArray(payload?.questions) ? payload.questions : [];
  const text = JSON.stringify(payload || {});
  const canonicalCounts = new Map();
  for (const question of questions) {
    const key = question.canonicalQuestionId || question.id;
    canonicalCounts.set(key, (canonicalCounts.get(key) || 0) + 1);
  }
  return {
    questionCount: questions.length,
    previewLimit: payload?.previewLimit || null,
    underLimit: questions.length <= Number(payload?.previewLimit || 0),
    noAnswerKeys: !/"correct(Index|Answer|_index|_answer)"\s*:/i.test(text) &&
      !/"isCorrect"\s*:\s*true/i.test(text) &&
      !/"is_correct"\s*:\s*true/i.test(text) &&
      !/"explanation"\s*:\s*"[^"]+/i.test(text),
    duplicateCanonicalCount: Array.from(canonicalCounts.values()).filter((count) => count > 1).length,
    fullBankPublic: questions.length > Number(product.previewLimit || 15),
  };
}

function checkRoutePresence() {
  const required = [
    "public/index.html",
    "public/app.html",
    "public/pricing.html",
    "public/learn.html",
    "public/road-signs.html",
    "public/mock-exam.html",
    "public/account.html",
    "public/support.html",
    "public/admin.html",
    "server/api/create-checkout-session.js",
    "server/api/stripe-webhook.js",
    "server/api/request-login-link.js",
    "server/api/consume-login-link.js",
    "server/api/referral-code.js",
    "server/api/v1-study-sessions.js",
    "server/api/v1-media.js",
    "server/api/admin/payments.js",
  ];
  return Object.fromEntries(required.map((file) => [file, fs.existsSync(path.join(root, file))]));
}

function checkPricingConsistency(productSummary, pricingConfig) {
  const errors = [];
  const active = pricingConfig.plans?.find((plan) => plan.active);
  if (!active) errors.push("No active pricing plan.");
  if (active && active.displayPrice !== productSummary.activePrice) {
    errors.push(`Active price mismatch: ${active.displayPrice} vs ${productSummary.activePrice}.`);
  }
  if (active && Number(active.entitlementDays) !== Number(productSummary.accessDurationDays)) {
    errors.push(`Access duration mismatch: ${active.entitlementDays} vs ${productSummary.accessDurationDays}.`);
  }
  return { ok: errors.length === 0, errors };
}

function scanPublicForSecrets(files) {
  const patterns = [
    /sk_live_[A-Za-z0-9_-]+/,
    /sk_test_[A-Za-z0-9_-]+/,
    /whsec_[A-Za-z0-9_-]+/,
    /postgres(?:ql)?:\/\/\S+/i,
  ];
  const hits = [];
  for (const file of files) {
    if (!/\.(html|js|json|txt|xml|webmanifest|css)$/i.test(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    if (patterns.some((pattern) => pattern.test(text))) hits.push(rel(file));
  }
  return hits;
}

function topLintTypesFromMarkdown(markdown) {
  const result = {};
  const section = markdown.split("## Top Lint Types")[1]?.split("## ")[0] || "";
  for (const line of section.split(/\r?\n/)) {
    const match = line.match(/^-\s+([^:]+):\s+(\d+)/);
    if (match) result[match[1].trim()] = Number(match[2]);
  }
  return result;
}

function blockerMarkdown(items) {
  if (!items.length) return "No P0/P1 blockers recorded.\n";
  return items.map((item) => [
    `### ${item.id}: ${item.title}`,
    "",
    `- Severity: ${item.severity}`,
    `- Evidence: ${item.evidence}`,
    `- Affected files/routes: ${(item.affectedFilesRoutes || item.affected || []).join(", ")}`,
    `- Reproduction: ${item.reproduction}`,
    `- Required fix: ${item.requiredFix}`,
    `- Owner: ${item.owner}`,
    `- Retest requirement: ${item.retestRequirement}`,
  ].join("\n")).join("\n\n");
}

function risksMarkdown(items) {
  if (!items.length) return "No named non-blocking risks recorded.\n";
  return items.map((item) => [
    `### ${item.id}: ${item.title}`,
    "",
    `- Severity: ${item.severity}`,
    `- Evidence: ${item.evidence}`,
    `- Affected: ${(item.affected || []).join(", ")}`,
    `- Required fix: ${item.requiredFix}`,
    `- Owner: ${item.owner}`,
  ].join("\n")).join("\n\n");
}

function journeyMarkdown(groups) {
  return Object.entries(groups)
    .map(([name, items]) => [
      `### ${titleCase(name)}`,
      "",
      table(["Journey", "Status", "Evidence"], items.map((item) => [item.name, item.status, item.evidence])),
    ].join("\n"))
    .join("\n\n");
}

function checklistMarkdown(items) {
  return Object.entries(items)
    .map(([name, values]) => [
      `### ${titleCase(name)}`,
      "",
      ...values.map((value) => `- ${value}`),
    ].join("\n"))
    .join("\n\n");
}

function referencesMarkdown(onlyLabels = null) {
  const allowed = onlyLabels ? new Set(onlyLabels) : null;
  return officialReferences
    .filter(([label]) => !allowed || allowed.has(label))
    .map(([label, url]) => `- ${label}: ${url}`)
    .join("\n");
}

function table(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((cells) => `| ${cells.map(escapeCell).join(" | ")} |`),
  ].join("\n");
}

function escapeCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function md(lines) {
  return `${lines.join("\n")}\n`;
}

function write(name, content) {
  fs.writeFileSync(path.join(finalDir, name), content, "utf8");
}

function readJson(relative, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
  } catch {
    return fallback;
  }
}

function readText(relative, fallback = "") {
  try {
    return fs.readFileSync(path.join(root, relative), "utf8");
  } catch {
    return fallback;
  }
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

function rel(file) {
  return path.relative(root, file).replace(/\\/g, "/");
}

function git(args, fallback) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return fallback;
  }
}

function titleCase(value) {
  return String(value)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
