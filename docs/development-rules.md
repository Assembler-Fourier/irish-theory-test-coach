# Development Rules

Irish Theory Test Coach is an independent Irish Category B theory-test practice app. Future contributors must protect the product's legal position, payment security, and current MVP stability.

## Claims

- Do not say the app is official RSA, official Prometric, or affiliated with either.
- Do not promise a guaranteed pass.
- Do not claim official exam frequency or say specific questions appear every time.
- Use safer language: practice, high-yield, commonly missed, archived hardest, and core exam themes.

## Content

- Do not scrape or copy competitor question text.
- Add only content the project has rights or permission to use.
- AI-generated questions are draft-only until an admin reviews and approves them.

## Payments And Security

- Premium unlocks must be verified on the server.
- Do not expose secrets in frontend code or public assets.
- Store real secrets only in environment variables.
- Admin features must have server-side admin authorization.

## Architecture

- Keep the current MVP working unless a framework migration is explicitly requested.
- Static frontend: `public/`
- Serverless API: `api/`
- Database schema: `database/schema.sql`
- Question data: `data/`

## Required Checks

Before finishing a change, run:

```powershell
npm run validate
npm run build
```

Run `node --check` on every changed JavaScript file.

Report the command results in the final handoff.
