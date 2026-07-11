# Mobile Accessibility Baseline

Pass 4 treats 320px to 430px layouts as first-class product surfaces.

## Mobile Navigation

- The learner app uses `#mobileModeSelect` on mobile instead of the old horizontally clipped mode rail.
- The active study mode is mirrored in `#mobileModeSummary`.
- Desktop mode cards remain available for larger layouts.

## Purchase Prompts

- Mobile purchase prompts are contextual and in-flow.
- They must not cover answer options, question navigation, feedback, form fields, or safe areas.
- They must not appear during mock concentration mode.

## Answer Accessibility

- Answer options remain native buttons.
- Each option keeps a fixed answer-letter circle.
- Correct and incorrect states include visible text labels, not colour alone.
- `#answerLiveRegion` announces answer outcomes politely after reveal.
- Keyboard answer submission is covered by `npm run test:e2e`.

## Feedback

- Core result and explanation stay visible after answering.
- Secondary coaching content is placed behind a native `<details>` disclosure.
- Next-question action remains in a predictable feedback action area.

## Verification

Run:

```powershell
npm run test:e2e
npm run test:a11y
npm run test:visual
npm run qa
```

Pass criteria:

- No document-level horizontal scrolling at 320, 360, 375, 390, 412, or 430px.
- Critical axe violations are zero.
- Visual screenshots are written to `reports/ui/pass4`.
- Keyboard-only answer submission reaches feedback.
