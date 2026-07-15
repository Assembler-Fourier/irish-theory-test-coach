# Retention Schedule

This schedule documents configured technical defaults. Legal review is required before scheduling destructive cleanup in production.

| Record Type | Default Retention | Current Automation |
| --- | --- | --- |
| Login tokens | 30 days after expiry | `npm run security:cleanup` dry-run; deletes only with `SECURITY_CLEANUP_APPLY=true` |
| Revoked sessions | 90 days after revocation | Cleanup dry-run/apply |
| Expired sessions | 180 days after expiry | Cleanup dry-run/apply |
| Anonymous analytics | 180 days | Cleanup dry-run/apply |
| Processed webhook payload metadata | 365 days before payload redaction | Cleanup dry-run/apply redacts payload metadata |
| Purchases, refunds, disputes, and entitlements | Generally six years after the relevant accounting period, subject to tax, legal, chargeback, and claim requirements | No blind deletion |
| Support cases | While open and generally 24 months after closure; longer for an active dispute or legal/security need | No blind deletion |
| Admin audit logs | Generally 24 months; longer for an active investigation | No blind deletion |
| Account deletion requests | Generally 24 months after resolution as handling evidence | No blind deletion |
| Local storage | Browser/device controlled | Learner can clear browser storage |
| Optional analytics browser storage | Until consent is rejected, storage is cleared, or the data is replaced | Removed immediately on a recorded rejection where storage is accessible |

## Cleanup Command

```powershell
npm run security:cleanup
```

This is dry-run by default. To apply configured cleanup:

```powershell
$env:SECURITY_CLEANUP_APPLY = "true"
npm run security:cleanup
```

Do not enable scheduled cleanup until legal/operational review approves the final periods.
