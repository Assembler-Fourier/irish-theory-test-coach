# Release Runbook

Irish Theory Test Coach ships through small pull requests into a protected `main` branch. Do not push direct production edits, do not merge large generated-content PRs without review, and do not deploy production automatically from local machines.

## Branch Discipline

- Protect `main` in GitHub.
- Require the `Pull request reliability checks` workflow and the `Security checks` workflow before merge.
- Require at least one reviewer for commercial, payment, access-control, database, or content-publication changes.
- Keep PRs small: one pass, one clear objective, one migration set, one commit theme.
- Do not continue creating 1000-file feature PRs; split generated reports/assets from application logic where possible.
- Use `codex/*` branches for implementation work and merge through reviewed PRs.
- Emergency hotfixes use `codex/hotfix-YYYYMMDD-short-name`, run the same checks, then merge through the fastest review path allowed by branch protection.

## Pull Request Checks

The PR workflow runs:

- `npm ci`
- `npm run check:syntax`
- `npm run validate`
- `npm run build`
- `npm run content:quality`
- `npm run check:stale-build`
- `npm run check:migrations`
- `npm run check:pwa`
- `npm run check:compliance`
- `npm run check:growth`
- `npm run check:seo`
- `npm run check:performance`
- `npm run check:sources`
- `npm run check:headers`
- `npm run check:secrets`
- `npm run test`
- `npm run test:visual`

## Main Release

1. Merge only after required checks pass.
2. The main workflow repeats `npm run qa`.
3. The release-manifest job stamps `PUBLIC_BUILD_COMMIT` and `PUBLIC_BUILD_DATE`, runs `npm run build`, and uploads `public/release-manifest.json`.
4. Production deployment requires a manual `workflow_dispatch` run with `deploy_production=true`.
5. Configure the GitHub `production` environment with required reviewers before enabling the deploy job.
6. The deploy job pulls Vercel production env, builds with `vercel build --prod`, deploys with `vercel deploy --prebuilt --prod`, and runs post-deploy smoke checks.

## Database Migrations

- Add SQL files under `database/migrations/` using `0003_short_name.sql` format.
- Migrations are applied by `scripts/db-migrate.mjs`, which wraps each migration in a transaction and records checksum, duration, and status in `schema_migrations`.
- Prefer `create table if not exists`, `alter table ... add column if not exists`, and idempotent indexes.
- Run `npm run check:migrations` before opening a PR.
- Fresh database test: create a temporary Neon branch or local Postgres database, set `DATABASE_URL`, then run `npm run db:migrate` and `npm run db:check`.
- Current schema test: run `npm run db:migrate` against the staging/preview database before production.
- Do not edit an applied migration. Add a new numbered migration.

## Required GitHub Secrets

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `DATABASE_URL` for scheduled reconciliation
- `RATE_LIMIT_SALT`
- `MONITORING_WEBHOOK_URL` if external monitoring is enabled

## Manual Production Approval

Use GitHub Environments for production approval. The workflow references the `production` environment, but reviewers must be configured in repository settings.

## Post-Deploy Smoke

Run:

```powershell
npm run smoke:postdeploy -- https://your-production-domain.example
```

The smoke test checks homepage, preview package, `/api/health`, pricing config, restore generic response, unauthorized admin rejection, sitemap, robots, PWA manifest, and protected premium rejection. It does not create Stripe Checkout sessions or real charges.

## References

- GitHub workflow syntax: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
- GitHub deployment environments: https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments
- Vercel deployments: https://vercel.com/docs/deployments
