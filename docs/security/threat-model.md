# Security Threat Model

Irish Theory Test Coach is an independent Irish Category B theory-test practice product. The app has a static frontend, serverless APIs, Stripe Checkout, Neon Postgres, private premium question delivery, passwordless email login, learner progress sync, analytics, and an admin operations workspace.

## Assets

- Premium question bank, answer keys, explanations, and protected media.
- Learner accounts, sessions, entitlement state, purchases, progress, flags, mock results, and support cases.
- Stripe checkout/session/webhook state, instructor codes, referral codes, refunds, disputes, and revenue reports.
- Admin roles, audit logs, content review decisions, and operational exports.
- Environment secrets, database URL, Stripe keys, webhook secret, email provider key, AI provider keys, and session signing secret.

## Trust Boundaries

- Browser to `/api/*` serverless functions.
- Serverless functions to Neon Postgres.
- Serverless functions to Stripe APIs and webhook ingress.
- Serverless functions to email and AI providers.
- Admin browser to privileged admin APIs.
- Protected media route to private source assets.

## Threats And Controls

### Public learners

Public learners should only receive preview content. Controls: server-generated preview sessions, preview limits, no answer key before submission, private premium source data, protected media tokens, and no-store API responses.

### Paid learners

Paid learners can access premium content only while entitlement is active. Controls: server-side session lookup, active entitlement checks, entitlement-gated study modes, account logout/revocation, and expired entitlement handling.

### Malicious users

Malicious users may try oversized bodies, malformed JSON, SQL injection strings, XSS payloads, IDOR, forged study sessions, forged answer state, or role bypasses. Controls: shared body limits, request validation, parameterized SQL, signed study/session tokens, role checks, admin authorization, no sensitive GET mutations, security tests, and safe generic errors.

### Credential stuffing

The app uses passwordless login, but attackers can still flood login-link and consume-token endpoints. Controls: per-IP and per-email/token hashed rate limits, anti-enumeration responses, single-use tokens, token expiry, session rotation after login, and secure cookies.

### Email abuse

Attackers may abuse magic-link delivery to spam addresses or enumerate accounts. Controls: normalised-email rate limits, cooldown behavior, generic public responses, no raw token logging in production or development, and delivery status recording.

### Content scraping

Attackers may enumerate static assets or API content. Controls: public build excludes the full premium bank, server chooses session questions, premium media requires signed token and active entitlement, rate limiting protects study/media endpoints, and answer/explanation payloads are returned only after answer submission.

### Payment fraud

Attackers may alter prices, forge referrals, replay checkout returns, or claim entitlement without payment. Controls: server-authoritative pricing config, checkout-attempt records, Stripe webhook idempotency, no entitlement from return URL alone, referral/code rules enforced server-side, and admin reconciliation views.

### Webhook replay

Stripe events can be replayed or delivered out of order. Controls: Stripe signature verification, event-ID idempotency with `stripe_event_id`, replay counts, processing status, and webhook event persistence.

### Session theft

Session tokens can be stolen from compromised devices or traffic. Controls: HttpOnly SameSite cookies, Secure cookies on HTTPS/production, no token logging, session expiry, logout all devices, session revocation, and session-token hashes in the database.

### Admin account compromise

Compromised admin accounts can affect users, payments, content, support cases, and exports. Controls: server-side roles, least-privilege permissions, admin route throttling, origin verification for admin mutations, audit logging, no raw secrets in admin responses, confirmation requirements in UI, and no frontend-only authorization.

### Analytics spam

Attackers may spam analytics to distort funnel and learning data. Controls: analytics rate limiting, bounded JSON bodies, allowed event normalization, anonymous/user separation, and admin reporting should avoid claiming statistical certainty from small data.

### Denial of wallet/database abuse

Attackers may create expensive API, AI, email, Stripe, or database load. Controls: configurable limits, body size caps, AI explanation cache, checkout throttling, email cooldown, protected media throttling, and retention cleanup.

### Malicious content input

Inputs from reports, support, admin content edits, referral descriptions, source notes, or generated questions may contain unsafe HTML or payloads. Controls: validation, unsafe-string rejection where appropriate, output escaping by frontend rendering conventions, content review states, and no automatic factual verification.

### Support abuse

Attackers may spam support cases, submit misleading refund/delete requests, or social-engineer access. Controls: account-bound support context where possible, safe generic errors, admin audit log, support status workflow, and no entitlement changes without server-side audit.

## Residual Risks

- In-memory rate limits reset between serverless instances; production should consider Upstash Redis, Vercel KV, or another shared low-latency store if abuse grows.
- CSP currently allows inline scripts/styles because the static app still uses inline page scripts and CSS patterns. A future pass should remove inline requirements and adopt nonces or hashes.
- Admin security depends on the passwordless email channel. Owner/admin email security, device security, and eventual MFA policy are operational requirements.
- Legal retention periods need human approval before destructive cleanup is scheduled.
