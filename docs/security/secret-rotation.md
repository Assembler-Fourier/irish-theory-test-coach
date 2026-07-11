# Secret Rotation

Use this checklist after suspected exposure, staff/device changes, deployment migration, or scheduled rotation. Never paste real secrets into source files, reports, screenshots, pull requests, or chat.

## Stripe Secret Key

1. Create a replacement key in the correct Stripe mode.
2. Update Vercel environment variables for the matching environment only.
3. Confirm price IDs match the secret mode.
4. Redeploy.
5. Run checkout in Stripe test mode or a controlled live test if production.
6. Revoke the old key after the replacement is confirmed.

## Stripe Webhook Secret

1. Create or rotate the webhook signing secret in Stripe.
2. Update `STRIPE_WEBHOOK_SECRET` in Vercel.
3. Redeploy.
4. Send a test event from Stripe.
5. Confirm duplicate delivery is idempotent.

## Neon Database Password

1. Create a new role password or replacement connection string in Neon.
2. Update `DATABASE_URL` in Vercel.
3. Redeploy.
4. Run `npm run db:check` against the new URL from a secure shell.
5. Revoke the old password after successful production health checks.

## Study Session Secret

1. Generate a new random 32-byte value.
2. Update `STUDY_SESSION_SECRET`.
3. Redeploy.
4. Existing study sessions and protected media tokens will be invalidated.
5. Confirm preview and premium sessions start normally.

## Rate-Limit Salt

1. Generate a new random value for `RATE_LIMIT_SALT`.
2. Update all production/preview environments.
3. Redeploy.
4. Expect in-memory rate buckets to reset.

## Email Provider API Key

1. Create a replacement key with the minimum required sending scope.
2. Update `EMAIL_PROVIDER_API_KEY`.
3. Redeploy.
4. Send a test restore-access email.
5. Revoke the old key.

## AI Provider Keys

1. Rotate `AI_EXPLANATION_API_KEY` and `AI_QUESTION_API_KEY` separately.
2. Update only environments that use AI features.
3. Redeploy.
4. Test fallback behavior and one controlled AI request.
5. Revoke old keys.

## Verification

Run:

```powershell
npm run check:secrets
npm run test:security
npm run check:headers
npm run qa
```

Record the rotation date, actor, affected environments, and verification outcome in a private operational log.
