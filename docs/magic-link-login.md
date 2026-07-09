# Magic-Link Login And Access Restore

Magic-link login lets paying users restore premium access on a new browser or device by email.

## How It Works

1. The user enters the email used at checkout.
2. `/api/request-login-link` checks for an active server-side entitlement.
3. If access exists, the server creates a short-lived login token.
4. If email is configured, the server sends a magic link.
5. If email is not configured, the server returns the same safe message. In non-production only, it logs the magic link for local testing.
6. `/api/consume-login-link` consumes the token once, creates a server session, and stores it in an httpOnly cookie.
7. `/api/me` reads the cookie and returns the current entitlement state.
8. `/api/logout` revokes the session and clears the cookie.

The frontend still keeps the old localStorage unlock as a fallback for old purchases, but server entitlement is preferred whenever a session exists.

## Environment Variables

Required for auth:

```text
DATABASE_URL
PUBLIC_SITE_URL
```

Optional for sending email:

```text
EMAIL_FROM
EMAIL_PROVIDER_API_KEY
```

The current sender implementation uses the Resend-compatible HTTP API. If `EMAIL_FROM` or `EMAIL_PROVIDER_API_KEY` is missing, production will not log the raw magic link. Local/non-production can log the link for testing.

## Database Migration

Run:

```powershell
npm run db:migrate
```

This adds:

- `users.display_name`
- `users.last_login_at`
- `users.updated_at`
- `login_tokens`
- `sessions`

## Manual Test Plan

1. Confirm a test email has an active row in `entitlements`.
2. Start the app locally.
3. Enter that email in `Restore access`.
4. Click `Send login link`.
5. If no email provider is configured locally, copy the magic link from the local server log.
6. Open the magic link.
7. Confirm the app says access was restored.
8. Reload the page.
9. Confirm premium modes are still unlocked from `/api/me`.
10. Click `Log out`.
11. Reload again.
12. Confirm server access is no longer restored on that browser.

Do not paste live magic links, API keys, session cookies, or database connection strings into chat, docs, screenshots, or commits.
