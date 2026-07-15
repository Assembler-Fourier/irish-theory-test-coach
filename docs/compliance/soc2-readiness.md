# SOC 2 Readiness

Irish Theory Test Coach is **not SOC 2 certified, SOC 2 compliant, or independently audited against SOC 2**. This document is an internal readiness map, not an assurance report, certification, seal, or customer claim.

SOC 2 reporting requires an examination by an independent licensed CPA firm against a defined system description and the applicable Trust Services Criteria. Vercel, Neon, Stripe, or another processor may have its own assurance reports; those reports do not certify this product.

## Existing Control Foundations

- Server-side authentication, roles, entitlement checks, and price selection.
- Secure session cookies, single-use login links, session revocation, origin checks, and rate limits.
- Stripe webhook signature validation, idempotency, dispute/refund handling, and reconciliation.
- Structured redacted logs, request correlation IDs, admin audit records, and incident runbooks.
- Secret scanning, dependency checks, controlled migrations, release checks, rollback, and backup/restore documentation.
- Privacy choices, data-rights workflows, retention configuration, and processor register.

## Readiness Gaps

- Define the exact system boundary, services, people, data, vendors, and control owners.
- Complete a formal risk assessment and control-to-evidence matrix.
- Operate controls consistently for the chosen observation period and retain dated evidence.
- Complete vendor due diligence, access reviews, change reviews, incident exercises, and restoration evidence on schedule.
- Approve HR, acceptable-use, access, change, security, business-continuity, and vendor-management policies appropriate to the organization.
- Commission an independent readiness assessment, remediate findings, and engage a qualified CPA firm if a SOC 2 report is commercially justified.

## Evidence Rules

- Evidence must come from actual operations, not reconstructed screenshots or fabricated records.
- Provider reports are retained as vendor evidence and scoped accurately.
- Public copy must continue to say there is no SOC 2 certification until an applicable final report exists.
- Report type, scope, period, exceptions, and distribution restrictions must be reviewed before any future claim.

## Practical Decision

For this low-cost learner product, prioritize GDPR/consumer-law operations, payment security, access control, incident response, backups, and verifiable release discipline. Pursue SOC 2 only when customers, contracts, risk, and budget justify the independent audit cost and ongoing evidence burden.
