# Irish Theory Test Coach

A mobile-first Category B theory-test practice product for Irish learner drivers. It combines a focused question experience, estimated priority drills, road-sign practice, timed mock exams, weak-area review, secure paid access, and an admin content workflow.

**Independent practice tool. Not affiliated with RSA or Prometric.** The project does not promise a guaranteed pass or claim official exam frequency.

## Live Product

- **App:** [irish-theory-test-coach.vercel.app](https://irish-theory-test-coach.vercel.app)
- **Pricing:** [View learner and instructor plans](https://irish-theory-test-coach.vercel.app/pricing)
- **Learning hub:** [Browse study guides](https://irish-theory-test-coach.vercel.app/learn)
- **Admin:** [Protected admin workspace](https://irish-theory-test-coach.vercel.app/admin)
- **Sitemap:** [View the production sitemap](https://irish-theory-test-coach.vercel.app/sitemap.xml)

![Irish Theory Test Coach desktop interface](docs/images/portfolio-desktop.png)

## Product Highlights

- 849 practice questions with explanations and image support.
- Six study modes: revise, estimated priority, hardest, road signs, mock test, and review.
- 40-question, 45-minute mock flow with a 35-answer practice pass mark.
- Daily target, missed-question cleanup, category accuracy, flags, and recommended next actions.
- Mobile-first quiz UI with accessible answer states and coaching feedback.
- Free 15-question preview and a EUR 4.99 one-time Full Study Pass with 90-day access.
- Stripe Checkout, server-side entitlement verification, webhook endpoint, and restore-access flow.
- Neon Postgres persistence for users, purchases, entitlements, sessions, progress, analytics, referrals, and content review.
- Server-authorized admin dashboard for users, entitlements, revenue, referrals, questions, and generated drafts.
- Privacy-safe first-party analytics, installable PWA support, offline shell caching, and 33 indexable public URLs.

<p align="center">
  <img src="docs/images/portfolio-mobile.png" width="390" alt="Irish Theory Test Coach mobile question interface">
</p>

## Architecture

```text
public/                 Static product UI, PWA, legal pages, and SEO pages
api/[...route].js       Consolidated Vercel Function router
server/api/             Checkout, auth, progress, analytics, AI, and admin handlers
lib/                    Database, auth, entitlement, referral, and environment helpers
shared/                 Central pricing configuration
database/schema.sql     Neon Postgres schema
data/                   Question dataset, study reports, and local image assets
scripts/                Build, QA, SEO, screenshot, migration, and recovery tools
docs/                   Product, security, operations, content, and launch documentation
```

The current MVP deliberately uses static HTML, CSS, and JavaScript with Vercel serverless APIs. It avoids a framework migration so the app remains inexpensive to host and easy to inspect.

## Technology

- HTML5, modern CSS, and vanilla JavaScript
- Vercel static hosting and Functions
- Neon Postgres via `pg`
- Stripe Checkout and signed webhook handling
- Secure HTTP-only magic-link sessions
- Service worker and Web App Manifest
- JSON-LD, sitemap, canonical metadata, and static SEO pages
- Node.js and Python validation/build tooling

## Local Development

Requirements: Node.js, npm, and Python 3.

```powershell
npm install
npm run build
npm run dev
```

Open [http://localhost:5173/public/](http://localhost:5173/public/).

Copy `.env.example` to `.env.local` for local serverless work and replace placeholders locally. Never commit `.env.local`, Stripe keys, Neon credentials, webhook secrets, or email-provider keys.

## Quality Gate

```powershell
npm run qa
```

The full QA command validates:

- the 849-question dataset and high-yield score breakdowns
- JavaScript syntax and deployable data generation
- PWA assets and cache declarations
- sitemap, canonical metadata, structured data, and internal links
- HTML, image, and data performance budgets
- obvious live-secret patterns
- preview, answer, paywall, legal, restore-access, mock, and API safety flows

Capture the responsive visual baseline with:

```powershell
npm run screenshots:ui
```

## Deployment

Vercel uses:

```text
Build command: npm run build
Output directory: public
```

Production configuration is documented in:

- [`docs/release-checklist.md`](docs/release-checklist.md)
- [`docs/secret-rotation-checklist.md`](docs/secret-rotation-checklist.md)
- [`docs/stripe-webhook-setup.md`](docs/stripe-webhook-setup.md)
- [`docs/admin-dashboard.md`](docs/admin-dashboard.md)

The production checkout currently creates live EUR 4.99 Stripe sessions. Before accepting customer payments, configure the production `STRIPE_WEBHOOK_SECRET`, test `checkout.session.completed`, confirm the support mailbox, and rotate any credential previously shared in chat or terminal history.

## Content Safety

- Do not copy competitor question text.
- Keep provenance for imported or recovered material.
- Existing recovered questions require official cross-checking where marked.
- AI-generated questions remain drafts until an admin reviews and approves them.
- “High-yield” means estimated study priority, not official exam frequency.

Current official cross-check sources include [TheoryTest.ie](https://theorytest.ie/), its [revision material](https://theorytest.ie/revision-material/), and the RSA [Rules of the Road](https://www.rsa.ie/services/learner-drivers/resources/rules-of-the-road).

## Repository Notes

Durable engineering and product rules live in [`AGENTS.md`](AGENTS.md). The detailed UI and release documentation is under [`docs/`](docs/).
