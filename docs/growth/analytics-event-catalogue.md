# Analytics Event Catalogue

Schema version: 2

Irish Theory Test Coach uses first-party analytics only. Events must not contain raw emails, full query strings, payment card data, magic links, session cookies, login tokens, database IDs exposed unnecessarily, or official/pass-guarantee claims.

## Funnel

### 1. `landing_view`

- Label: Landing view
- Definition: A visitor loads the homepage, SEO landing page, pricing page, learning hub, road-sign page, mock-exam page, instructor page, or other public marketing entry page.
- Duplicate prevention: At most once per page load per path.

### 2. `start_free_practice`

- Label: Start free practice
- Definition: A visitor clicks a visible Start free preview/practice CTA that navigates into the learner app.
- Duplicate prevention: At most once per session.

### 3. `preview_started`

- Label: Preview started
- Definition: The learner app successfully loads the free preview question package for an unpaid visitor.
- Duplicate prevention: At most once per anonymous learner lifetime.

### 4. `first_answer`

- Label: First answer
- Definition: The learner submits the first answer recorded for the current anonymous learner.
- Duplicate prevention: At most once per anonymous learner lifetime.

### 5. `preview_engaged`

- Label: Preview engaged
- Definition: An unpaid learner answers at least three preview questions or reaches the preview answer CTA.
- Duplicate prevention: At most once per anonymous learner lifetime.

### 6. `paywall_viewed`

- Label: Paywall viewed
- Definition: A premium-mode or preview-completion paywall is shown to an unpaid learner.
- Duplicate prevention: At most once per page session for the same source and mode.

### 7. `checkout_started`

- Label: Checkout started
- Definition: The server successfully creates a Stripe Checkout session and the browser is about to redirect.
- Duplicate prevention: Idempotent by event ID; button loading prevents double-click duplicates.

### 8. `checkout_completed`

- Label: Checkout completed
- Definition: The learner returns from Stripe success and session verification/entitlement refresh succeeds client-side, while webhook remains the authority for access recording.
- Duplicate prevention: At most once per returned Stripe session in the browser.

### 9. `access_restored`

- Label: Access restored
- Definition: A magic-link restore request succeeds or an account session with active entitlement is restored.
- Duplicate prevention: At most once per successful restore interaction.

### 10. `first_paid_session`

- Label: First paid session
- Definition: An entitled learner starts their first premium study session after access is active.
- Duplicate prevention: At most once per anonymous learner lifetime.

### 11. `first_mock_started`

- Label: First mock started
- Definition: An entitled learner starts the first timed mock session tracked for the current anonymous learner.
- Duplicate prevention: At most once per anonymous learner lifetime.

### 12. `first_mock_completed`

- Label: First mock completed
- Definition: An entitled learner completes the first timed mock session tracked for the current anonymous learner.
- Duplicate prevention: At most once per anonymous learner lifetime.

### 13. `return_visit`

- Label: Return visit
- Definition: A visitor returns in a later browser session after a prior landing or app visit.
- Duplicate prevention: At most once per browser session.

## Behaviour Events

- `page_view`
- `question_answered`
- `answer_correct`
- `answer_wrong`
- `mode_selected`
- `checkout_clicked`
- `checkout_success`
- `restore_access_clicked`
- `restore_access_started`
- `restore_access_success`
- `pricing_page_viewed`
- `referral_code_viewed`
- `referral_code_applied`
- `referral_checkout_started`
- `referral_purchase_completed`
- `mock_started`
- `mock_completed`
- `frontend_error`

## Attribution

Allowed attribution keys:

- `utmSource`
- `utmMedium`
- `utmCampaign`
- `utmContent`
- `landingPage`
- `referralCode`
- `instructorCode`

First touch is set once per anonymous browser profile. Last touch updates when a new safe UTM/referral/instructor signal appears. Arbitrary query parameters are discarded.

## Reliability

- Client event IDs are generated before queuing.
- Events include schema version and client timestamp.
- Events queue in local storage and flush in small batches.
- Failed submissions retry with bounded exponential backoff.
- Server validation enforces allowed names, allowed property keys, allowed attribution keys, and idempotency.
- Abuse controls are handled by the analytics API rate limit and safe body-size limits.
- Environment is stored server-side.
