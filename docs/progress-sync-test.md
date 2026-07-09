# Progress Sync Manual Test

Use this after deploying the progress-sync endpoints or when testing locally with Vercel dev.

## Prerequisites

1. Apply the database migration:

```powershell
npm run db:migrate
```

2. Confirm the user has:
   - a row in `users`
   - an active row in `entitlements`
   - a valid session from magic-link login

3. Run the app with API support, such as Vercel dev or a deployed preview.

## Test: Request Link And Log In

1. Open the app in a fresh browser profile or private window.
2. Enter the checkout email in `Restore access`.
3. Click `Send login link`.
4. Open the magic link from email, or from the local non-production server log when no email provider is configured.
5. Confirm the Access panel shows full access restored for that email.

## Test: Answer Sync

1. Answer at least three questions in `Revise`.
2. Open one premium mode, such as `High yield`, and answer at least one more question.
3. Confirm the app still works immediately without waiting for the network.
4. In Neon, check that `attempts` has rows for the logged-in user.
5. Confirm each new attempt has:
   - `user_id`
   - `question_id`
   - `selected_index`
   - `correct`
   - `mode`
   - `category`
   - `client_event_id`
   - `created_at`

## Test: Flag Sync

1. Flag a question.
2. Confirm Neon has one row in `flags` for that user and question.
3. Unflag the same question.
4. Confirm the `flags` row is removed for that user and question.

## Test: Reload And Restore

1. Reload the page.
2. Confirm `/api/me` keeps the user logged in through the httpOnly session cookie.
3. Confirm `/api/progress` restores:
   - answered count
   - missed questions
   - flagged questions
   - category summary
4. Confirm premium modes remain unlocked from server entitlement.

## Test: Local Merge Without Duplicates

1. Log out.
2. Answer a few preview questions while logged out.
3. Log in again with the same email.
4. Confirm local answers merge into server progress.
5. Reload the page.
6. Confirm the same local attempts were not inserted twice. The `client_event_id` uniqueness should prevent duplicates.

## Test: Offline Fallback

1. Block network or test in a guest browser with no session.
2. Answer questions and flag/unflag questions.
3. Confirm local progress still updates.
4. Restore network and log in.
5. Confirm queued local attempts and flag changes sync.

## Test: Logout

1. Click `Log out`.
2. Reload the page.
3. Confirm `/api/me` returns no authenticated user.
4. Confirm premium access no longer restores from the server session on that browser.

Do not paste session cookies, magic links, database connection strings, or provider API keys into tickets, screenshots, docs, or chat.
