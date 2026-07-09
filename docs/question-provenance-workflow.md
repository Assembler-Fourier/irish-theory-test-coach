# Question Provenance And QA Workflow

Each question carries provenance and review fields:

- `source_type`
- `source_reference`
- `reviewed_status`
- `reviewed_by`
- `reviewed_at`
- `notes`
- `safe_to_show`

Existing recovered archive questions are marked `needs_official_cross_check`. This means they can remain in the current practice dataset, but they should not be described as official, verified, or guaranteed to appear in any exam.

AI-generated questions must stay hidden unless an admin reviews and approves them. The public app does not publish `ai_generated` questions unless `reviewed_status` is `approved` and `safe_to_show` is true.

## Admin Review

1. Open `/admin.html`.
2. Use `Review -> Unreviewed` to find questions that need cross-checking.
3. Use `High-yield` to prioritise important questions.
4. Select a question row.
5. Edit the explanation if needed.
6. Add review notes.
7. Mark the item:
   - `Approve`
   - `Reject`
   - `Needs check`

Each review action writes:

- a `question_reviews` row
- a `question_versions` row
- an `admin_audit_log` row

## QA Checklist

Generate a high-yield review checklist:

```powershell
npm run qa:checklist
```

The report is written to `reports/content/qa-checklist-high-yield.md`.
