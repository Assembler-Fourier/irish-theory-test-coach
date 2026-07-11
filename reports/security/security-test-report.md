# Security Test Report

Generated for PASS 8 security hardening.

## Scope

This report covers automated and source-level checks added for:

- SQL injection attempts.
- Stored/reflected XSS payloads.
- CSRF and Origin/Host bypass.
- IDOR and role bypass.
- Rate-limit behavior and hashed identifiers.
- Session replay and expired entitlement states.
- Duplicate instructor-code redemption concurrency.
- Stripe webhook replay idempotency.
- Large request bodies and malformed JSON.
- Sensitive response cache leakage.
- Security headers.
- Secret scanning and dependency policy.

## Automated Checks

- `npm run test:security`
  - Validates request schemas, oversized JSON, malformed JSON, unsafe strings, impossible values, origin rejection, secure cookies, hashed rate-limit keys, checkout CSRF blocking, admin CSRF blocking, role bypass rejection, consumed login token behavior, expired entitlement behavior, instructor-code row locking, and Stripe webhook idempotency SQL.
- `npm run check:headers`
  - Validates CSP, HSTS, frame blocking, no-sniff, referrer policy, permissions policy, and no-store cache headers for sensitive routes.
- `npm run check:secrets`
  - Scans source files for obvious live secret patterns without printing matched values.
- `npm run check:lockfile`
  - Confirms `package-lock.json` is present, modern, and aligned with declared dependencies.
- `npm run security:audit`
  - Runs npm dependency audit at high severity.

## Control Mapping

| Threat | Control | Test/Check |
| --- | --- | --- |
| SQL injection | Parameterized SQL and schema validation | `test-security-hardening.mjs`, existing API tests |
| XSS payload input | Unsafe string rejection and bounded text cleaning | `test-security-hardening.mjs` |
| CSRF | Origin/Host verification for unsafe methods | `test-security-hardening.mjs` |
| IDOR/role bypass | Server-side `requireAdmin()` permissions | `test-admin-authz.mjs`, `test-security-hardening.mjs` |
| Rate-limit bypass | Hashed per-client keys and endpoint limits | `test-security-hardening.mjs` |
| Session replay | Single-use login-token states and revocation model | `test-account-auth.mjs`, `test-security-hardening.mjs` |
| Expired entitlement | Server-side access classification | `test-account-auth.mjs`, `test-security-hardening.mjs` |
| Duplicate code redemption | `for update` row lock and atomic count increment | `test-security-hardening.mjs` |
| Webhook replay | `stripe_event_id` idempotency and replay count | `test-security-hardening.mjs`, `test-stripe-webhook-mock.mjs` |
| Large bodies/malformed JSON | Shared `readJsonBody` caps and errors | `test-security-hardening.mjs` |
| Cache leakage | No-store sensitive responses | `check-security-headers.mjs`, API header helper tests |

## Command Outcomes

- `node --check` on changed JavaScript files: passed.
- `npm run validate`: passed. Dataset validation reported 1,277 questions, 159 enriched high-yield questions, and no dataset validation failures.
- `npm run build`: passed. Build generated SEO/IA pages, preview public data with 15 questions, and product runtime summary with 1,277 questions, 159 priority questions, and 671 sign/image questions.
- `npm run check:headers`: passed.
- `npm run check:lockfile`: passed.
- `npm run check:secrets`: passed with no obvious live secrets found in scanned project files.
- `npm run security:audit`: passed with 0 vulnerabilities at high audit level.
- `npm run test:security`: passed.
- `npm run qa`: passed. Full QA included validate, build, content quality reports, stale-build check, PWA, SEO, performance, source register, security headers, lockfile, secrets, app/API/content/account/payment/security/admin/webhook/e2e/a11y/visual tests.

Visual QA captured 15 deterministic screenshots under `reports/ui/pass4/`.

## Remaining Risk

- In-memory rate limiting is appropriate for MVP abuse resistance but should be replaced with a shared store for serious production traffic.
- CSP still permits inline scripts and styles until the static frontend is refactored to nonce/hash-compatible assets.
- Retention cleanup requires explicit operator approval before scheduled production deletion/redaction.
