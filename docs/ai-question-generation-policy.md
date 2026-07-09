# AI Question Generation Policy

This workflow is for admin-only draft creation. Generated questions must never be treated as official, copied, or automatically published.

## Allowed Inputs

Use only source notes that the project has permission to use, such as:

- admin-written topic notes
- original summaries of driving rules or safety principles
- internally reviewed learning notes

Do not paste competitor question banks, scraped pages, paid course text, or copied exam-style wording into source notes.

## Draft Flow

1. An admin adds a manual source note in the admin dashboard.
2. The source note is stored in `source_documents` and split into `source_chunks`.
3. An admin chooses an approved source note and generates draft questions.
4. `/api/admin/generate-questions` prompts the AI to create original exam-style practice questions from the note.
5. The API runs basic duplicate detection against existing public questions and existing generated drafts.
6. Near-duplicates are rejected before they enter the draft queue.
7. Accepted candidates are stored in `generated_questions` with `status = draft`.
8. An admin reviews each draft and marks it `approved` or `rejected`.

Approval marks content as reviewed inside Neon. It does not automatically add content to `public/data` or publish it to learners. A separate explicit export/publish step should be added later if approved generated questions are meant to appear in public practice.

## Required Generated Fields

Each saved draft must include:

- `category`
- `difficulty`
- `high_yield_tags`
- `question_text`
- `options_json`
- `correct_index`
- `explanation`
- `source_ids`
- `status = draft`

## Prompt Rules

The prompt must tell the provider to:

- generate original practice questions
- use the source note as study context only
- avoid copying or closely paraphrasing competitor text
- avoid "official question" wording
- avoid claims about official exam prediction
- avoid claims of RSA, Prometric, or official-provider affiliation

## Duplicate Detection

The first version uses simple token-overlap similarity. If a generated candidate is too similar to an existing public question or a saved generated draft, the API rejects it before saving.

This is a safety filter, not a legal guarantee. Admin review is still required.

## Environment Variables

Set these in Vercel if using an AI provider:

```text
AI_QUESTION_API_KEY
AI_QUESTION_API_URL
AI_QUESTION_MODEL
```

If those are missing, the endpoint uses local draft templates for development and still stores drafts as admin-only review items.

## Manual Test

1. Run `npm run db:migrate`.
2. Log in as an admin.
3. Open `/admin.html`.
4. Add a manual source note.
5. Generate 5 draft questions.
6. Confirm drafts appear in the `AI question drafts` admin section.
7. Open the public practice app and confirm the generated drafts do not appear there.
8. Approve one generated draft.
9. Confirm it is marked approved in admin, but still does not appear in public practice until a separate publishing/export step exists.
