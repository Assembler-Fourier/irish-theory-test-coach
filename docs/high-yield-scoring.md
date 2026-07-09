# High-Yield Scoring

High-yield scores are transparent study-priority estimates. They are not official exam-frequency claims and must not be presented as predictions of what will appear on a real test.

Each question gets a `score_breakdown` object with these components:

- `archived_hardest_signal`: archived hardest-question list signal, weighted by archived rank and low archived correct rate where available
- `road_sign_or_image_signal`: visual practice signal for image, sign, or road-marking questions
- `safety_critical_signal`: safety wording such as hazards, braking, vulnerable road users, alcohol/drugs, speed, emergencies, or poor conditions
- `legal_consequence_signal`: rules wording such as must/never, Garda, tax, insurance, speed limits, giving way, signs, markings, or overtaking
- `category_priority_signal`: category-level study priority for core Irish Category B topics
- `user_miss_rate_signal`: optional signal from exported server attempt stats, when available

The public UI uses the same breakdown for the `Why high-yield?` panel. It may show:

- commonly missed
- road sign/image
- safety-critical
- legal/rules

The current high-yield threshold is `68`; critical threshold is `82`.

Before publishing data changes, run:

```powershell
python scripts/enrich_dataset.py
npm run validate
npm run build
```
