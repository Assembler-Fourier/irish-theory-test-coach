# Security Red-Team Report

Generated: 2026-07-15T13:08:40.323Z

NO-GO

## Attack Matrix
| Attack | Status | Evidence |
| --- | --- | --- |
| download complete public question bank | pass | Public data JSON files: public/data/preview-questions.json. Preview exposes 15 questions. |
| access premium API logged out | pass | test-content-security verifies logged-out users cannot access premium questions. |
| forge entitlement | pass | Premium access requires server session + entitlement; client localStorage is fallback-only for legacy UI, not premium API. |
| alter price | pass | Checkout plan resolves server-side Stripe price ID; browser never submits amount. |
| replay webhook | pass | Webhook event store idempotency and duplicate mock tests pass. |
| reuse login token | pass | Auth tests cover consumed token and consumeLoginToken locks token row. |
| brute-force login requests | pass | Request-login and consume-login endpoints use IP/email/token scoped rate limits. |
| spam analytics | pass | Events endpoint has validation, allowlist and rate limiting; oversized body test passes. |
| redeem code concurrently | partial | Instructor code redemption uses SELECT FOR UPDATE; needs staging concurrency test with real database. |
| IDOR | pass | Admin endpoints require server-side roles; study sessions signed and tied to entitlement/email. |
| CSRF | pass | State-changing routes verify Origin/Host; security tests include origin bypass checks. |
| XSS | pass | Request validators reject unsafe strings; security tests cover stored/reflected XSS probes. |
| SQL injection | pass | APIs use parameterized queries; security tests cover injection attempts. |
| oversized request | pass | Catch-all and body readers enforce size limits; tests cover 413. |
| cache leakage | pass | API default Cache-Control is no-store; protected media is short private cache. |
| inspect source maps | pass | No public .map files found. |
| inspect public assets for secrets or answer keys | pass | No obvious public secret patterns; preview package has no answer-key fields. |

## Security Blockers
### P1-PAY-001: Stripe test-mode checkout, webhook, entitlement, instructor, refund, dispute, and reconciliation evidence is incomplete or invalid.

- Severity: P1
- Evidence: generatedAt must be an ISO timestamp. commit must be a full 40-character Git SHA. Evidence commit does not match the audited Git commit. Evidence branch does not match the audited branch. vercelDeploymentId must be a Vercel deployment ID. The audit must provide the expected Vercel deployment ID. tests.fullStudyPassCheckout is missing. tests.instructor10Checkout is missing. tests.instructor25Checkout is missing. tests.webhookEntitlement is missing. tests.duplicateWebhook is missing. tests.repeatPurchaseExtension is missing. tests.checkoutCancellation is missing. tests.declinedPayment is missing. tests.partialRefund is missing. tests.fullRefund is missing. tests.disputeOpen is missing. tests.disputeWonClosed is missing. tests.instructorCodeGeneration is missing. tests.instructorCodeRedemption is missing. tests.malformedWebhookSignature is missing. tests.validWebhookResponse is missing. tests.reconciliation is missing.
- Affected files/routes: server/api/create-checkout-session.js, server/api/stripe-webhook.js, server/api/admin/payments.js, lib/instructor-codes.js, /api/create-checkout-session, /api/stripe-webhook
- Reproduction: Set PAYMENT_EVIDENCE_DEPLOYMENT_ID to the audited preview deployment, then run npm run audit:final and inspect the validation errors for reports/final/payment-test-evidence.json.
- Required fix: Run the complete deployed Preview Stripe sandbox matrix and generate schema-valid, fresh, redacted evidence for the exact audited commit and deployment with zero unresolved reconciliation findings.
- Owner: Payments / operations
- Retest requirement: Run npm run qa, Stripe CLI/dashboard webhook replay, admin payment reconciliation, and update reports/final/payment-test-matrix.md with real test session IDs redacted.

## Notes

- Public data exposure checks found only the generated preview data package in `public/data/`.
- Stripe webhook signature verification and event idempotency are implemented and covered by mock tests.
- The full real Stripe/Neon operational path is still a blocker until run in test mode.

## Official References
- Stripe webhooks: https://docs.stripe.com/webhooks
- Stripe Checkout: https://docs.stripe.com/payments/checkout
