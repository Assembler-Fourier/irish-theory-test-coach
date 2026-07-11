# Security Controls

## API Security

- `lib/security.js` applies common API headers, request correlation IDs, structured safe logging, Origin/Host verification, and generic verification failures.
- `lib/request-validation.js` provides shared JSON body validation, unknown-field rejection, unsafe-string rejection, enum/number/string checks, and bounded body reads.
- `lib/rate-limit.js` uses hashed request identifiers so raw IP addresses are not stored in rate-limit keys.
- State-changing endpoints reject cross-origin requests in production and do not mutate sensitive state through GET.
- Sensitive API responses use `Cache-Control: no-store`.

## Endpoint Coverage

Protected endpoints now include rate limits and/or bounded request bodies for:

- Login-link request and token consumption.
- Checkout creation.
- Referral lookup and code redemption.
- Analytics ingestion.
- Study-session creation, fetch, answer, flag, and complete.
- Protected media.
- AI explanations.
- Question reporting.
- Account deletion request.
- Logout and logout-all.
- Attempts and flags sync.
- Admin APIs through the catch-all router.

## Authentication And Sessions

- Passwordless tokens are hashed in storage, expire quickly, and are single-use.
- Sessions are stored as hashes, expire, and can be revoked individually or all-at-once.
- Cookies are HttpOnly, SameSite=Lax, and Secure in production/HTTPS.
- Login and restore responses avoid account enumeration.
- Magic links are not logged, even in local fallback mode.

## Authorization

- Premium study content requires server-side session and active entitlement checks.
- Admin endpoints call `requireAdmin()` server-side and enforce least-privilege role permissions.
- Admin route throttling and Origin/Host checks are applied centrally in `api/[...route].js`.
- Client-side role checks are treated as presentation only.

## Payment Security

- Stripe prices are configured server-side.
- Checkout attempts are recorded before redirect.
- Entitlements are granted through server-side Stripe/session/webhook validation, not browser flags.
- Webhook events use signature validation and event-ID idempotency.
- Instructor code redemption uses row locking to prevent concurrent double redemption.

## Headers

`vercel.json` configures:

- Content-Security-Policy.
- Strict-Transport-Security.
- `frame-ancestors 'none'`.
- X-Content-Type-Options.
- Referrer-Policy.
- Permissions-Policy.
- No-store cache policy for API, admin, and account surfaces.

`npm run check:headers` validates these controls.

## Logging

Structured logs include:

- Request/correlation ID.
- Route.
- Status.
- Duration.
- Safe actor identifier.
- Safe error code.

Logs must not include:

- Magic links.
- Login tokens.
- Session cookies.
- Full email addresses unless operationally necessary.
- Stripe secrets.
- Database URLs.
- Webhook secrets.
- Full payment payloads.

## Data Lifecycle

`npm run security:cleanup` is dry-run by default and reports affected rows. It requires `SECURITY_CLEANUP_APPLY=true` to apply configured retention actions.

Default retention controls:

- Expired login tokens: 30 days.
- Revoked sessions: 90 days.
- Expired sessions: 180 days.
- Anonymous analytics: 180 days.
- Processed webhook payload metadata redaction: 365 days.

Support cases, audit logs, account deletion requests, purchases, refunds, and disputes are not blindly deleted by the cleanup job.

## Database Controls Reviewed

- Login tokens, sessions, Stripe events, checkout attempts, purchases, refunds, instructor codes, referral codes, and audit records have unique constraints or indexes for the main lookup/idempotency paths.
- Stripe webhook replay is controlled by a unique `stripe_event_id` and event processing status.
- Instructor-code redemption uses a transaction and `for update` row lock before incrementing redemption counts.
- Session and login-token cleanup is retention-driven; deletion is not automatic without `SECURITY_CLEANUP_APPLY=true`.
- Cascades are limited to child operational rows where appropriate; user/payment/support/audit records are not blindly removed by cleanup tooling.
- Progress and account operations use parameterized SQL and idempotency keys where applicable.

## Dependency And Secret Controls

- Node is pinned with `.nvmrc`.
- `package-lock.json` is validated by `npm run check:lockfile`.
- Dependency audit is available with `npm run security:audit`.
- Secret scanning runs with `npm run check:secrets`.
- `.github/workflows/security.yml` runs lockfile validation, dependency audit, secret scan, security tests, and header checks.

## Update Policy

- Security updates should be reviewed weekly or whenever GitHub/npm advisory alerts fire.
- High or critical dependency advisories should be patched on a dedicated branch, verified with `npm run qa`, and deployed after review.
- Dependency changes must keep `package-lock.json` committed and must pass `npm run check:lockfile`.

## Operational Follow-Ups

- Move rate limits to a shared store before high traffic or active abuse.
- Remove inline script/style allowances from CSP after a frontend cleanup pass.
- Add MFA or stronger admin authentication when supported by the chosen account model.
- Schedule retention cleanup only after legal/commercial review approves retention periods.
