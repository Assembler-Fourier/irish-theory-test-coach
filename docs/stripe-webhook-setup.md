# Stripe Webhook Setup

Use this webhook so paid access is recorded even when a buyer closes the browser before returning to the success page. The browser success URL must not be treated as fulfillment.

## Endpoint

Production endpoint path:

```text
/api/stripe-webhook
```

For Vercel production, use the full production URL:

```text
https://your-domain.example/api/stripe-webhook
```

## Create The Webhook In Stripe

1. Open the Stripe Dashboard.
2. Go to Developers -> Webhooks.
3. Select Add endpoint.
4. Enter the production endpoint URL ending in `/api/stripe-webhook`.
5. Select these events:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
refund.created
refund.updated
charge.refunded
charge.dispute.created
charge.dispute.updated
charge.dispute.closed
charge.dispute.funds_withdrawn
charge.dispute.funds_reinstated
payment_intent.payment_failed
```

6. Save the endpoint.
7. Reveal the signing secret for the endpoint.
8. Store the signing secret as a Vercel environment variable named `STRIPE_WEBHOOK_SECRET`.

Do not put the signing secret in frontend code, static files, screenshots, docs, or commits.

## Required Vercel Environment Variables

Production must have:

```text
STRIPE_SECRET_KEY
STRIPE_PRICE_ID_FULL
STRIPE_PRICE_ID_LAUNCH
STRIPE_PRICE_ID_INSTRUCTOR_10
STRIPE_PRICE_ID_INSTRUCTOR_25
STRIPE_WEBHOOK_SECRET
DATABASE_URL
PUBLIC_SITE_URL
SUPPORT_EMAIL
PAYMENT_ENVIRONMENT
STRIPE_PRICE_MODE
```

After adding or changing environment variables, redeploy production.

## Database Migration

Run the schema migration before enabling the production webhook:

```powershell
npm run db:migrate
```

The schema adds checkout attempts, stored Stripe events, payment refunds, payment disputes, and instructor-code inventory. It also adds purchase metadata so webhook retries update the same purchase.

## Test Procedure

1. Run the local mock handler test:

```powershell
npm run test:webhook
```

2. Deploy to Vercel after checks pass.
3. In Stripe Dashboard -> Developers -> Webhooks, open the endpoint.
4. Send test `checkout.session.completed`, `checkout.session.expired`, and duplicate webhook events.
5. Confirm the webhook response is `2xx`.
6. Make one real low-value checkout test only when you intentionally want to test live mode.
7. Confirm Neon has:
   - one `users` row for the checkout email
   - one `purchases` row for the Stripe Checkout session
   - one active `entitlements` row for `irish-theory-test-coach`
   - one processed `stripe_events` row per Stripe event ID

The checkout success-page verifier only reads fulfillment status. It does not grant entitlement by itself.
