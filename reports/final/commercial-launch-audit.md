# Final Commercial Launch Audit

Generated: 2026-07-11T20:11:20.148Z
Branch: codex/commercial-v1
Commit: ddfc7d734d0aa7eb0a12ed46d84872f4cc25bd84

NO-GO

## Executive Summary

The current build passes the automated commercial QA suite, but this red-team audit does not approve launch because 5 unresolved P1 blocker(s) remain. No P0 exploit was found in the audited static/API surface, and the core learner, premium access, admin authorization, PWA, SEO, and visual/a11y tests are in place.

## Blockers
### P1-BIZ-001: Mandatory commercial identity and support fields are still placeholders.

- Severity: P1
- Evidence: public/business-config.json exposes 10 launchBlocker item(s): Configure legalTradingName. Configure operatorType. Configure registeredAddress. Configure supportEmail. Configure privacyEmail. Configure refundEmail. Configure governingJurisdiction. Configure privacyLawfulBasis. Configure internationalTransferBasis. Configure complaintRoute.
- Affected files/routes: public/business-config.json, public/contact.html, public/privacy.html, public/terms.html, public/refunds.html, /api/create-checkout-session
- Reproduction: Run `npm run build` without commercial identity env vars, then open public/business-config.json or any policy page and search for NOT_CONFIGURED.
- Required fix: Configure LEGAL_TRADING_NAME, OPERATOR_TYPE, REGISTERED_ADDRESS, SUPPORT_EMAIL, PRIVACY_EMAIL, REFUND_EMAIL, GOVERNING_JURISDICTION, PRIVACY_LAWFUL_BASIS, INTERNATIONAL_TRANSFER_BASIS, and PRIVACY_COMPLAINT_ROUTE in production/preview as appropriate; rebuild and verify launchBlockers is empty.
- Owner: Product owner / legal / operations
- Retest requirement: Run npm run build, npm run check:compliance, npm run qa, and manually inspect contact/privacy/terms/refunds plus checkout creation.

### P1-PAY-001: Full Stripe test-mode checkout, webhook entitlement, instructor pack, and refund reconciliation were not executed against a real test Stripe account and Neon database in this audit pass.

- Severity: P1
- Evidence: Automated tests cover mocked webhook/payment policy behavior, but no safe test-mode Stripe keys/price IDs/webhook forwarding target were supplied for an end-to-end purchase run in this pass.
- Affected files/routes: server/api/create-checkout-session.js, server/api/stripe-webhook.js, server/api/admin/payments.js, lib/instructor-codes.js, /api/create-checkout-session, /api/stripe-webhook
- Reproduction: Configure a Neon preview database and Stripe test-mode prices/webhook secret, then run a real test card Checkout for learner and instructor plans; confirm webhook creates purchase, entitlement, and instructor codes.
- Required fix: Complete and record test-mode purchases for Full Study Pass, launch offer if enabled, instructor_10, instructor_25, duplicate webhook replay, refund/dispute recording, and entitlement effects.
- Owner: Payments / operations
- Retest requirement: Run npm run qa, Stripe CLI/dashboard webhook replay, admin payment reconciliation, and update reports/final/payment-test-matrix.md with real test session IDs redacted.

### P1-CONTENT-001: Conflicting-answer groups remain unresolved before commercial launch.

- Severity: P1
- Evidence: reports/content/content-quality-summary.json reports 175 conflicting-answer groups and 1436 editorial backlog items.
- Affected files/routes: data/questions.enriched.json, reports/content/conflicting-answer-groups.csv, server/api/admin/content-quality.js, /app, /admin.html
- Reproduction: Run `npm run content:quality` and inspect reports/content/conflicting-answer-groups.csv.
- Required fix: Review conflicting-answer groups in admin/content-quality workflow, mark legitimate variants or publish decisions, and do not silently change factual answers without approved source support.
- Owner: Content/editorial lead
- Retest requirement: Run npm run content:quality, npm run validate, npm run qa, then spot-check affected question sessions and admin decisions.

### P1-OPS-001: Backup restoration has not been tested in a non-production restore drill.

- Severity: P1
- Evidence: docs/operations/restore-drill-record.md states the restore drill is not yet executed.
- Affected files/routes: docs/operations/backup-restore.md, docs/operations/restore-drill-record.md, database/schema.sql, Neon project
- Reproduction: Open docs/operations/restore-drill-record.md and confirm no completed restoration date/source/target/checks are recorded.
- Required fix: Run a Neon non-production restore from backup or branch, record row counts/integrity checks/elapsed time/problems, and keep secrets out of the record.
- Owner: Operations
- Retest requirement: Record a completed restore drill, then run npm run check:migrations and npm run qa against the restored environment if feasible.

### P1-DOMAIN-001: Production canonical origin is still the Vercel app URL instead of a configured custom commercial domain.

- Severity: P1
- Evidence: public/growth-config.json canonicalOrigin is https://irish-theory-test-coach.vercel.app; sitemap/canonical metadata currently use that origin.
- Affected files/routes: public/growth-config.json, public/sitemap.xml, shared/growth-config.js, all public SEO pages
- Reproduction: Run `npm run build` without PUBLIC_CANONICAL_ORIGIN, then inspect public/growth-config.json and public/sitemap.xml.
- Required fix: Connect the custom domain, set PUBLIC_CANONICAL_ORIGIN to the final HTTPS origin, rebuild, and submit the final sitemap.
- Owner: Growth / operations
- Retest requirement: Run npm run check:seo, npm run qa, and inspect Search Console URL Inspection for priority pages.

## Non-Blocking Risks
### P2-PREVIEW-001: Free preview package contains repeated canonical-question variants.

- Severity: P2
- Evidence: Preview has 1 repeated canonicalQuestionId value(s).
- Affected: public/data/preview-questions.json, scripts/prepare-public-data.mjs
- Required fix: When tuning preview quality, select distinct canonical/variant groups for the offline preview package.
- Owner: Content/editorial

### P2-CONTENT-ALT-001: Image-rich content still needs alt-description editorial work.

- Severity: P2
- Evidence: 666 missing_alt_description lint findings in reports/content/content-quality-summary.md.
- Affected: data/questions.enriched.json, reports/content/editorial-backlog.csv
- Required fix: Add meaningful alt descriptions during editorial review, especially for road-sign/image questions.
- Owner: Content/editorial

## User Journey Status
### Free Learner

| Journey | Status | Evidence |
| --- | --- | --- |
| landing page | pass | Homepage exists, is indexable, and is covered by SEO/app-flow checks. |
| preview start | pass | test-app-flows and test-e2e cover preview loading from public preview package. |
| answer flow | pass | test-e2e covers keyboard answer, correct state, wrong state, and feedback live region. |
| refresh | pass | test-e2e reloads /app before mock flow; local preview state is client-backed. |
| offline preview | pass | check:pwa validates service worker shell/preview caching; full premium bank is not cached publicly. |
| preview limit | pass | test-content-security verifies preview cannot exceed server-side limit; preview package has 15 questions. |
| paywall | pass | test-e2e covers premium mode paywall and restore entry. |
| pricing | pass | pricing route exists, SEO checks pass, pricing config matches active product summary. |
| support | blocked | Support page exists but public support mailbox is NOT_CONFIGURED until P1-BIZ-001 is fixed. |

### Paid Learner

| Journey | Status | Evidence |
| --- | --- | --- |
| checkout test-mode flow | blocked | Requires real Stripe test-mode env and Neon preview DB; not executed in this pass. |
| webhook entitlement | partial | Mock webhook test passes; real test-mode webhook entitlement must be exercised before launch. |
| login link | pass | Auth tests cover unknown/known/malformed/throttled/expired/used token behavior. |
| access restoration | partial | Restore UI/API covered; production email provider and support identity remain unconfigured. |
| premium study | pass | Content-security tests verify active paid users can access premium questions and logged-out/expired users cannot. |
| mock | pass | E2E covers premium mock start and test suite covers forged score rejection. |
| progress sync | pass | API progress/attempt routes and test suite cover server-backed progress contracts. |
| second device | manual_required | Passwordless account model supports it, but real cross-browser email-link restore needs staging test. |
| session logout | pass | Account/auth tests cover session revocation paths. |
| expired access | pass | Content-security tests cover expired users blocked from premium content. |
| renewal | manual_required | Entitlement extension logic exists; repeat-purchase behavior needs real Stripe/DB staging test. |
| data export | pass | Account export route exists and admin/account tests cover access control. |
| deletion request | pass | Delete-account request route/page exists; operational fulfillment remains support/legal workflow. |

### Instructor

| Journey | Status | Evidence |
| --- | --- | --- |
| pack purchase | blocked | Instructor Stripe pack purchase was not executed in real Stripe test mode. |
| code generation | partial | generateInstructorCodesForPurchase creates strong codes; needs real pack purchase test. |
| CSV export | pass | Admin export/instructor routes exist and admin authz test covers them. |
| learner redemption | partial | Server redemption logic exists with generic errors; real DB redemption test still needed. |
| duplicate redemption | partial | Database row lock prevents concurrent double use; concurrency staging test still required. |
| code expiration | partial | isRedeemable checks expires_at; staging fixture test recommended. |
| code revocation | pass | Admin payment action supports confirmed revocation and audit logging. |
| instructor reporting | pass | Admin instructors/referrals/revenue routes exist with role enforcement. |

### Admin

| Journey | Status | Evidence |
| --- | --- | --- |
| role enforcement | pass | test-admin-authz verifies 401/403/authorized behavior across admin endpoints. |
| user search | pass | Admin users endpoint and UI route exist. |
| purchase reconciliation | pass | Admin payments and ops reconciliation routes exist; scheduled reconciliation added. |
| refund recording | pass | Admin payments supports confirmed manual refund record and audit. |
| entitlement management | pass | Admin entitlements supports grant/revoke/extend with audit. |
| content editing | pass | Admin content-quality endpoint stores version/review decisions. |
| duplicate review | pass | Duplicate/conflict groups are exposed through admin content-quality API. |
| learner question report | pass | question-feedback route exists and is wired in app flow test. |
| audit log | pass | Admin audit log table/API and mutation logging exist. |
| support case | pass | Support case table/API exist. |
| export | pass | Admin export route exists and authz test covers it. |

## Commercial Consistency

- Active price: EUR 4.99
- Access duration: 90 days
- Pricing config active learner plan: full_study_pass
- Pricing consistency: pass
- Policy version recording: implemented through checkout metadata; final legal config blocked by 10 placeholder(s).
- Operator details present: blocked
- Support mailbox configured: blocked
- Custom domain canonical: blocked

## Release Checklist
### Environment

- Set all business identity/support/privacy/refund/security env vars.
- Set PUBLIC_SITE_URL and PUBLIC_CANONICAL_ORIGIN to the final HTTPS custom domain.
- Set DATABASE_URL to the intended Neon production database.
- Set STUDY_SESSION_SECRET and RATE_LIMIT_SALT to strong random values.
- Set EMAIL_FROM and EMAIL_PROVIDER_API_KEY only after email domain is verified.
- Set MONITORING_ENABLED and MONITORING_WEBHOOK_URL if monitoring is live.
- Set OPS_CRON_SECRET for Vercel Cron reconciliation.

### Migration

- Run npm run check:migrations.
- Run npm run db:migrate against a Neon preview branch.
- Run npm run db:migrate against production only inside the approved release window.
- Confirm schema_migrations has 0001 and 0002 with expected checksums.

### Stripe

- Create test and live Stripe prices for every enabled plan.
- Configure STRIPE_PRICE_ID_FULL, STRIPE_PRICE_ID_LAUNCH, STRIPE_PRICE_ID_INSTRUCTOR_10, STRIPE_PRICE_ID_INSTRUCTOR_25.
- Configure STRIPE_WEBHOOK_SECRET for /api/stripe-webhook.
- Run test-mode learner checkout, instructor checkout, webhook replay, refund, and dispute simulations.
- Confirm no live key is used in preview/local and no test key is used in production.

### Domain

- Connect custom domain in Vercel.
- Set PUBLIC_CANONICAL_ORIGIN.
- Rebuild and confirm sitemap/canonical URLs use the custom domain.
- Submit sitemap in Google Search Console.

### Manual Smoke

- Homepage loads.
- Free preview starts and answers reveal only after submission.
- Offline preview reload works after first load.
- Paywall and pricing show EUR 4.99 / 90 days.
- Restore access returns generic response.
- Unauthorized admin request rejects.
- Premium API rejects logged-out user.
- Stripe test checkout completes and webhook grants entitlement.
- Instructor code redemption grants access once.
- Account export and deletion request work.

### Rollback

- Use Vercel dashboard or CLI to promote the previous known-good deployment.
- Disable failing cron/webhook endpoint if it causes operational harm.
- If a migration caused the incident, follow docs/operations/rollback-runbook.md; do not manually edit production data without a snapshot.
- Run npm run smoke:postdeploy against the restored deployment.

## Official References
- Stripe webhooks: https://docs.stripe.com/webhooks
- Stripe Checkout: https://docs.stripe.com/payments/checkout
- GitHub Actions workflow syntax: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
- GitHub deployment environments: https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments
- Vercel Cron Jobs: https://vercel.com/docs/cron-jobs/manage-cron-jobs
- Neon backups: https://neon.com/docs/manage/backups
