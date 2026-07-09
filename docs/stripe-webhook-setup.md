# Stripe Webhook Setup

Use this webhook so paid access is recorded even when a buyer closes the browser before returning to the success page.

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
5. Select this event only:

```text
checkout.session.completed
```

6. Save the endpoint.
7. Reveal the signing secret for the endpoint.
8. Store the signing secret as a Vercel environment variable named `STRIPE_WEBHOOK_SECRET`.

Do not put the signing secret in frontend code, static files, screenshots, docs, or commits.

## Required Vercel Environment Variables

Production must have:

```text
STRIPE_SECRET_KEY
STRIPE_PRICE_ID
STRIPE_WEBHOOK_SECRET
DATABASE_URL
PUBLIC_SITE_URL
SUPPORT_EMAIL
```

After adding or changing environment variables, redeploy production.

## Database Migration

Run the schema migration before enabling the production webhook:

```powershell
npm run db:migrate
```

The schema adds `purchases.stripe_payment_intent_id` and a unique index so webhook retries and checkout-return verification update the same purchase.

## Test Procedure

1. Run the local mock handler test:

```powershell
npm run test:webhook
```

2. Deploy to Vercel after checks pass.
3. In Stripe Dashboard -> Developers -> Webhooks, open the endpoint.
4. Send a test `checkout.session.completed` event.
5. Confirm the webhook response is `2xx`.
6. Make one real low-value checkout test only when you intentionally want to test live mode.
7. Confirm Neon has:
   - one `users` row for the checkout email
   - one `purchases` row for the Stripe Checkout session
   - one active `entitlements` row for `irish-theory-test-coach`

The existing checkout success-page verifier still works. If both the webhook and success-page verifier run, they use the same idempotent purchase recording path.
