# Retention Schedule

This schedule documents configured technical defaults. Legal review is required before scheduling destructive cleanup in production.

| Record Type | Default Retention | Current Automation |
| --- | --- | --- |
| Login tokens | 30 days after expiry | `npm run security:cleanup` dry-run; deletes only with `SECURITY_CLEANUP_APPLY=true` |
| Revoked sessions | 90 days after revocation | Cleanup dry-run/apply |
| Expired sessions | 180 days after expiry | Cleanup dry-run/apply |
| Anonymous analytics | 180 days | Cleanup dry-run/apply |
| Processed webhook payload metadata | 365 days before payload redaction | Cleanup dry-run/apply redacts payload metadata |
| Purchases and entitlements | Operational payment/access record | No blind deletion |
| Refunds and disputes | Operational payment/access record | No blind deletion |
| Support cases | Until resolved plus reviewed operational period | No blind deletion |
| Admin audit logs | Security and operational audit trail | No blind deletion |
| Account deletion requests | Request and resolution record | No blind deletion |
| Local storage | Browser/device controlled | Learner can clear browser storage |

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
