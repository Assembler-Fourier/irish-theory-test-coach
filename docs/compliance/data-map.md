# Data Map

Irish Theory Test Coach is an independent Category B theory-test practice app with static frontend files, serverless APIs, Neon Postgres, Stripe Checkout, passwordless email login, progress sync, protected premium content delivery, first-party analytics, admin operations, instructor codes, referrals, AI explanation fallback/caching, and support workflows.

Legal review is required before production launch. This document describes actual system behavior and does not fabricate legal conclusions.

## Data Subjects

- Public preview learners.
- Paid learners.
- Instructor-code purchasers and code recipients.
- Admin/operator users.
- Support requesters.
- Anonymous website visitors.

## Data Categories

| Data | Source | Purpose | Storage |
| --- | --- | --- | --- |
| Email address | Checkout, restore access, account, support, code redemption | Access restore, entitlement, support, exports, deletion requests | Neon Postgres |
| Session token hash | Magic-link login | Authenticated account access | Neon Postgres |
| Login token hash and delivery metadata | Restore-access flow | Single-use login link and abuse controls | Neon Postgres |
| Purchase and Stripe IDs | Stripe Checkout/webhooks | Entitlement, refund/dispute reconciliation, revenue reporting | Neon Postgres and Stripe |
| Accepted policy versions | Server-side checkout creation and Stripe metadata | Audit of policy set presented at checkout | `checkout_attempts.accepted_policy_versions`, `purchases.policy_versions` |
| Entitlement state | Stripe webhook, instructor code, admin grant | Premium access control | Neon Postgres |
| Attempts and flags | Learner app/API | Progress sync, missed questions, category accuracy | Neon Postgres and local storage queue |
| Mock results | Learner app/API | Recent mock history and progress | Neon Postgres |
| Analytics events | First-party `/api/events` | Funnel and learning behavior statistics | Neon Postgres |
| Question reports | Learner report action | Content correction workflow | Neon Postgres |
| Support cases | Account/admin support workflow | Support handling | Neon Postgres |
| Admin audit logs | Admin mutations | Sensitive-action audit trail | Neon Postgres |
| AI explanation cache | AI explain endpoint | Cost control and fast repeated explanations | Neon Postgres |

## Local Storage

The browser may store local preview progress, pending offline sync operations, anonymous analytics ID, and old purchase unlock fallback state. Premium access is still verified server-side.

## Cookies

The app uses an HttpOnly SameSite session cookie for authenticated account access. Secure cookies are used in production/HTTPS.

## User Rights Workflows

- Export: `/account` calls the account export API.
- Deletion request: `/account` records a deletion/support request; it is not an instant destructive delete.
- Correction request: answer feedback includes “Report a problem”.
- Support request: public contact/support email and admin support cases.

## Open Legal Review Items

- Final controller identity.
- Lawful basis wording.
- Complaint route.
- International transfer basis.
- Liability/dispute wording.
- Production retention periods for support, audit, payments, and account deletion records.
