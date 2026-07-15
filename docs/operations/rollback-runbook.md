# Rollback Runbook

Rollback goal: restore learner access and checkout safety quickly without hiding audit evidence.

## When To Roll Back

- SEV-1 payment/access outage.
- Broken production deployment affecting checkout, restore access, or premium entitlement checks.
- Database migration causing production read/write errors.
- Severe SEO/static deployment corruption.

## Vercel Rollback

1. Stop new manual deployments.
2. Identify the last known good deployment in Vercel.
3. Prefer `vercel rollback <deployment-url-or-id>` or Vercel dashboard rollback.
4. Run post-deploy smoke checks against the restored URL.
5. Check `/api/health`, `/api/ready`, and Stripe webhook delivery.
6. Record the rollback in an incident note.

## Database Rollback

Database rollback must be deliberate. Do not run destructive SQL from memory.

1. If a migration failed before commit, rerun `npm run db:migrate` after fixing the migration.
2. If data was changed incorrectly, create a Neon branch or backup preview first.
3. Use a reviewed corrective migration rather than editing rows directly where practical.
4. If full restore is needed, follow `docs/operations/backup-restore.md`.
5. Re-run `npm run ops:reconcile -- --allow-findings --json`.

## Stripe Rollback

Stripe state cannot be rolled back by redeploying code.

- Do not delete Stripe events.
- Replay failed webhook events from admin payment operations.
- Use Stripe Dashboard for refunds/disputes and record the operational decision.
- Run reconciliation after any payment-state correction.

## User Communication

Template:

> We are investigating an access issue with Irish Theory Test Coach. Payments and account access are being checked through our server records. If you paid and cannot access the product, contact support with your checkout email. We will restore access or refund where appropriate.

## References

- Vercel deployments and rollback tooling: https://vercel.com/docs/deployments
- Stripe webhooks: https://docs.stripe.com/webhooks
