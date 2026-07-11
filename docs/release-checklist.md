# Release Checklist

Use this checklist before every production launch or major payment/content release.

## Secrets And Environment

- [ ] Stripe live secret key rotated after any local exposure or handoff.
- [ ] Neon database password rotated after any local exposure or handoff.
- [ ] Vercel production environment variables updated: `STRIPE_SECRET_KEY`, plan-specific Stripe price IDs, `STRIPE_WEBHOOK_SECRET`, `DATABASE_URL`, `PUBLIC_SITE_URL`, `EMAIL_FROM`, and email provider key when configured.
- [ ] `npm run check:secrets` passes locally before deployment.
- [ ] No secrets are present in frontend files, docs, reports, screenshots, or committed logs.

## Stripe And Payments

- [ ] Stripe products and live prices are correct: EUR 2.99 launch offer, EUR 4.99 Full Study Pass, EUR 29 instructor 10-code pack, and EUR 69 instructor 25-code pack.
- [ ] Stripe payouts are enabled for the live account.
- [ ] Webhook endpoint is configured for `/api/stripe-webhook`.
- [ ] Webhook listens for checkout completion, async payment success/failure, expired checkout, refunds, charge refunds, and dispute events listed in `docs/stripe-webhook-setup.md`.
- [ ] Payment environment is separated: local/preview use Stripe test mode, production uses Stripe live mode and `STRIPE_WEBHOOK_SECRET`.
- [ ] Success URL verification does not grant access before webhook fulfillment is recorded.
- [ ] `STRIPE_WEBHOOK_SECRET` in Vercel matches the live webhook endpoint secret.
- [ ] Full test purchase completed from the production URL.
- [ ] Checkout success page unlocks access.
- [ ] Webhook entitlement recording works when the checkout success page is closed.
- [ ] Refund flow is understood in Stripe Dashboard and the support process is documented.

## Legal And Trust

- [ ] Privacy page reviewed.
- [ ] Terms page reviewed.
- [ ] Refunds page reviewed.
- [ ] Contact page reviewed.
- [ ] Footer disclaimer is visible: "Independent practice tool. Not affiliated with RSA or Prometric."
- [ ] No page claims official RSA, official Prometric, guaranteed pass, or official exam frequency.
- [ ] Support email is configured and receives test mail.

## Product QA

- [ ] `npm run qa` passes locally.
- [ ] Free preview loads on desktop and mobile.
- [ ] Answering a preview question shows correct/incorrect feedback.
- [ ] Premium modes show the paywall while unpaid.
- [ ] Restore-access form opens, submits, and shows a safe message.
- [ ] Magic-link login works in non-production or with the configured email provider.
- [ ] 40-question mock test starts for an entitled user.
- [ ] Progress, missed questions, and flags persist for a logged-in user.
- [ ] PWA install prompt and offline reload are checked on a mobile-sized viewport.

## Content QA

- [ ] `npm run qa:checklist` has generated the latest high-yield content checklist.
- [ ] Existing recovered questions remain marked for cross-check unless reviewed.
- [ ] New AI-generated questions are draft-only until admin approval.
- [ ] No competitor text has been scraped or copied.
- [ ] High-yield explanations say they are estimated, not official frequency.

## Domain And SEO

- [ ] Production domain is connected in Vercel.
- [ ] HTTPS is active.
- [ ] Canonical URLs point at the production domain.
- [ ] `sitemap.xml` is reachable.
- [ ] `robots.txt` is reachable and allows the complete public pages.
- [ ] Sitemap submitted in Google Search Console after launch.
- [ ] Landing pages have internal links back to the practice app.

## Launch Decision

- [ ] Vercel production deployment completed.
- [ ] Smoke test completed on production URL.
- [ ] Admin access works only for admin users.
- [ ] Non-admin users cannot access admin APIs.
- [ ] Checkout, restore access, and logout tested after deployment.
- [ ] Launch notes include known limitations and support instructions.
