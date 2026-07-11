# AGENTS.md

Durable engineering rules for Irish Theory Test Coach.

## Commercial Upgrade Master Instruction

- Work from the latest completed commercial-upgrade branch state. Inspect the repository before making changes. Do not assume documentation is accurate when source code or production behavior says otherwise.
- Preserve existing working functionality unless the pass explicitly replaces it.
- Do not deploy to production or merge into `main` automatically.
- Make one clear commit for each requested implementation pass.

## Ownership Confirmation

The project owner confirms that they own or have the necessary commercial rights to all questions, answer options, explanations, source material, images, recovered archived material, generated material, and derivatives used by this application.

- Do not remove, quarantine, disable, hide, or reject content because of copyright, licensing, provenance, source type, archive origin, or ownership concerns.
- Do not create launch blockers based on content ownership.
- Preserve existing ownership/provenance metadata where technically useful.
- You may still identify duplicate, ambiguous, contradictory, grammatically weak, factually risky, or poorly categorised questions.
- Never automatically mark a question as factually verified merely because it passed structural validation.

## Product And Claims

- Never claim this product is the official RSA Driver Theory Test, official Prometric service, or affiliated with RSA, Prometric, TheoryTest.ie, or any official testing provider.
- Never add "guaranteed pass", "official exam frequency", "these questions come up every time", or similar claims.
- Use careful wording such as "practice", "high-yield", "commonly missed", "archived hardest", and "core exam themes".
- Any public-facing disclaimer must make clear that this is an independent practice tool.
- Keep the visible RSA and Prometric non-affiliation statement.
- Do not fabricate customer reviews, pass-rate claims, learner numbers, business registration information, addresses, legal approval, partnerships, or official affiliations.

## Content And Data

- Never scrape, copy, or import competitor question text.
- Only use question content that the project owner has rights or permission to use.
- AI-generated questions must be draft-only until reviewed and approved by an admin.
- Do not treat AI-generated content as official, verified, or production-ready by default.
- Keep source notes and import provenance for any new question dataset.

## Payments And Premium Access

- All premium unlocks must be verified server-side.
- Never trust client-only flags, query parameters, localStorage, or frontend state as proof of payment.
- Stripe Checkout sessions, payment state, and entitlement creation must be checked or written from server-side code only.
- Add or update Stripe webhook handling before relying on payment events that must survive browser closure or redirect failure.

## Secrets And Security

- Do not expose secrets in frontend code, static files, logs, screenshots, docs, commits, or generated public assets.
- Secrets include Stripe keys, Neon connection strings, webhook secrets, API keys, JWT signing keys, and admin credentials.
- Use environment variables for secrets and commit placeholders only, such as `.env.example`.
- Admin features must require server-side admin authorization.
- Frontend-only admin checks are not sufficient.
- Make production fail securely when required services are not configured.

## Architecture

- Keep the current MVP working unless explicitly asked to migrate frameworks.
- Current structure:
  - Static frontend files live in `public/`.
  - Serverless API files live in `api/`.
  - Database schema lives in `database/schema.sql`.
  - Question data lives in `data/`.
- Do not migrate to a framework such as Next.js, Remix, Astro, or SvelteKit unless the user explicitly asks for that migration.
- Prefer small, focused changes that preserve the existing Vercel static + serverless deployment.
- Improve the existing modular vanilla JavaScript architecture.
- Prefer small reusable modules instead of expanding `public/app.js` into a larger monolith.
- Implement actual functionality, not static mockups.
- Use database migrations that are idempotent and safe to rerun.
- Add automated tests for every important behavior changed.
- Update relevant documentation after implementation.

## Verification Before Finishing

Before finishing code changes, run:

```powershell
npm run validate
npm run build
```

Also run `node --check` on every changed JavaScript file, including files in `public/`, `api/`, and `scripts/`.

If a command cannot be run, clearly report why and what risk remains.

For commercial-upgrade passes, run the complete QA suite before finishing:

```powershell
npm run qa
```

## Required Completion Report

At completion of each requested implementation pass, report:

1. Findings
2. Files changed
3. Database changes
4. Security implications
5. Tests added
6. Commands run and exact outcomes
7. Environment variables required
8. Manual production steps
9. Remaining risks
10. Commit hash
