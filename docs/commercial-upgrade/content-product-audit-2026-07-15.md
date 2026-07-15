# Content And Product Audit - 15 July 2026

## Executive Decision

The product has a sound commercial application structure and a materially improved question-delivery pipeline. The current bank is structurally usable, but it must not be described as fully factually verified. The remaining work is an editorial review queue, not a reason to discard owned content.

The live site currently serves 1,277 questions and an enabled EUR 2.99 launch offer. A normal-price build without the launch environment flag shows the EUR 4.99 Full Study Pass. Both use 90-day access. Pricing is server-authoritative.

## Question Bank Findings

| Measure | Current result |
| --- | ---: |
| Published questions | 1,277 |
| Canonical active categories | 11 |
| Estimated-priority questions | 154 |
| Critical-priority questions | 21 |
| Sign/image-signal questions | 671 |
| Questions with local instructional images | 666 |
| Missing local image files | 0 |
| Image questions with neutral alt text | 666 of 666 |
| Editorial similarity groups | 327 |
| Runtime duplicate groups | 81 |
| Visual scenario collections kept distinct | 24 |
| Answer-set variant groups | 135 |
| Direct structural answer conflicts | 0 |
| Remaining lint findings | 34 |

The 34 remaining lint findings are non-standard three-option records. They are retained for editorial review because automatically inventing a fourth answer would reduce quality. The 135 answer-set variant groups also require human classification. No correct option, correct index, or answer meaning was changed. Thirteen correct-answer display strings received deterministic currency, spelling, or grammar repairs while retaining the same answer.

## Corrections Applied

- Mapped all previously uncategorised records into the canonical taxonomy while preserving original category metadata.
- Reclassified 162 image-backed sign and road-marking recognition prompts from generic vehicle/legal categories into Traffic Signs and Regulatory Matters, preserving each original category.
- Repaired deterministic text encoding, punctuation, spelling, and Irish/British English consistency defects.
- Added neutral image descriptions and SHA-256 media fingerprints.
- Separated broad editorial similarity from strict runtime duplicate suppression.
- Prevented generic image prompts with different images from collapsing into one question.
- Rotated legitimate variants between sessions instead of permanently hiding them.
- Prevented repeated runtime duplicate groups inside revise, priority, hardest, sign, and mock sessions.
- Added a hash-verified precomputed private quality index, reducing question-bank cold loading from roughly 26 seconds during audit measurement to roughly 0.5 seconds locally.

## Coaching And AI

Every published question has a server-side answer reveal, explanation, why-it-matters text, memory tip, and related-topic tags. Every question also has a deterministic fallback when the AI provider is unavailable.

The AI endpoint now accepts only a signed post-answer proof. It resolves the question, selected answer, and saved correct answer from the private bank rather than trusting browser-supplied answer text. Responses remain concise, cached, and rate limited. An AI provider key enables generated coaching; its absence leaves the saved and deterministic coaching fully usable.

AI output is supplemental coaching. It does not factually verify a question, predict an official examination, or establish legal certainty.

## Learner Experience

- The free preview remains server-limited to 15 questions.
- Premium questions, answer keys, explanations, media, and the private quality index are absent from the public build.
- Correct answers are returned only after a signed study-session answer submission.
- Mobile answer feedback keeps the result, explanation action, next action, and report link visible without a blocking purchase bar.
- The "Explain this simply" action is visible immediately after answering rather than hidden inside secondary details.
- Image alternatives are descriptive but do not disclose the correct answer.

## Customer Funnel Review

The acquisition path is coherent: landing page, free preview, answer feedback, contextual paywall, Stripe checkout, email restore, paid session, and mock. The homepage gives one primary preview action and a secondary pricing path. Checkout copy states the one-time amount, 90-day duration, independent status, support, refund, privacy, and terms links.

The live deployment has the EUR 2.99 launch offer explicitly enabled. No fake countdown, fake review, guaranteed-pass claim, or official-frequency claim is present. The normal plan remains EUR 4.99 when the launch flag is disabled.

Automated flow tests passed for homepage-to-preview, secure answering, premium-mode paywall, legal pages, restore access, and mock start. Production-safe smoke tests also passed for the homepage, app shell, preview package, health API, pricing, legal pages, generic restore response, unauthorised admin rejection, sitemap, robots, manifest, and premium rejection.

## Production Operations Findings

The current Vercel production deployment is healthy for public pages, preview study, pricing, checkout creation, protected-content rejection, and server-side admin authorization. A recent checkout request returned HTTP 200. A logged-out admin request correctly returned HTTP 401; the code now prevents these expected access denials from being reported as server failures.

Production restore-access email delivery is not ready. The deployed login-link endpoint returned the safe `EMAIL_PROVIDER_MISSING` operational code and HTTP 503 when delivery was required. Configure `EMAIL_FROM` and `EMAIL_PROVIDER_API_KEY` with a verified sender, redeploy, and complete a known-account login-link test before treating paid cross-device restoration as operational.

Database clients previously disabled TLS certificate verification. This pass centralises connection creation, upgrades legacy `sslmode=require`, `prefer`, and `verify-ca` URLs to `verify-full`, preserves channel binding, and leaves local non-TLS development URLs unchanged. The code-level tests pass; a production database connection check must be repeated after deployment because this audit shell intentionally has no database secret.

The AI explanation provider configuration could not be confirmed from public behavior. Saved explanations and the deterministic coaching fallback work for all 1,277 questions. Configure `AI_EXPLANATION_API_KEY` or `OPENAI_API_KEY` only if generated supplemental coaching is desired, then sample output by category before broad use.

## Visual And Accessibility Review

The visual suite captured 18 deterministic states under `reports/ui/pass4/`, including mobile first load, question, selected/correct/incorrect answers, paywall, restore, mock, account, pricing, locked admin, tablet, and desktop. The accessibility suite covered 10 states with zero critical axe violations. The live learner app had no console errors or document-level horizontal overflow at desktop and 360-pixel mobile checks; the first answer target measured 67 pixels high and the mobile action bar did not overlap quiz controls.

## Search And Indexing

The production origin is `https://irishtheorycoach.ie`. The site exposes crawlable HTML, canonical URLs, robots rules, sitemap, structured data, internal links, and social metadata. A public search check did not yet show reliable Google results for the domain on the audit date. That is an indexing status issue, not evidence of a technical ranking guarantee.

Google Search Console still requires an authenticated property verification and sitemap submission if these have not already been completed. The priority URLs are the homepage, `/app`, `/pricing`, `/learn`, `/mock-exam`, `/road-signs`, and `/theory-test-study-plan.html`.

The site is already delivered through Vercel's edge network; a separate "Google CDN registration" is neither required nor a substitute for Search Console. Search visibility requires verified ownership, sitemap submission, crawl/index monitoring, useful content, and time. First-page placement cannot be guaranteed.

## Remaining Editorial Risks

1. All recovered/owner questions remain `needs_official_cross_check` unless an editor has separately recorded factual verification.
2. Review the 135 answer-set variant groups and classify legitimate variants versus rewrites.
3. Review the 34 three-option records; keep three options when intentional or add an editor-approved distractor.
4. Time-sensitive legal, penalty, document, and road-rule content needs recurring comparison with current official material.
5. AI coaching should be sampled by category after a production provider is configured; cached fallback responses are not a substitute for factual review.

## Release Gates

- Run `npm run content:repair` when source content changes.
- Run `npm run qa` before release.
- Keep `data/question-quality-index.json` in the private server package and out of public output.
- Confirm the intended launch-offer environment before deployment.
- Confirm Search Console ownership and submit the production sitemap.
- Configure and verify production transactional email before relying on restore access.
- Deploy the verified database-TLS adapter, then run `npm run db:check` with the production environment injected privately.
- Verify the optional AI provider configuration or intentionally operate with deterministic coaching fallback.
- Do not label the complete bank factually verified until the editorial workflow records that evidence question by question.
