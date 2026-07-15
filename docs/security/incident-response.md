# Incident Response Runbook

## Severity Levels

- **SEV-1:** confirmed payment, entitlement, admin, database, or secret compromise; active abuse affecting learners; public data exposure.
- **SEV-2:** suspected abuse, elevated error rate, webhook processing failures, checkout failures, or admin action mistakes.
- **SEV-3:** isolated suspicious activity, spam, non-sensitive bug, or documentation gap.

## First 30 Minutes

1. Preserve evidence: deployment ID, commit hash, timestamps, affected route, request IDs, Stripe event IDs, and admin audit entries.
2. Stop active harm:
   - Disable affected env key or rotate it if compromised.
   - Revoke affected sessions.
   - Disable affected referral/instructor codes.
   - Temporarily disable risky feature flags if available.
3. Do not paste secrets, tokens, full payment payloads, or database URLs into chat, issues, screenshots, or reports.
4. Check Vercel function logs, Stripe events, Neon connection/activity logs, and admin audit logs.
5. Assign one owner to coordinate updates and one person to preserve technical evidence.

## Investigation Checklist

- Identify affected users, purchases, entitlements, sessions, content records, and admin actions.
- Check whether the incident involves personal data, payment data, content access, or admin privilege.
- Verify whether webhook replay/idempotency behaved correctly.
- Review structured logs by request ID and safe actor identifier.
- Confirm whether rate limits, origin checks, and validation blocked or allowed the event.
- Review recent commits and deployments.

## Containment Actions

- Rotate exposed secrets using `docs/security/secret-rotation.md`.
- Revoke sessions for affected users or all sessions if admin compromise is suspected.
- Revoke/expire abused instructor or referral codes.
- Disable an abused endpoint at Vercel routing/firewall level if necessary.
- Apply a hotfix branch; do not edit production manually without source control.

## Recovery Actions

- Redeploy from a reviewed commit.
- Replay or reconcile failed Stripe webhook events from stored event IDs.
- Restore entitlements only from server-side payment/account records.
- Notify affected learners if required by legal review.
- Add a regression test for the incident class before closing.

## Post-Incident Review

Document:

- Timeline.
- Root cause.
- Affected data and users.
- Controls that worked.
- Controls that failed.
- Code/config changes made.
- Tests added.
- Follow-up owners and deadlines.

Store the review in `reports/security/` and keep secrets out of it.
