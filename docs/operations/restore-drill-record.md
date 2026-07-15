# Restore Drill Record

Status: completed successfully on 2026-07-11.

The drill used a real Neon non-production branch created from the production branch snapshot. No connection string, password, or private row data is recorded here. The temporary branch is configured to expire automatically on 2026-07-13.

## Drill Fields

- Restoration date: 2026-07-11
- Source backup: Neon branch snapshot of production branch `br-rapid-forest-ahu7bjvn`
- Target environment: `commercial-restore-drill-20260711` (`br-proud-king-ahah0wip`), non-production
- Database connection type used: direct Neon connection with full certificate verification requested
- Row counts:
  - users: 0
  - purchases: 0
  - entitlements: 0
  - attempts: 0
  - flags: 0
  - sessions: 0
  - instructor_codes: 0
  - events: 176
  - support_cases: 0
- Integrity checks:
  - `npm run db:migrate`: pass; migrations `0001` and `0002` applied
  - `npm run db:check`: pass; expected commercial and reliability tables present
  - `npm run ops:reconcile -- --allow-findings`: pass; zero findings
  - `npm run validate`: pass; 1,277 questions validated locally against the same release source
- Elapsed time: approximately 20 seconds for migration, table check, and reconciliation after branch readiness
- Problems: none encountered during the recorded checks
- Follow-up fixes: keep scheduled backup/restore drills after launch and record production row-count growth without including personal data
- Recorded by: AI-assisted project tooling; owner verification required before relying on this as operational evidence
