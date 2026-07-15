# UI Rebuild Plan

## Goal

Rebuild Irish Theory Test Coach into a premium, mobile-first learner app while preserving the current static frontend, Vercel serverless APIs, Stripe checkout, restore access, analytics, PWA, sitemap, SEO pages, and admin authorization.

## Visual Direction

- Editorial learner product rather than an operational dashboard.
- Cobalt primary, near-black hero surfaces, lime actions, coral/amber progress cues, and white study surfaces.
- Compact product header and hero with a real road-sign practice image.
- Three-zone desktop study session and quiz-first mobile layout.
- Strong typography, clear answer states, restrained motion, and maximum 8px card radii.
- Independent-tool disclaimer remains visible; no official or guaranteed-pass claims.

## Selector Contract To Preserve

The app logic in `public/app.js` depends on these stable IDs and classes:

- Core mounts: `questionMount`, `questionTemplate`, `paywallTemplate`.
- Status and exam: `statusBar`, `insightBar`, `insightTitle`, `insightCopy`, `jumpHighYieldBtn`, `examBar`, `examProgress`, `examTimer`, `finishExamBtn`.
- Controls: `searchInput`, `categorySelect`, `startExamBtn`, `resetProgressBtn`.
- Mode buttons: `modeRevise`, `modeHighYield`, `modeHardest`, `modeSigns`, `modeExam`, `modeReview`, plus `[data-mode-button]`.
- Checkout and restore: `heroCheckoutBtn`, `checkoutBtn`, `restoreAccessLink`, `restoreForm`, `restoreEmail`, `restoreBtn`, `restoreStatus`, `logoutBtn`, `mobileStickyCta`, `stickyCheckoutBtn`, `stickyRestoreLink`, `stickyProgressText`.
- Progress: `answeredStat`, `accuracyStat`, `missedStat`, `flaggedStat`, `highYieldStat`, `signsStat`, `categorySummary`, `targetStat`, `targetRing`, `targetMeter`, `coachCopy`, `nextActionTitle`, `nextActionCopy`, `studyFlowList`, `flowStateLabel`.
- Generated question card classes: `question-view`, `category-pill`, `priority-pill`, `high-yield-reason-badge`, `priority-meta`, `question-number`, `question-title`, `question-image-wrap`, `question-image`, `answer-list`, `signal-list`, `feedback`, `flag-btn`, `prev-btn`, `next-btn`, `finish-exam-inline-btn`, `answer-option`.
- Paywall classes: `paywall-checkout-btn`, `paywall-restore-link`, `referral-form`, `referral-status`.

## Implementation Approach

1. Keep the app architecture and JavaScript contracts stable.
2. Replace the visual hierarchy with a compact learner hero, quiz-first app shell, swipeable mode rail, softer progress drawer, and premium paywall.
3. Keep legal-safe copy visible: independent practice tool, not affiliated with RSA or Prometric.
4. Refresh landing/admin styling with the same brand tokens without hiding SEO content behind JavaScript.
5. Run full QA and capture visual evidence under `reports/ui/latest`.

## Known Non-Goals

- No framework migration.
- No changes that weaken server-side payment or admin checks.
- No official, guaranteed-pass, official-frequency, or official-question claims.
