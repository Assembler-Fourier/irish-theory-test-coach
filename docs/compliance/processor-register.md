# Processor Register

This register mirrors the runtime business configuration in `shared/business-config.js`. Values must be reviewed and configured through environment variables before production launch.

| Processor | Purpose | Data Categories | Configuration Notes |
| --- | --- | --- | --- |
| Vercel | Hosting, serverless functions, deployment logs, static asset delivery | Request metadata, technical logs, website content | Deployment region and project settings must be confirmed. |
| Neon | Postgres database | Email, sessions, entitlements, progress, support, analytics, audit logs | Database region and access controls must be confirmed. |
| Stripe | Checkout, payments, refunds, disputes, webhooks | Checkout email, Stripe IDs, payment status, policy metadata | Live/test separation and webhook secret must be configured. |
| Email provider | Magic links and transactional email | Email, delivery status | Only active when `EMAIL_PROVIDER_API_KEY` and `EMAIL_FROM` are configured. |
| AI provider | Optional explanation generation and admin draft generation | Supplied question/answer context | Only active when AI provider env vars are configured. |

## Required Production Checks

- Confirm processor legal names and DPAs.
- Confirm storage locations and transfer basis.
- Confirm whether AI provider receives personal data; current prompts should avoid unnecessary learner identity.
- Confirm Stripe mode, webhook endpoint, and refund workflow.
- Confirm support email and privacy email routing.
- Confirm optional analytics remains consent-gated and that processor contracts cover the event data actually sent.
- Retain provider assurance reports as vendor evidence only; do not present them as Irish Theory Test Coach SOC 2 certification.

## Configuration Variables

- `PROCESSOR_LIST` may override the generated list with JSON.
- `PROCESSOR_VERCEL_LOCATION`
- `PROCESSOR_NEON_LOCATION`
- `PROCESSOR_STRIPE_LOCATION`
- `EMAIL_PROVIDER_NAME`
- `EMAIL_PROVIDER_LOCATION`
- `AI_PROVIDER_NAME`
- `AI_PROVIDER_LOCATION`
