# Restore Drill Record

Status: not yet executed in this implementation pass.

This record must be completed after restoring a real Neon backup or `pg_dump` export into a non-production target. A backup is not considered verified until this record is filled with evidence.

## Drill Fields

- Restoration date:
- Source backup:
- Target environment:
- Database connection type used: direct Neon connection or local Postgres
- Row counts:
  - users:
  - purchases:
  - entitlements:
  - attempts:
  - flags:
  - sessions:
  - instructor_codes:
  - events:
  - support_cases:
- Integrity checks:
  - `npm run db:migrate`:
  - `npm run db:check`:
  - `npm run ops:reconcile -- --allow-findings --json`:
  - `npm run validate`:
- Elapsed time:
- Problems:
- Follow-up fixes:
- Recorded by:
