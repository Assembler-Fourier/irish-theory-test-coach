# Ireland Category B Theory Test Notes

These notes keep the rebuild aligned with the real Irish Driver Theory Test for ordinary car learners.

## Current exam shape

- Test area: Driver Theory Test for car/bike, commonly used for category B car learners.
- Questions per exam: 40 multiple-choice questions.
- Pass mark: 35 correct answers.
- Time limit: 45 minutes.
- Official revision source: RSA/Prometric Driver Theory Test revision material, currently sold through the official TheoryTest.ie revision-material flow.

## Content buckets to support in the app

The archived Theory Tester data appears to use these main buckets:

- Control of Vehicle
- Legal Matters/Rules of the Road
- Managing Risk
- Safe and Responsible Driving
- Technical Matters

Keep category names flexible in code because archived spelling and official wording may differ.

## Recommended product direction

The best public-facing version should not just clone the old site page-for-page. Build a better learner tool around the same authorised question content:

- Quick revise: browse all questions by category, search text, and reveal answers.
- Exam simulator: 40 random questions, timer, flagging, final result, and weak-area summary.
- Mistakes drill: repeat questions the learner got wrong until accuracy improves.
- Image-first road signs: show road-sign images clearly and keep answer controls below them on mobile.
- Progress memory: store local stats without forcing sign-up.
- Admin/data tools later: import updated official/licensed question sets without changing the app.

## Data quality checks before publishing

- Every question has at least two options.
- Every question has exactly one correct answer.
- Every local image referenced in `local_image_paths` exists.
- Category counts look plausible and no category is accidentally empty.
- The final app should clearly say it is a practice/training site unless you are publishing under an official brand/licence.

## Official links

- https://theorytest.ie/
- https://theorytest.ie/book-your-theory-test/driver-theory-test-car-or-bike/
- https://theorytest.ie/revision-material/
- https://www.rsa.ie/services/learner-drivers/resources/rules-of-the-road
