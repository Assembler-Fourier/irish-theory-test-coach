# Payment Reconciliation

Reconciliation detects mismatches. It does not silently grant, revoke, refund, or delete access.

## Automated Checks

Run manually:

```powershell
npm run ops:reconcile -- --allow-findings --json
```

Scheduled:

- GitHub Actions: `.github/workflows/operations-reconciliation.yml`
- Vercel Cron: `/api/ops/reconcile`

The Vercel endpoint requires `Authorization: Bearer $OPS_CRON_SECRET` or `CRON_SECRET`.

## Findings Detected

- Paid Stripe checkout sessions missing purchase records.
- Purchases missing active entitlements.
- Expired entitlements still marked active.
- Refunds/disputes that should revoke access while entitlement remains active.
- Used instructor codes without redemption records.
- Failed Stripe webhook events.
- Orphaned sessions.
- Stale login tokens.

## Owner Actions

1. Review findings in `reconciliation_findings`.
2. Check Stripe Dashboard for the related session/payment/refund/dispute.
3. Replay failed Stripe webhook events from admin payment operations when safe.
4. Record manual refund or entitlement decision through admin tools.
5. Re-run reconciliation.
6. Close the support case or incident note.

## Safe Handling Rules

- Do not grant access because of a return URL alone.
- Do not revoke access without a recorded reason.
- Do not expose card data, secrets, raw Stripe payloads, or full email addresses in reports.
- Refund workflow must record amount, reason, actor, Stripe object, entitlement effect, and timestamp.

## References

- Vercel Cron Jobs: https://vercel.com/docs/cron-jobs/manage-cron-jobs
- Stripe webhooks: https://docs.stripe.com/webhooks
- Stripe Checkout: https://docs.stripe.com/payments/checkout
