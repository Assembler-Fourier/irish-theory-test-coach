# Legal Review Checklist

Codex-generated policy text is a technical draft based on current system behavior. It is not lawyer-approved text.

## Commercial Identity

- Legal trading name configured.
- Operator type configured.
- Registered address configured.
- Business registration number configured or marked not applicable.
- VAT number configured or marked not applicable.
- Governing jurisdiction configured.
- Support, privacy, refund, and security emails route to monitored inboxes.

## Privacy Notice

- Controller identity approved.
- Lawful basis wording approved.
- Processor list and DPAs confirmed.
- Storage locations confirmed.
- International-transfer basis approved.
- Retention periods approved.
- Complaint route approved.
- Account export and deletion request wording approved.
- Analytics and local storage wording approved.

## Terms

- Product identity approved.
- Access duration and renewal/extension behavior approved.
- Payment wording approved.
- Account security and acceptable-use wording approved.
- Suspension wording approved.
- IP ownership wording approved.
- Limitation of liability wording replaced with reviewed text.
- Dispute/jurisdiction wording replaced with reviewed text.

## Refunds

- Refund scenarios match actual Stripe/admin workflow.
- No instant refund promise unless automation exists.
- No pass-outcome refund promise.
- Entitlement effects after refund/dispute are approved.

## Accessibility

- WCAG target approved.
- Known limitations reviewed.
- Contact route monitored.
- Last test date updated after launch QA.

## Content Methodology

- Independent status clear.
- No official RSA/Prometric affiliation.
- No guaranteed-pass claims.
- No official-frequency claims.
- AI draft workflow clear.
- Correction/report workflow clear.

## Launch Gate

Production builds fail when mandatory commercial identity fields remain placeholders. If a production launch still shows a launch blocker, do not deploy.
