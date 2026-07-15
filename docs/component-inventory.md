# Component Inventory

The project remains a static frontend with serverless APIs. Shared commercial page markup is generated during `npm run build` rather than moved to a framework.

## Shared Static Components

Source: `shared/static-components.js`

- `siteHeader(options)` renders the shared marketing header.
- `siteFooter(options)` renders the shared footer and non-affiliation disclaimer.
- `finalCta(options)` renders the repeated CTA strip.
- `featureCards(items)` renders repeated feature-card groups.
- `pricingCards(productSummary, options)` renders the pricing card set from product and pricing configuration.
- `pageMeta(options)` renders standard title, description, canonical, Open Graph, and Twitter tags.
- `escapeHtml(value)` escapes component text before interpolation.

## Page Generator

Source: `scripts/generate-ia-pages.mjs`

Generated pages:

- `public/index.html`
- `public/pricing.html`
- `public/learn.html`
- `public/road-signs.html`
- `public/mock-exam.html`
- `public/account.html`
- `public/support.html`

Generated assets:

- `public/marketing/app-workspace-preview.svg`
- `public/marketing/content-review-preview.svg`

The generator also patches `public/sitemap.xml` with clean URLs for the new top-level routes.

## Product Runtime Generator

Source: `scripts/generate-product-runtime.mjs`

Generated public runtime files:

- `public/product-summary.json`
- `public/product-summary.js`
- `public/release-manifest.json`
- `public/pricing.json`
- `public/pricing-config.js`
- `public/config.js`

It also updates runtime product placeholders across public HTML files so counts, pricing text, mock labels, and access duration remain aligned with the authoritative summary.

## Learner App Markup

Source: `public/app.html`

The learner app keeps the existing vanilla JavaScript contract from `public/app.js`. Important retained hooks include:

- `#questionMount`
- `#checkoutBtn`
- `#heroCheckoutBtn`
- `#restoreForm`
- `#restoreEmail`
- `#modeRevise`
- `#modeHighYield`
- `#modeHardest`
- `#modeSigns`
- `#modeExam`
- `#modeReview`
- `#paywallTemplate`
- `#questionTemplate`

## Route Compatibility

Source: `vercel.json`

Vercel `cleanUrls` serves `.html` pages at clean paths such as `/app`, `/pricing`, and `/learn`. Redirects preserve selected older paths and move them into the new product IA.

## QA Scripts Aware Of The IA

Updated scripts:

- `scripts/test-app-flows.mjs`
- `scripts/capture-ui-baseline.mjs`
- `scripts/check-seo.mjs`
- `scripts/check-technical-seo.mjs`
- `scripts/check-internal-links.mjs`
- `scripts/check-stale-build.mjs`
- `scripts/check-performance-budget.mjs`
- `scripts/check-pwa.mjs`

These scripts understand that `/` is now a marketing page and `/app` is the learner workspace.
