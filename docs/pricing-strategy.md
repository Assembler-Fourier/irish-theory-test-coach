# Pricing Strategy

Plans:

- Free preview: 15 questions and basic progress.
- Launch offer: EUR 2.99 one-time only when `LAUNCH_OFFER_ENABLED=true` and `LAUNCH_OFFER_ENDS_AT` has not passed.
- Full Study Pass: EUR 4.99 one-time for 90-day access.
- Instructor 10: EUR 29.00 for 10 codes.
- Instructor 25: EUR 69.00 for 25 codes.

Stripe env vars:

- `STRIPE_PRICE_ID_LAUNCH`
- `STRIPE_PRICE_ID_FULL`
- `STRIPE_PRICE_ID_INSTRUCTOR_10`
- `STRIPE_PRICE_ID_INSTRUCTOR_25`
- `STRIPE_PRICE_ID` remains a backward-compatible fallback only.

To switch the launch offer off, set `LAUNCH_OFFER_ENABLED=false` in Vercel production env vars, redeploy, and run checkout tests for the Full Study Pass.
