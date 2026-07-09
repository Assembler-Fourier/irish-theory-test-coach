# Admin Dashboard

The admin dashboard lives at:

```text
/admin.html
```

Every admin API verifies the httpOnly session cookie and checks `users.role = 'admin'` server-side. Frontend checks are display-only and must never be treated as authorization.

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

## Promote The First Admin In Neon

1. Log in once through magic-link login using the email that should become admin. This creates or confirms the `users` row.
2. Open the Neon SQL editor.
3. Run this statement with your admin email:

```sql
insert into users (email, role)
values ('you@example.com', 'admin')
on conflict (email) do update
set role = 'admin',
    updated_at = now();
```

4. Log out and log back in so the session reads the updated role.
5. Open `/admin.html`.

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
