# Business and Deployment Report

## Product position

The site should be sold as a focused Irish category B theory-test practice coach, not as an official exam provider. The value at EUR 0.99 is speed and confidence:

- 849 recovered authorised practice questions.
- 238 local image references for visual/sign practice.
- High-yield scoring from archived hardest-question data, category, safety/legal wording, and image/sign presence.
- Timed mock test matching the current car/bike exam format: 40 questions, pass mark 35, 45 minutes.
- Local mistake tracking, flagged questions, daily target, and weak-area review.

Important wording: do not claim that any question "comes back every time." The official question draw is not public. Use "high-yield", "hardest", "commonly missed", and "core exam themes".

## Current data signal

Generated files:

- `data/questions.json`: recovered clean dataset.
- `data/questions.enriched.json`: app-ready dataset with priority scoring.
- `data/hardest_questions.json`: 50 archived hardest-question entries.
- `data/study_report.json`: summary and top high-yield questions.

Current enrichment summary:

- Total questions: 849
- High-yield questions: 111
- Critical questions: 25
- Road-sign/image questions: 250
- Archived hardest-question signals: 50

## Recommended free stack

Use:

- Frontend and API: Vercel
- Database: Neon Postgres free plan
- Payments: Stripe Checkout or Stripe Payment Links
- Repository: GitHub

Why Neon:

- Vercel Postgres is no longer available for new projects; Vercel now points users to marketplace Postgres integrations.
- Neon has a free plan with no monthly cost, 100 projects, 100 CU-hours per project per month, 0.5 GB storage per project, and built-in auth allowances.
- The app data is small. User accounts, purchases, attempts, and progress fit comfortably in a small Postgres database.

Why not Supabase:

- You said you are already above the free limits.
- The app does not need Supabase-specific realtime/storage features for the first paid launch.

## Price reality

EUR 0.99 works psychologically, but payment fees are meaningful. Stripe Ireland standard pricing lists 1.5% + EUR 0.25 for standard EEA cards, so a EUR 0.99 sale leaves about EUR 0.73 before VAT/tax/accounting overhead. UK/international cards cost more.

Recommendation:

- Launch at EUR 0.99 as a limited early price.
- Keep the normal price at EUR 2.99 or EUR 4.99 once the app has accounts, synced progress, and official-material QA.
- Offer free browse/demo with a paid unlock for mock tests, high-yield drill, and progress sync.

## Minimum paid architecture

Tables to create in Neon:

- `users`: email, created_at
- `purchases`: stripe_checkout_session_id, stripe_customer_id, email, amount, currency, status
- `entitlements`: email, product, active, source
- `attempts`: email, question_id, selected_index, correct, mode, created_at
- `flags`: email, question_id, created_at

Launch shortcut:

- Phase 1 can use Stripe Payment Links and a manual access code while traffic is tiny.
- Phase 2 should use Stripe Checkout webhooks plus Neon entitlements.

## Accounts and keys needed

Create or provide:

1. GitHub repository access or a remote URL where this project should be pushed.
2. Vercel project linked to that GitHub repo.
3. Neon account and a new Postgres project.
4. Stripe account with a EUR 0.99 product/price.
5. Optional domain name.

Environment variables for Vercel later:

```text
DATABASE_URL=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=
PUBLIC_SITE_URL=
```

Neon is now connected locally and the schema migration has been applied. Before pushing to GitHub or setting production variables, rotate the Neon password in the Neon dashboard because the first password was shared in chat.

## Live deployment status

- Vercel project: `job-work/irish-theory-test-coach`
- Production URL: https://irish-theory-test-coach.vercel.app
- Latest deployment URL: https://irish-theory-test-coach-iqs2ms8q9-job-work.vercel.app
- Stripe product: `prod_Ur6QkZQmuRJuka`
- Stripe price: `price_1TrODGKAGqkvK3Tj9ow8tslb`
- Price amount: EUR 0.99 one-time payment

Production environment variables are configured in Vercel for:

- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_ID`
- `DATABASE_URL`
- `PUBLIC_SITE_URL`

The live Checkout API has been smoke-tested and returns a Stripe Checkout URL. No test payment was completed.

## Deployment path

Current static app can deploy immediately to Vercel. For paid login/payment enforcement, convert the project to a small Next.js app or add Vercel serverless API routes. The safest paid version is:

1. Keep current static practice UI as the learner experience.
2. Add API route for Stripe Checkout session creation.
3. Add Stripe webhook route to mark purchases active in Neon.
4. Add email magic-link login or Neon Auth.
5. Sync progress to Neon for paid users while keeping local progress for guests.

## Launch checklist

- QA every image-heavy question on desktop and mobile.
- Cross-check high-yield and legal/safety questions against current official RSA material.
- Add disclaimer: independent practice tool, not the official RSA/Prometric exam provider.
- Add privacy policy and terms before taking payments.
- Add refund/contact email.
- Add analytics only after cookie/privacy wording is ready.

## Sources checked

- Official TheoryTest.ie car/bike page confirms 40 questions, pass mark 35, and 45 minutes.
- Vercel docs say Vercel Postgres is no longer available for new projects and new projects should use marketplace Postgres integrations.
- Neon pricing page lists a free plan with 100 projects, 100 CU-hours monthly per project, and 0.5 GB storage per project.
- Stripe Ireland pricing lists 1.5% + EUR 0.25 for standard EEA cards.
