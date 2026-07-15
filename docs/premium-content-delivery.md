# Premium Content Delivery

Irish Theory Test Coach now uses entitlement-controlled question delivery.

## Current Architecture

- `public/data/preview-questions.json` is the only public question package.
- The preview package contains the selected free-preview questions, answer options, allowed study metadata, and preview image references only.
- It must not contain correct answers, option correctness, explanations, source notes, private review metadata, or the premium bank.
- The full question bank remains in `data/questions.enriched.json` and is bundled into the Vercel serverless function with `vercel.json` `includeFiles`.
- Premium media is read from `data/assets/**` server-side and returned through `/api/v1/media/:token` only after entitlement checks.

This is the server-packaged private-data option. It is production-safe while the function bundle size remains acceptable. If bundle size becomes too large, keep the same `lib/question-bank.js` adapter and replace the file read with private object storage.

## Study Session API Contract

- `POST /api/v1/study-sessions` starts a signed study session.
- `GET /api/v1/study-sessions/:sessionId` refreshes the signed session payload.
- `POST /api/v1/study-sessions/:sessionId/answers` reveals correctness and coaching only after submission.
- `POST /api/v1/study-sessions/:sessionId/flags` records a flag/unflag against the signed question set.
- `POST /api/v1/study-sessions/:sessionId/complete` computes mock completion from signed answer state.

Initial question payloads must not include answer keys or explanations.

## Required Production Environment

- `DATABASE_URL`
- `PUBLIC_SITE_URL`
- `STUDY_SESSION_SECRET`
- Stripe and email variables documented in `.env.example`

`STUDY_SESSION_SECRET` should be a random high-entropy value. Do not commit it, print it, or place it in frontend files.

## Local Development

- `npm run build` creates the preview package.
- Static preview pages can load from `public/`.
- Answer reveal and premium modes need the serverless API runtime. Use Vercel dev or direct API tests when checking secure study sessions.

## Deployment Steps

1. Confirm `data/questions.enriched.json` and `data/assets/**` exist in the deployment source.
2. Confirm `vercel.json` includes `data/**` for the serverless function.
3. Set `STUDY_SESSION_SECRET` in Vercel production environment variables.
4. Set `DATABASE_URL`, `PUBLIC_SITE_URL`, Stripe, webhook, and email variables.
5. Run `npm run qa`.
6. Deploy from the committed branch.
7. Test free preview, checkout return, restore access, premium drills, mock completion, and protected media.

## Private Storage Migration

If moving away from server-packaged data:

1. Upload `questions.enriched.json` and media assets to private object storage.
2. Update `lib/question-bank.js` behind the existing adapter functions.
3. Keep `/api/v1/study-sessions` and `/api/v1/media` response shapes unchanged.
4. Production must return safe generic errors if the private store is unavailable.
5. Re-run `npm run qa` and `node scripts/test-content-security.mjs`.
