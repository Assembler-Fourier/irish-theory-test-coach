# Learner Account And Restore Access

Irish Theory Test Coach uses passwordless email login. There are no learner passwords to store or reset.

## Account Capabilities

- View masked email, role, access status, plan, purchase date, expiry, remaining access days, product version, and content version.
- View server-saved progress summary, category accuracy, study streak, daily target progress, and recent mock results.
- Restore access by email magic link.
- Log out on the current browser.
- Log out all devices by revoking active server sessions.
- Export learner data as JSON.
- Submit a delete-my-account request for support review.
- Contact support using the configured support email.

## Restore Access Security

- Login requests are rate-limited by IP address and normalised email.
- The response does not reveal whether an email is known.
- Magic links are single-use and expire after 15 minutes.
- Existing browser sessions are rotated after a successful login.
- Expired and already-used links return specific UI states without exposing account details.
- Production never logs raw tokens.
- Production returns a safe error if transactional email is not configured or cannot send.
- Request origins are checked against `PUBLIC_SITE_URL` when an Origin or Referer header is supplied.

## Access Expiry

Expired learners can still sign in, view progress, export data, contact support, and see renewal options.

Expired learners cannot access premium study modes or premium media because the study-session APIs still require an active server-side entitlement.

## Progress Sync Rules

The browser keeps offline progress locally and queues writes until the learner is signed in and online.

- Attempts use `clientEventId` as the operation ID.
- Flag and unflag changes use `operationId`.
- Server writes are idempotent.
- Server history is treated as the source of truth.
- Richer local answer counts are preserved only when they contain more attempts than the server snapshot.
- Pending local attempts are replayed over the server snapshot.
- Pending flag operations are collapsed by question, with the latest operation winning.
- The UI shows whether progress is local, queued, syncing, or server-saved.
- Failed sync attempts retry with exponential backoff.

These rules avoid overwriting richer server history with stale browser state.

## Email Templates

Templates live in `lib/email-templates.js` for:

- login link
- purchase confirmation
- access restored
- access-expiry reminder
- instructor-code redemption
- refund confirmation
- support acknowledgement

Access-expiry reminders must not be sent until notification preference and legal basis are defined.
