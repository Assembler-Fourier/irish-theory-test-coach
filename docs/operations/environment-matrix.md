# Environment Matrix

## Local

- Branch: a short-lived `feature/*`, `fix/*`, or `chore/*` development branch.
- Database: local or Neon preview branch.
- Stripe: test key and test price IDs only.
- Site URL: localhost.
- Email: may be unconfigured; magic links are not logged in production.
- Monitoring: disabled by default.
- Deploy: none.

Required checks:

```powershell
npm run validate
npm run build
npm run qa
```

## Preview

- Branch: pull request branch.
- Database: Neon preview branch or isolated test database.
- Stripe: test mode only.
- Site URL: Vercel preview URL.
- Monitoring: optional test webhook.
- Deploy: Vercel preview.

Required checks:

- Pull request reliability checks.
- Security checks.
- Optional manual smoke against preview URL.

## Production

- Branch: protected `main`.
- Database: Neon production branch.
- Stripe: live secret and live price IDs only.
- Site URL: `https://irishtheorycoach.ie` via `PUBLIC_CANONICAL_ORIGIN` and `PUBLIC_SITE_URL`.
- Monitoring: enabled.
- Deploy: GitHub manual workflow dispatch into `production` environment.

Required checks:

- `npm run qa`
- Versioned `public/release-manifest.json`
- Manual production approval
- Post-deploy smoke
- Payment/access reconciliation

## Required Production Environment Variables

- `DATABASE_URL`
- `PUBLIC_SITE_URL`
- `PUBLIC_CANONICAL_ORIGIN`
- `PUBLIC_OPERATOR_LOCATION` (coarse public location only; do not publish a residential address)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_MODE`
- `STRIPE_PRICE_ID_FULL`
- `STRIPE_PRICE_ID_LAUNCH` when launch offer is enabled
- `STRIPE_PRICE_ID_INSTRUCTOR_10`
- `STRIPE_PRICE_ID_INSTRUCTOR_25`
- `OPS_CRON_SECRET`
- `RATE_LIMIT_SALT`
- `MONITORING_ENABLED`
- `MONITORING_WEBHOOK_URL` if external monitoring is used

The private `REGISTERED_ADDRESS` value may be required for business/legal operations, but it is deliberately excluded from generated public runtime JSON and pages. Confirm a suitable non-residential service address and the disclosure requirements with a qualified adviser before paid launch.

## Hard Rules

- Do not mix live Stripe secrets with test price IDs.
- Do not use production site URL in local mode.
- Do not expose secrets in frontend files.
- Do not deploy production from a laptop.
- Do not enable scheduled operations until the production environment provides the required secrets and a successful manual reconciliation has been recorded.
