# Source Licensing Register

This register explains how external Irish theory-test material may be used in Irish Theory Test Coach.

The short version: do not scrape or copy competitor question text, answer options, explanations, images, videos, transcripts, Reddit posts, or paid course material into the product unless we have a clear written licence or permission for that exact use.

## Current Findings

### `adamisntdead/theory-test-questions`

- URL: https://github.com/adamisntdead/theory-test-questions
- Status: blocked for product import.
- Reason: the repository is public, but GitHub does not report a repository licence for the data. The README says the dataset was scraped from Theory Tester and that the questions are not the repository author's own material. The package metadata marks code as MIT, but that does not grant rights to the question bank itself.
- Allowed use: licensing outreach, source-risk documentation, and non-verbatim topic research.
- Not allowed: importing the questions, answers, explanations, IDs, images, or close paraphrases into `data/` or the public app.

### Competitor Websites

- Status: blocked unless written permission or a commercial licence is obtained.
- Allowed use: identify broad study themes without copying wording.
- Not allowed: scraping, cloning, importing, or rewriting competitor question banks.

### YouTube Instructors

- Status: research-only unless the creator grants written permission.
- Allowed use: manually note high-level learner pain points, such as "road signs are commonly confusing" or "mock-test timing causes stress".
- Not allowed: copying video scripts, transcripts, screenshots, question wording, diagrams, or paid lesson content.

### Reddit And Forums

- Status: research-only.
- Allowed use: aggregate anonymous themes, complaints, and study anxieties.
- Not allowed: copying posts into the product, naming users, quoting without review, or treating anecdotes as official exam frequency.

### Official RSA/Prometric/TheoryTest.ie Sources

- Status: factual cross-check and topic research only unless a licence explicitly allows republishing.
- Allowed use: verify current rules, topic coverage, exam structure, and public guidance.
- Not allowed: claiming affiliation, copying paid revision material, or presenting any item as an official exam question.

## Approved Content Paths

1. Owner-provided content with documented rights.
2. Written licences from content owners that permit commercial web use.
3. Admin-written source notes based on lawful research.
4. AI-generated original drafts created from approved source notes, then reviewed by an admin.
5. Public factual summaries written in original wording and cross-checked against authoritative sources.

## Import Gate

Before any external question content enters `data/`, all of these must be true:

- The source is listed in `data/external-source-register.json`.
- `import_status` is `approved`.
- `rights_evidence` contains a licence URL, contract reference, or written permission note.
- The content is not copied from a competitor question bank.
- An admin review path marks the question as reviewed before it is shown publicly.

## High-Yield Research Rules

High-yield may mean estimated study priority only. It can be informed by:

- existing user miss rates from our own analytics
- our own mock-test results
- broad learner pain points from research-only sources
- road-sign/image presence
- safety-critical topics
- legal consequence topics
- category coverage gaps

High-yield must never mean official exam frequency or a guarantee that a question will appear.

## Licensing Outreach Checklist

When a useful external source is found:

- Record the URL, owner, contact path, and content type.
- Record current licence status.
- Ask for explicit rights to use text, answer choices, explanations, images, and derivatives in a paid web app.
- Keep a copy of the permission or agreement outside public docs.
- Add only a non-secret reference to `data/external-source-register.json`.
- Import into a private review queue, not directly into the public question bank.

