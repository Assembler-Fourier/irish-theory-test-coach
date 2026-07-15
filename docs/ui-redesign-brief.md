# UI Redesign Brief

Use this brief before making visual changes to Irish Theory Test Coach. The product is functionally built; redesign work should improve clarity, polish, mobile usability, and conversion without rewriting core quiz/payment/auth logic.

## Visual Direction

- Classy modern learner app: calm, focused, practical, and trustworthy.
- Mobile-first: the learner should reach a question quickly and answer comfortably on a phone.
- Premium but affordable: the EUR 4.99 Full Study Pass and EUR 2.99 launch offer should feel valuable, not flashy or pushy.
- Independent practice tool: every trust surface should reinforce that this is independent study support.
- No official RSA, Prometric, TheoryTest.ie, or testing-provider affiliation claims.
- No guaranteed-pass, official exam frequency, or "these come up every time" claims.
- High-yield wording must stay framed as estimated study priority, commonly missed topics, or core practice value.

## Product Priorities

- Keep the quiz usable above everything else.
- Keep preview, paywall, checkout, restore access, mock test, admin authorization, and progress sync working.
- Preserve the existing static frontend plus Vercel serverless API structure unless a framework migration is explicitly requested.
- Keep legal and trust language visible, plain, and non-deceptive.
- Make mobile layouts feel designed, not merely squeezed down from desktop.

## Screenshot Checklist

Capture these states before and after every meaningful redesign change.

| State | What To Check | Automatic Script |
| --- | --- | --- |
| Desktop app preview | Header, trust strip, study flow, preview question, unlock panel, spacing | Yes |
| Desktop paywall | Locked premium mode, current pricing copy, restore link, no official claims | Yes |
| Answer feedback | Selected answer state, feedback panel, explanation button, next/flag controls | Yes |
| Restore access | Restore link opens/focuses email form, support copy remains clear | Yes |
| SEO landing page | Landing page hierarchy, CTA visibility, FAQ/content scanability | Yes |
| Admin locked state | Admin page does not expose data to unauthenticated users | Yes |
| Mobile app preview | Header, nav, trust strip, question card, sticky CTA, no text overlap | Yes |
| Mobile paywall | Locked premium mode, CTA visibility, restore link, no cramped layout | Yes |

## Automated Capture

Run:

```powershell
npm run build
npm run screenshots:ui
```

The screenshot script writes to:

```text
reports/ui/latest/
```

Generated screenshot reports are intentionally ignored by Git. Commit the script and docs, not the generated PNGs, unless a specific review artifact is requested.

## Manual Review Notes

The automated script captures repeatable states, but a human still needs to inspect:

- Mobile text wrapping and horizontal overflow.
- Whether the page feels too tall before the first question.
- Whether buttons and form inputs are thumb-friendly.
- Whether paywall copy feels useful rather than aggressive.
- Whether any new wording accidentally implies official affiliation or guaranteed results.
- Whether admin locked/error states avoid exposing private user, purchase, or database details.
- Whether screenshots accidentally reveal secrets, magic links, session cookies, or private emails.

## Acceptance Criteria For Redesign Work

- `npm run qa` passes.
- New screenshots are captured and compared against the previous baseline.
- No core product flow regresses: preview, answer, premium lock, restore access, legal pages, and mock test.
- No official, guaranteed-pass, or official-frequency claims are introduced.
- Mobile screenshots show readable text, stable layout, and accessible CTAs.
