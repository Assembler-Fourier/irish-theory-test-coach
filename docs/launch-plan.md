# Launch Plan

## Best source strategy

Use two tracks:

1. Primary training content: the question bank you have permission to recover from Theory Tester, including its archived image assets.
2. Current official cross-check: the RSA/Prometric official category A and B revision material, May 2024 edition, plus RSA Rules of the Road.

The official material is the best authority for correctness. The recovered archive is useful because it gives us a ready app dataset and image references, but every public launch should be treated as a learning product that has been checked against the current official material.

## Immediate workflow

1. Let `scripts/recover_theory_tester.py` finish.
2. Run `python .\scripts\validate_dataset.py`.
3. Open the app through the local serverless runtime when testing answer reveal or premium modes, and test:
   - Revise mode loads the generated preview package.
   - Search finds words inside questions and answers.
   - Category filter works.
   - Mock test gives 40 questions and a pass at 35.
   - Review mode shows missed and flagged questions.
4. Compare a sample of questions in every category against current official revision material.
5. Replace any stale wording, road-law references, or images before publishing.

## Product priorities

- Launch first with a fast, clean browser app.
- Add account login only after the core practice flow is strong.
- Add spaced repetition after we have stable data quality.
- Add an admin importer so future official/licensed updates can be dropped in as JSON/CSV.
- Keep source attribution and licence notes in internal documentation.

## Quality gates

- No question should have missing options.
- No question should have zero or multiple correct answers.
- Preview images may load from `public/data/preview-assets/`; premium images must load through protected `/api/v1/media/:token` routes.
- Mobile layout should show the image above answers without text overflow.
- Mock test must not reveal answers until the learner chooses an option.
- Results should show weak categories, not just a score.

## Official reference links

- https://theorytest.ie/book-your-theory-test/driver-theory-test-car-or-bike/
- https://theorytest.ie/revision-material/
- https://www.rsa.ie/services/learner-drivers/resources/rules-of-the-road
