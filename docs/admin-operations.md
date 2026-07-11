# Admin Operations

Irish Theory Test Coach uses a protected admin workspace at `/admin.html`.

The workspace is for operating the business, not for learner study. It keeps the public product wording independent and avoids official RSA, Prometric, guaranteed-pass, or official-frequency claims.

## Roles

- `owner`: full access to every admin operation.
- `admin`: can manage users, entitlements, payments, instructor operations, content, support, analytics, and audit views.
- `content_editor`: can inspect and manage content quality, generated drafts, question reviews, and learning analytics.
- `support`: can inspect users, create support/account requests, revoke sessions, and manage support cases.
- `user`: no admin access.

Only `owner` and `admin` should manage payments, entitlements, instructor-code inventory, refunds, disputes, and referral/instructor pricing operations.

## Workspace Sections

- Overview: users, active/expired entitlements, purchases, revenue, refunds, net recorded revenue, preview starts, checkout starts, completed purchases, restore success, mock starts/completions, and operational warnings for a date range.
- Users: masked user list, user detail, entitlement history, purchase history, sessions, progress summary, support notes, account export requests, deletion requests, session revocation, and manual access changes.
- Purchases and payment operations: Stripe IDs, checkout attempts, webhook events, refunds, disputes, instructor codes, CSV exports, and reconciliation warnings.
- Instructor operations: instructor accounts, pack purchases, code inventory, redemptions, expiry, revocation, and performance summary.
- Content operations: question search, category/review/status filters, duplicate and conflicting-answer groups, learner problem reports, version history, edit preview, publish/archive, and category-mapping workflow.
- Analytics: funnel, mode usage, category accuracy, question miss rate, question-report frequency, mock completion, conversion source, referral performance, device class, and content-version signals. Small samples are directional only.
- Support: lightweight support cases with requester, category, purchase link, status, priority, assigned admin, notes, resolution, and timestamps.
- Audit log: sensitive actions record admin, action, target, before state, after state, reason, timestamp, and request correlation ID.

## Sensitive Actions

The UI asks for confirmation for destructive actions such as revoking sessions, revoking entitlements, archiving content, revoking instructor codes, and replaying payment events. The server also enforces authorization and required confirmations; hiding a button is never the access-control boundary.

Every sensitive mutation must write an `admin_audit_log` row with a reason and correlation ID.

## Production Steps

1. Run `database/schema.sql` or the idempotent migration workflow against Neon.
2. Promote the first operator by setting `users.role` to `owner` or `admin` in Neon.
3. Confirm Vercel production env vars are present and secrets are not committed.
4. Log in by magic link and open `/admin.html`.
5. Verify Overview, Users, Payments, Instructors, Content, Support, and Audit load according to role permissions.
6. Run a Stripe test purchase in the correct environment before relying on live entitlement operations.

## Testing

`npm run test` includes `scripts/test-admin-authz.mjs`, which verifies each admin endpoint rejects logged-out users, rejects non-admin roles, and accepts the least privileged correct role through a server-side authorization path.
