# Secret Rotation Checklist

Use this checklist any time a production secret might have been exposed, copied into chat, saved in logs, or shared with someone who should not keep access.

## Rotate Stripe Live Secret Key

1. Open the Stripe dashboard.
2. Go to Developers -> API keys.
3. Create or roll a new live secret key.
4. Do not paste the new value into chat, docs, screenshots, or committed files.
5. Store the key only in Vercel production environment variables.

## Rotate Neon Database Password

1. Open the Neon dashboard.
2. Select the production project and role used by the app.
3. Reset or rotate the role password.
4. Copy the new pooled connection string.
5. Do not commit the connection string or paste it into public docs.

## Rotate Email Provider API Key

1. Open the email provider dashboard.
2. Create or rotate the API key used for login emails.
3. Do not paste the new value into chat, docs, screenshots, or committed files.
4. Store the key only in Vercel production environment variables.

## Rotate AI Explanation Provider Key

1. Open the AI provider dashboard.
2. Create or rotate the API key used by the explanation coach.
3. Do not paste the new value into chat, docs, screenshots, or committed files.
4. Store the key only in Vercel production environment variables.

## Update Vercel Production Env Vars

Update these production variables in Vercel:

```text
STRIPE_SECRET_KEY
STRIPE_PRICE_ID
STRIPE_WEBHOOK_SECRET
DATABASE_URL
PUBLIC_SITE_URL
EMAIL_PROVIDER_API_KEY
AI_EXPLANATION_API_KEY
AI_EXPLANATION_API_URL
AI_EXPLANATION_MODEL
AI_QUESTION_API_KEY
AI_QUESTION_API_URL
AI_QUESTION_MODEL
```

Use the Vercel dashboard or CLI. If using CLI, pass values directly to Vercel and do not write them into tracked files.

## Redeploy

After updating environment variables, redeploy production:

```powershell
vercel deploy --prod
```

## Run Checkout Test

1. Open the production site.
2. Click `Unlock for EUR 0.99`.
3. Confirm Stripe Checkout opens.
4. Do not complete a live payment unless intentionally testing with a real card.
5. Verify `/api/create-checkout-session` returns a Checkout URL.
6. After any real payment test, confirm the purchase appears in Stripe and the entitlement appears in Neon.

## Verify No Secrets Were Committed

Run:

```powershell
npm run check:secrets
```

The scanner reports file, line, and pattern name only. It intentionally does not print secret values.
