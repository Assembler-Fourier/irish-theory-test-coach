# AI Explanation Coach

The explanation coach adds a short learner-friendly note after a user answers a question. It is for existing questions only and must not create or publish new question content.

## Runtime Flow

1. The frontend sends the answered question to `/api/ai-explain`.
2. The API rate limits the request by logged-in user ID, or by a hashed guest IP/user-agent key.
3. The API checks `ai_explanations` for a cached explanation using `question_id + selected_answer_hash`.
4. If cached, it returns the saved explanation.
5. If no cache exists and an AI provider key is configured, the API asks the provider for concise JSON.
6. If no provider key is configured, or the provider fails, the API returns a safe non-AI fallback explanation.
7. The final explanation is cached in Neon to control cost.

## Environment Variables

Set these in Vercel production environment variables:

```text
DATABASE_URL
PUBLIC_SITE_URL
AI_EXPLANATION_API_KEY
AI_EXPLANATION_API_URL
AI_EXPLANATION_MODEL
```

`AI_EXPLANATION_API_KEY` is optional for launch. Without it, the endpoint still returns fallback explanations. The default API URL is OpenAI-compatible chat completions, but production should set all three AI variables explicitly.

Never expose AI provider keys in `public/`, static data, screenshots, logs, docs, or frontend config.

## Database Migration

Run:

```powershell
npm run db:migrate
```

This creates:

- `ai_explanations`
- `ai_explanation_rate_limits`

## Safety Rules

The provider prompt instructs the model to:

- avoid official exam prediction claims
- avoid RSA affiliation claims
- avoid inventing legal certainty beyond the supplied question content
- use only the supplied question, answer choices, correct answer, selected answer, and category

Keep responses concise. Do not use this endpoint to generate new questions or answer banks.

## Rate Limits

Current limits:

- logged-in users: 30 requests per hour
- guests: 8 requests per hour

Cached explanations still count toward the request limit to reduce abuse.

## Manual Test

1. Run the database migration in the target environment.
2. Start the site locally or deploy to Vercel.
3. Answer a question correctly.
4. Click `Explain this`.
5. Confirm the explanation includes:
   - short explanation
   - your answer review
   - memory tip
   - topic tags
6. Answer another question incorrectly.
7. Click `Explain this`.
8. Confirm the answer review explains that the selected answer does not match the saved correct answer.
9. Reload and click `Explain this` for the same question and same selected answer.
10. Confirm the response is returned from cache in the API payload.

When no AI provider key is configured, repeat the same test and confirm the fallback explanation still appears.
