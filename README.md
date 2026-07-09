# Irish Theory Test Rebuild

This workspace is set up to recover the archived Theory Tester question bank and run a replacement practice app for the Irish category B car theory test.

## 1. Recover the data

```powershell
cd "C:\Users\uzair\OneDrive\Documents\theory tester"

$env:PYTHONUNBUFFERED = "1"
$env:RECOVERY_WORKERS = "24"

python .\scripts\recover_theory_tester.py 2>&1 | Tee-Object -FilePath .\recovery.log
```

If the run stops, rerun the same command. The script resumes from `data/raw/questions/`.

If Wayback refuses a lot of connections or the report shows many warnings, use the fallback pass. It tries older archived snapshots for each missing question:

```powershell
$env:PYTHONUNBUFFERED = "1"
$env:RECOVERY_WORKERS = "8"
$env:RECOVERY_SNAPSHOT_LIMIT = "20"

python .\scripts\recover_theory_tester.py 2>&1 | Tee-Object -FilePath .\recovery-fallback.log
```

Expected generated files:

```text
data/questions.json
data/questions.csv
data/recovery_report.json
data/assets/
```

## 2. Validate the recovered dataset

```powershell
python .\scripts\validate_dataset.py
```

This checks for missing answer choices, missing correct answers, duplicate IDs, category counts, and missing local image files.

## 3. Enrich the dataset

```powershell
python .\scripts\enrich_dataset.py
```

This creates:

```text
data/questions.enriched.json
data/hardest_questions.json
data/study_report.json
```

The enrichment adds high-yield scores, archived hardest-question signals, road-sign labels, and study-priority notes.

## 4. Prepare deployable public data

```powershell
npm run build
```

This copies the app-ready data and images into `public/data/`, which is the folder Vercel deploys.

## 5. Run the practice app

Serve the repo root so the app can fetch `data/questions.json` and image files:

```powershell
python -m http.server 5173
```

Open:

```text
http://localhost:5173/public/
```

For a Vercel-style local check after `npm run build`, the app loads:

```text
public/data/questions.enriched.json
public/data/assets/
```

## App features

- Practice mode with instant feedback, explanations, category filtering, search, and image support.
- High-yield drill using archived hardest-question data and category/safety/sign signals.
- Hardest 50 drill from the archived Theory Tester stats page.
- Road-sign/image drill.
- Mock exam mode using the real car/bike theory-test shape: 40 questions, 45 minutes, pass mark 35.
- Local progress tracking in the browser: attempts, misses, accuracy, flagged questions, and weak categories.
- Review mode for missed or flagged questions.

## Deploy to Vercel

The project includes:

```text
package.json
vercel.json
scripts/prepare-public-data.mjs
```

Vercel should use:

```text
Build command: npm run build
Output directory: public
```

For paid accounts later, create a Neon Postgres project and run:

```text
database/schema.sql
```

Or run the migration script:

```powershell
$env:DATABASE_URL = "postgresql://..."
npm run db:migrate
npm run db:check
Remove-Item Env:\DATABASE_URL
```

Do not commit `.env.local` or real connection strings. This repo tracks `.env.example` only.

## Official cross-check sources

- RSA Driver Theory Test official site: https://theorytest.ie/
- Car or bike test format: https://theorytest.ie/book-your-theory-test/driver-theory-test-car-or-bike/
- Official revision material: https://theorytest.ie/revision-material/
- RSA Rules of the Road: https://www.rsa.ie/services/learner-drivers/resources/rules-of-the-road

Use the recovered archive with your permission/licence. For live public publishing, cross-check critical answers against the current official RSA material before launch.
