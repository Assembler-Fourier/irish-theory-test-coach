# Commercial UI Relaunch - 15 July 2026

## Baseline Findings

- The mobile marketing header clipped navigation labels instead of offering a deliberate menu.
- The privacy choice covered most of the first mobile viewport and obscured the product during visual QA.
- The learner desktop surface gave modes, quiz, progress, access, and study flow almost equal visual weight.
- The admin workspace presented more than twenty overview metrics at once and had no persistent section navigation.
- One legacy stylesheet served marketing, app, admin, SEO, and legal surfaces, allowing cross-surface overrides to accumulate.
- High-intent SEO pages were technically complete but shared too much generic editorial copy.

## Direction

- Professional Irish education technology rather than playful gamification.
- Deep green for identity, near-black for focused work, lime only for strong actions or success.
- Solid surfaces, restrained shadows, eight-pixel maximum card radii, and no decorative glass effects.
- Mobile menu and single-column study flow from 320 to 430 pixels.
- Focused learner question workspace with the current correctness and entitlement contracts unchanged.
- Admin hierarchy that prioritises revenue, purchases, access, users, refunds, and conversion before secondary operational counts.

## Implementation Boundaries

- The visual system is an override layer so legacy behavior remains compatible while surfaces are migrated safely.
- No frontend payment authority, admin bypass, answer-key exposure, or framework migration was introduced.
- Generated marketing, SEO, and compliance pages load the same versioned visual layer.
- Priority SEO guides receive original intent-specific copy and a visible methodology note.

## Verification

- Capture desktop and mobile homepage, quiz, feedback, paywall, restore, pricing, SEO, privacy, and admin locked states.
- Run syntax, dataset, build, stale-build, PWA, compliance, growth, SEO, performance, security, API, payment, webhook, E2E, axe, and visual checks.
- Verify production after deployment at 360, 390, 430, 1024, 1280, and 1440 pixels.
