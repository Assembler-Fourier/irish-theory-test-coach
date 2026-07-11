# Content Quality Pipeline

Irish Theory Test Coach uses a deterministic content-quality pipeline to help editors improve the question bank without deleting or hiding owned content automatically.

## What The Pipeline Checks

- Canonical category mapping with original category metadata preserved.
- Exact duplicate stems.
- Normalised duplicate stems.
- Same question and answers with options in a different order.
- Same image plus repeated question stem.
- Near-duplicate stems using token similarity.
- Repeated stems with conflicting saved correct answers.
- Structural lint findings such as duplicate options, missing answers, weak explanations, malformed image paths, missing image alt text, unsafe HTML, spelling issues, and inconsistent Irish/British English.

## Editorial States

The database separates ownership, structural validation, factual review, and publication state:

- `ownership_status`
- `structural_status`
- `factual_status`
- `publication_status`

Never mark a question as factually verified only because it passed linting or duplicate analysis.

## Reports

Run:

```powershell
npm run content:quality
```

Generated files are written under `reports/content/`:

- `content-quality-summary.json`
- `content-quality-summary.md`
- `duplicate-groups.csv`
- `conflicting-answer-groups.csv`
- `category-mapping.csv`
- `editorial-backlog.csv`

The reports do not remove questions or change saved answers.

## Admin Workflow

The admin dashboard content-quality section lets an admin:

- Compare duplicate and conflicting variants.
- Mark variants as legitimate.
- Select a canonical question ID.
- Merge progress reporting into a canonical ID while preserving original attempts.
- Record stem rewrites and category changes as versioned editorial decisions.
- Archive redundant records through an auditable decision.
- Publish a recorded decision.

Every mutation requires server-side admin authorization and writes an `admin_audit_log` row plus a `question_quality_decisions` row.

## Learner Feedback

The quiz feedback panel includes “Report a problem with this question”. Reports are stored in `question_problem_reports` with the question ID, reason category, optional comment, app version, content version, anonymous/account identifier when available, and review state.
