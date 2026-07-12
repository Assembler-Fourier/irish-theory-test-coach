# Irish Theory Test Coach

I built Irish Theory Test Coach as a commercial-grade learning product for Irish Category B learner drivers. It started as a question recovery project and grew into a complete study platform with protected premium content, timed mock exams, progress coaching, passwordless accounts, payments, instructor codes, and an operator dashboard.

This repository is public as a portfolio case study. It shows how I approach product design, backend security, payment reliability, content operations, accessibility, SEO, and production readiness in one working system.

> **Independent practice tool. Not affiliated with RSA or Prometric.** The product does not guarantee a pass or claim to know official exam frequency.

## Try It

- **Live product preview:** [Open Irish Theory Test Coach](https://irish-theory-test-coach-assembler-fourier-job-work.vercel.app)
- **Learner workspace:** [Start the 15-question preview](https://irish-theory-test-coach-assembler-fourier-job-work.vercel.app/app)
- **Pricing:** [View learner and instructor plans](https://irish-theory-test-coach-assembler-fourier-job-work.vercel.app/pricing)
- **Learning hub:** [Browse the study guides](https://irish-theory-test-coach-assembler-fourier-job-work.vercel.app/learn)

The custom `.ie` domain is still completing registry activation. The Vercel Preview is the current review environment and intentionally uses Stripe sandbox payments.

![Current Irish Theory Test Coach learner workspace](docs/images/portfolio-desktop.png)

<p align="center">
  <img src="docs/images/portfolio-mobile.png" width="390" alt="Current Irish Theory Test Coach mobile question experience">
</p>

## What I Built

The learner experience includes:

- 1,277 structured practice questions across the Category B topic bank
- a 15-question free preview that does not expose premium answer keys
- estimated-priority, hardest, road-sign, review, and revision modes
- server-generated 40-question mock exams with a 45-minute timer
- answer coaching, explanations, memory tips, flags, and missed-question review
- category accuracy, daily targets, study streaks, and recommended next actions
- passwordless account restoration and cross-device progress
- installable PWA support and an offline free-preview shell

The commercial and operator side includes:

- Stripe Checkout for learner passes and instructor code packs
- signed, idempotent Stripe webhook processing
- refund, dispute, and repeat-purchase entitlement handling
- cryptographically generated single-use instructor codes
- server-authorized roles for owners, admins, editors, and support staff
- users, purchases, entitlements, content QA, analytics, support, and audit-log views
- first-party privacy-safe funnel analytics
- static SEO pages, structured data, sitemap generation, and internal-link checks

## The Engineering Work I Am Most Proud Of

### Premium content is actually protected

The browser receives only the free preview before authentication. Premium sessions are selected on the server, correct answers are withheld until submission, mock scoring is calculated server-side, and premium media routes require active access.

### Payments survive real failure cases

Checkout amounts and plan selection are server-authoritative. Webhook events are signature-verified and idempotent. The payment ledger represents completed, failed, expired, refunded, disputed, and replayed events. A won dispute restores only the entitlement revoked by that same dispute and preserves the learner's remaining access time.

### Content quality is an operational workflow

The content pipeline detects exact and near duplicates, answer-set variants, conflicting answers, category aliases, malformed options, unsafe HTML, weak explanations, and missing image descriptions. Editorial decisions are versioned and auditable instead of silently changing factual answers.

### Build output cannot quietly drift

Question counts, pricing, access duration, content versions, schema versions, and release metadata are generated from authoritative sources. Stale-build tests fail when marketing copy, public data, pricing, sitemap entries, or generated files disagree.

## Architecture

```mermaid
flowchart LR
    Browser["Static learner app"] --> API["Vercel Functions"]
    API --> Neon["Neon Postgres"]
    API --> PrivateBank["Private question adapter"]
    API --> Stripe["Stripe Checkout and webhooks"]
    Browser --> Preview["Public 15-question package"]
    Admin["Protected admin workspace"] --> API
    Stripe --> Webhook["Raw-body webhook endpoint"]
    Webhook --> Neon
```

```text
public/                 Static learner app, marketing pages, PWA, and admin UI
api/                    Vercel entrypoints and consolidated API router
server/api/             Auth, study, payment, analytics, support, and admin handlers
lib/                    Database, security, entitlement, content, and audit helpers
shared/                 Authoritative pricing, product, business, and growth config
database/               Idempotent schema and numbered migrations
data/                   Owned question source data and media
scripts/                Build, validation, QA, migration, evidence, and release tooling
docs/                   Security, operations, content, design, SEO, and launch guides
```

I kept the product in modular vanilla JavaScript instead of migrating frameworks. That kept the runtime small, made the static marketing surface fast, and forced a clear boundary between browser code and privileged server behavior.

## Technology

| Area | Implementation |
| --- | --- |
| Frontend | Semantic HTML, modern CSS, modular vanilla JavaScript |
| Hosting | Vercel static output and serverless Functions |
| Database | Neon Postgres with `pg` and transactional migrations |
| Payments | Stripe Checkout, signed webhooks, internal payment ledger |
| Authentication | Single-use magic links and secure HTTP-only sessions |
| Offline | Service worker, Web App Manifest, versioned preview cache |
| Quality | Node and Python validation, browser tests, axe, visual snapshots |
| SEO | Static HTML, canonical metadata, JSON-LD, sitemap, internal links |

## Verification

The current commercial Preview was tested against the exact deployed Git commit.

| Check | Current result |
| --- | --- |
| Published dataset | 1,277 questions validated |
| Public content exposure | 15 preview questions, no answer key |
| Stripe sandbox matrix | 18 of 18 scenarios passed |
| Payment reconciliation | 0 unresolved findings |
| Accessibility | 7 states, 0 critical axe violations |
| Visual regression | 15 deterministic mobile, tablet, and desktop screenshots |
| Post-deploy smoke test | 11 of 11 routes and behaviors passed |
| Dependency audit | 0 known vulnerabilities at the latest audit |

Run the complete local quality gate with:

```powershell
npm ci
npm run qa
```

That command validates the dataset, generated output, protected-content boundary, payment and webhook behavior, account policies, role authorization, security controls, PWA, SEO, accessibility, end-to-end flows, and visual baselines.

## Run It Locally

Requirements:

- Node.js 22
- npm
- Python 3

```powershell
git clone https://github.com/Assembler-Fourier/irish-theory-test-coach.git
cd irish-theory-test-coach
npm ci
npm run build
npm run dev
```

Open `http://localhost:5173/public/` for the static product. Use `npx vercel dev` when testing serverless APIs locally.

`.env.example` contains placeholders only. Real Stripe, Neon, email, session, and webhook credentials must remain in private environment variables.

## Admin And Security

The admin workspace is not protected by hidden buttons. Every admin endpoint verifies the secure session and server-side role. The Preview owner flow has been tested through token consumption, `/api/me`, protected admin metrics, and logout.

Operational documentation includes:

- [Threat model](docs/security/threat-model.md)
- [Security controls](docs/security/security-controls.md)
- [Incident response](docs/security/incident-response.md)
- [Release runbook](docs/operations/release-runbook.md)
- [Payment reconciliation](docs/operations/payment-reconciliation.md)
- [Admin dashboard](docs/admin-dashboard.md)

## Current Status

The full commercial build is deployed to Vercel Preview. Production promotion is deliberately held until the custom `.ie` domain leaves registry hold, HTTPS is issued, final credentials are rotated, and legal review is completed. Remaining content work is tracked openly in the generated QA reports rather than hidden behind a launch-ready claim.

## About Me

I am Uzair Waseem. I built this project end to end, including product design, data tooling, frontend UX, serverless APIs, database design, payments, authentication, admin operations, automated QA, and deployment.

For hiring conversations, the most useful places to start are the live Preview, the architecture above, and the security/payment modules under `server/api/` and `lib/`.

## Source And Content

The repository is available for portfolio review. Unless a separate licence says otherwise, no licence is granted to reuse the question bank, images, explanations, branding, or other content assets.
