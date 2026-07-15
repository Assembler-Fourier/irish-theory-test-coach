# Commercial Payment Operations

Irish Theory Test Coach uses Stripe Checkout, Neon Postgres, and server-side entitlements. The browser never controls price, access duration, or entitlement state.

## Environments

- Local development uses Stripe test keys, test prices, and a localhost `PUBLIC_SITE_URL`.
- Vercel preview uses Stripe test keys and test prices.
- Production uses Stripe live keys, live prices, a production `PUBLIC_SITE_URL`, and `STRIPE_WEBHOOK_SECRET`.

Runtime validation rejects live/test key-price mismatches when the price mode is explicit or inferable, rejects live Stripe secrets in local/preview, rejects a production site URL in local mode, and rejects missing webhook secrets in production.

## Checkout

Checkout requests may include only:

- plan key
- referral or instructor code
- anonymous analytics ID

The server resolves the Stripe price ID from pricing config and environment variables. The browser never sends or controls an amount.

Before redirecting to Stripe, `/api/create-checkout-session` creates a `checkout_attempts` row and passes that ID to Stripe as `client_reference_id` and metadata. Stripe Checkout creation uses an idempotency key based on that attempt ID.

## Fulfillment

The success URL does not grant access. `/api/verify-session` checks Stripe and then checks whether the webhook has already recorded a purchase and entitlement. If fulfillment is pending, the app shows a safe pending message.

Paid access is granted only by signed Stripe webhook events stored in `stripe_events`.

## Webhook Events

The webhook endpoint stores Stripe event IDs for idempotency and handles:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `refund.created`
- `refund.updated`
- `charge.refunded`
- `charge.dispute.created`
- `charge.dispute.updated`
- `charge.dispute.closed`
- `charge.dispute.funds_withdrawn`
- `charge.dispute.funds_reinstated`
- `payment_intent.payment_failed`

Duplicate events do not fulfill twice. Failed processing stores a safe failure reason and returns an error so Stripe can retry.

## Entitlement Rules

- New learner purchase: creates or activates a 90-day entitlement.
- Repeat learner purchase: extends from the later of current expiry or now.
- Expired learner purchase: starts a new 90-day window from now.
- Full successful refund: records refund and revokes access with reason `stripe_refund`.
- Partial refund: records refund but does not silently revoke access.
- Dispute or chargeback: records dispute and revokes access until manually reconciled.
- Instructor pack purchase: creates private one-use learner codes instead of granting learner access to the buyer.
- Manual entitlement: remains an admin action and must be audit logged.
- Complimentary access: should use a manual/admin source and must not be shortened by ordinary checkout processing.

## Instructor Packs

Paid `instructor_10` and `instructor_25` purchases create private learner codes in `instructor_codes`. Codes are not public. Admins can export them from:

```text
/api/admin/export?type=instructor-codes
```

Each redemption is locked in a database transaction, grants entitlement server-side, records `instructor_code_redemptions`, and prevents concurrent double redemption.

## Refund Reconciliation

Refunds can be handled by Stripe Dashboard plus admin reconciliation:

1. Create or inspect the refund in Stripe Dashboard.
2. In admin payment operations, record the amount, reason, Stripe object, and entitlement effect.
3. If access is revoked, the row records why.
4. Do not silently revoke access without a refund or dispute record.

## Test Cases

Automated tests cover environment separation and webhook idempotency:

```powershell
npm run test:payment
npm run test:webhook
```

Manual Stripe test-mode cases before production:

1. Complete a Full Study Pass checkout.
2. Confirm webhook stores the event and creates entitlement.
3. Refresh the success URL and confirm it does not create duplicate purchases.
4. Send duplicate webhook events from Stripe CLI.
5. Expire a Checkout session and confirm no entitlement.
6. Refund a payment and confirm refund/dispute state is represented.
7. Buy an instructor pack and confirm the correct number of private codes.
