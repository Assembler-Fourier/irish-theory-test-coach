# Policy Versioning

Policy versions are configured in `shared/business-config.js` through environment variables and generated into `public/business-config.json`.

## Version Fields

- `PRIVACY_POLICY_VERSION`
- `TERMS_POLICY_VERSION`
- `REFUND_POLICY_VERSION`
- `ACCESSIBILITY_POLICY_VERSION`
- `CONTENT_METHODOLOGY_VERSION`

## Effective Date Fields

- `PRIVACY_POLICY_EFFECTIVE_DATE`
- `TERMS_POLICY_EFFECTIVE_DATE`
- `REFUND_POLICY_EFFECTIVE_DATE`
- `ACCESSIBILITY_POLICY_EFFECTIVE_DATE`
- `CONTENT_METHODOLOGY_EFFECTIVE_DATE`

Dates must use `YYYY-MM-DD`.

## Checkout Recording

When checkout is created, the server records:

- `checkout_attempts.accepted_policy_versions`
- Stripe Checkout metadata:
  - `policy_version_privacy`
  - `policy_version_terms`
  - `policy_version_refunds`
  - `policy_version_accessibility`
  - `policy_version_content_methodology`
  - `policy_effective_date`
  - `content_version`
  - `product_version`
- `purchases.policy_versions` after webhook fulfillment.

The browser does not supply policy versions.

## Update Process

1. Update the relevant env var versions and effective dates.
2. Update policy copy and compliance docs.
3. Run `npm run build`.
4. Run `npm run check:compliance`.
5. Run `npm run qa`.
6. Deploy only after legal/commercial approval.

## Rules

- Do not silently change public policy text without version review.
- Do not claim legal approval unless it has actually happened.
- Keep old checkout records intact.
- If mandatory commercial identity remains placeholder in production, treat it as a launch blocker.
