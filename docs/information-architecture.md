# Information Architecture

Irish Theory Test Coach is split into two clear products:

1. A marketing website for discovery, trust, pricing, support, and SEO.
2. A focused learner application for study sessions, answers, review, access, and account restoration.

## Primary Routes

| Route | Purpose | Indexing |
| --- | --- | --- |
| `/` | Commercial landing page | Indexable |
| `/app` | Learner workspace | Indexable product entry |
| `/pricing` | Plans, comparison, and access wording | Indexable |
| `/learn` | Learning hub and internal-link hub | Indexable |
| `/road-signs` | Road-sign learning entry | Indexable |
| `/mock-exam` | Mock-exam information and entry | Indexable |
| `/account` | Paid learner account and restore-access entry | Noindex |
| `/support` | Support, refunds, access, and instructor-code help | Indexable |
| `/admin` | Protected operator workspace | Noindex |

## Compatibility Routes

Existing SEO pages remain generated and available. Vercel clean URLs continue to serve existing `.html` files without requiring framework routing.

Compatibility redirects in `vercel.json` map selected older short routes into the new route structure:

- `/app.html` to `/app`
- `/pricing.html` to `/pricing`
- `/learn.html` to `/learn`
- `/irish-road-signs-test` to `/road-signs`
- `/irish-theory-test-road-signs` to `/road-signs`
- `/mock-theory-test-ireland` to `/mock-exam`
- `/car-theory-test-mock-exam` to `/mock-exam`
- `/contact` to `/support`

## Homepage Contract

The homepage is a commercial landing page. It must include:

- Independent-product positioning.
- One primary CTA to start the free preview.
- One secondary CTA to compare pricing.
- Feature explanation.
- How-it-works section.
- Weak-area coaching explanation.
- Mock-exam explanation.
- Road-sign practice explanation.
- Transparent pricing.
- Free-preview explanation.
- Product screenshots.
- Content-review methodology.
- FAQ.
- Support and refund visibility.
- Final CTA and complete footer.

The homepage must not render the live learner dashboard or a live question card.

## Learner App Contract

The learner app lives at `/app` and keeps the study experience compact:

- Focused study header.
- Session title and generated product summary.
- Central question workspace.
- Compact mode selector.
- Collapsible browse/progress areas.
- Clear answer controls.
- Distraction-free mock mode.
- Accessible feedback.
- Account and access menu.

The learner app preserves existing IDs and data attributes used by `public/app.js`.

## Pricing Contract

Pricing copy comes from `shared/product-summary.js` and `shared/pricing-config.js`, then is generated into public runtime assets by the build. Public pages must not drift from these sources.

Current plans:

- Free preview.
- Launch offer, when enabled.
- Full Study Pass.
- Instructor access-code packs.

Do not add fake scarcity, guaranteed-pass wording, official affiliation, or official-frequency claims.
