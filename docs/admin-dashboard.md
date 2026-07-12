# Admin Dashboard

The admin dashboard is available at:

```text
/admin
```

Every admin API verifies the HTTP-only session cookie and checks the user's server-side role. Supported roles are `owner`, `admin`, `content_editor`, and `support`, with permissions restricted by operation. Frontend checks are display-only and must never be treated as authorization.

## Apply The Migration

Run the schema migration before using the dashboard:

```powershell
npm run db:migrate
```

This adds:

- `users.role`
- `entitlements.expires_at`
- `entitlements.revoked_at`
- `admin_audit_log`

## Configure The First Owner In Neon

1. Configure `EMAIL_FROM` and `EMAIL_PROVIDER_API_KEY` so the passwordless login link can be delivered through Resend.
2. Log in once using the email that should own the workspace. This creates or confirms the `users` row.
3. Open the Neon SQL editor.
4. Run this statement with the owner's email:

```sql
insert into users (email, role)
values ('you@example.com', 'owner')
on conflict (email) do update
set role = 'owner',
    updated_at = now();
```

5. Log out and log back in so the session reads the updated role.
6. Open `/admin`.

The commercial Preview owner flow was verified through one-time token consumption, `/api/me`, `/api/admin/stats`, and logout. A configured email provider is still required for ordinary inbox delivery.

Do not expose SQL connection strings, session cookies, magic links, or provider keys in screenshots, docs, or chat.

## Admin v1 Abilities

- View dashboard metrics.
- Search users by email.
- View purchase identifiers and status.
- View entitlement status.
- Grant, revoke, or extend entitlements.
- View question status from the deployed question dataset.
- Filter questions by unreviewed or high-yield status.
- Edit explanations and mark questions approved, rejected, or needing cross-check.
- View flags and attempts summary.

No destructive deletes are implemented in v1. Entitlement removal is a soft revoke, rejected questions stay in the dataset for traceability, and every entitlement or question-review mutation writes an `admin_audit_log` row.
