# Incident Runbook

## Severity Levels

### SEV-1 Payment/access outage

Examples: Stripe checkout unavailable, webhook fulfillment broken, paid users cannot access premium content, database unavailable.

Owner actions:

- Freeze production deploys.
- Check Vercel deployment status, `/api/health`, `/api/ready`, Stripe webhook health, and Neon status.
- Run `npm run ops:reconcile -- --allow-findings --json`.
- Start user support message if outage lasts more than 15 minutes.
- Open a post-incident note with timeline, customer impact, root cause, fix, prevention.

### SEV-2 Login or mock failure

Examples: magic-link delivery failing, sessions broken, mock start/complete failing.

Owner actions:

- Check email provider configuration and logs.
- Check API errors and rate-limit events.
- Confirm preview mode still works.
- Prepare support workaround for paid learners.

### SEV-3 Degraded analytics/content issue

Examples: analytics ingestion broken, SEO metadata stale, content QA report unexpected, generated images missing.

Owner actions:

- Confirm user learning/payment flows are safe.
- Fix through normal PR unless it affects checkout/access.
- Avoid making statistical or content-quality claims until corrected.

### SEV-4 Minor UI defect

Examples: small spacing, copy, visual polish issue with no access/payment impact.

Owner actions:

- Track in normal backlog.
- Batch with UI polish PR.

## Monitoring Hooks

The app emits sanitized `operational_event` logs and can forward to `MONITORING_WEBHOOK_URL` when `MONITORING_ENABLED=true`.

Event categories include:

- `api_error`
- `webhook_signature_failure`
- `webhook_processing_failure`
- `email_delivery_failure`
- `database_connection_failure`
- `rate_limit_triggered`
- `checkout_failure`
- `reconciliation_findings_detected`
- `reconciliation_job_failure`

Do not log secrets, magic links, raw session cookies, database URLs, webhook secrets, or full payment payloads.

## User Communication Templates

Payment/access:

> We are checking a payment/access issue. Your payment details are handled by Stripe; do not send card information. Send only the checkout email and approximate purchase time.

Login:

> We are investigating restore-access email delivery. Your existing progress and entitlement remain server-side. We will update you when login links are healthy again.

Mock/learning:

> Practice access is partially degraded. Payments and account access are not affected. We are working on a fix and recommend using revise mode while mock mode is checked.
