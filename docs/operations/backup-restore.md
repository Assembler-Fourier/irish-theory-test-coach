# Backup And Restore

A backup is not verified until a non-production restoration drill has been completed and recorded.

## Scope

Back up:

- Neon Postgres production database.
- Question-bank source files in `data/`.
- Private media/source storage if configured.
- Vercel project configuration, domains, and environment-variable names.
- Stripe product/price IDs and webhook endpoint configuration.

Do not export plaintext secrets into reports, screenshots, commits, or shared docs.

## Database Backups

Use Neon Backup & Restore / instant restore where available and `pg_dump`/`pg_restore` for portable backups. Neon documentation notes that `pg_dump` should use a direct unpooled connection string.

Recommended schedule:

- Daily database backup or snapshot.
- Retain at least 14 days once commercial traffic starts.
- Keep one monthly export for longer-term operational recovery if storage budget permits.
- Store exports in encrypted storage with access limited to the owner/admin.

## Question Bank And Media

- Keep GitHub as the authoritative source for reviewed JSON/data files.
- Keep a separate encrypted archive of `data/` and private media storage before large import or generation passes.
- Verify the archive by extracting it in a temporary folder and running `npm run validate`.

## Restore Procedure

1. Create or select a non-production Neon target.
2. Restore from Neon instant restore/snapshot or `pg_restore`.
3. Set a non-production `DATABASE_URL`.
4. Run:

```powershell
npm run db:migrate
npm run db:check
npm run ops:reconcile -- --allow-findings --json
npm run validate
```

5. Compare row counts for users, purchases, entitlements, attempts, flags, sessions, instructor codes, events, and support cases.
6. Run a preview app smoke test against a preview deployment.
7. Record the drill.

## Restore Drill Record Template

- Restoration date:
- Source backup:
- Target environment:
- Row counts:
- Integrity checks:
- Elapsed time:
- Problems found:
- Fixes required:
- Recorded by:

The `restore_drills` table exists for storing structured restoration evidence.

Use `docs/operations/restore-drill-record.md` as the human-readable record for the first non-production drill.

## References

- Neon backups: https://neon.com/docs/manage/backups
- Neon Backup & Restore: https://neon.com/docs/guides/backup-restore
- Neon pg_dump/pg_restore: https://neon.com/docs/manage/backup-pg-dump
