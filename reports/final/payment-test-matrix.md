# Payment Test Matrix

Generated: 2026-07-15T13:08:40.323Z

NO-GO

## Plans
| Plan | Label | Price | Enabled | Access Days | Real Stripe Test Status |
| --- | --- | --- | --- | --- | --- |
| launch_offer | Launch offer | EUR 2.99 | false | 90 | blocked |
| full_study_pass | Full Study Pass | EUR 4.99 | true | 90 | blocked |
| instructor_10 | Instructor pack - 10 codes | EUR 29.00 | true | 90 | blocked |
| instructor_25 | Instructor pack - 25 codes | EUR 69.00 | true | 90 | blocked |

## Payment Checks
| Check | Status | Evidence |
| --- | --- | --- |
| server-authoritative price | pass | resolveCheckoutPlan reads Stripe price IDs from env; create-checkout-session sends line_items[0][price]. |
| checkout attempt before redirect | pass | createCheckoutAttempt runs before Stripe session creation. |
| webhook signature verification | pass | verifyStripeSignature validates timestamp/HMAC and test:webhook passes. |
| event idempotency | pass | beginStripeEventProcessing and webhook mock test cover duplicate events. |
| return URL entitlement grant | pass | Entitlement is not granted solely by browser return URL; webhook/session verification handles access. |
| refund/dispute representation | pass | Stripe webhook and admin payment endpoints record refund/dispute state and entitlement effects. |
| real learner checkout | blocked | Valid deployment-bound Stripe test evidence is required. |
| real instructor checkout | blocked | Valid deployment-bound Stripe test evidence is required. |
| webhook entitlement | blocked | Evidence is missing or invalid. |
| duplicate webhook | blocked | Evidence is missing or invalid. |
| repeat purchase extension | blocked | Evidence is missing or invalid. |
| partial/full refunds | blocked | Evidence is missing or invalid. |
| dispute revoke/restore | blocked | Evidence is missing or invalid. |
| reconciliation | blocked | Evidence is missing or invalid. |

## Required Real Test-Mode Matrix Before GO

- Full Study Pass checkout completes with Stripe test card and creates purchase + entitlement by webhook.
- Launch offer checkout works if `LAUNCH_OFFER_ENABLED=true`.
- Instructor 10-code and 25-code checkout generate exact code inventory.
- Webhook duplicate replay remains idempotent.
- Refund/dispute events update payment state and entitlement effect as expected.
- Admin reconciliation reports no paid sessions missing purchases or purchases missing entitlements.

## Official References
- Stripe webhooks: https://docs.stripe.com/webhooks
- Stripe Checkout: https://docs.stripe.com/payments/checkout
