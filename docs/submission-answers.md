# Ready-to-paste submission answers

Placeholder policy: the GitHub repository URL, video/demo URL and LinkedIn post URL are user-supplied. The placeholders below are intentionally not URLs; replace them before submitting. Do not fabricate or infer those links.

## Deployed link

https://airaware-ai-sigma.vercel.app

Use `/api/health` for the API status check linked from the README.

## Changes / updates

AirAware AI includes a Vite/React frontend and a Flask API deployed as a Vercel Services monorepo. Recent repository changes include SPA deep-link rewrites, a server-side CARTO tile proxy with no browser-exposed map key, a shared-IP-safe signup rate limit fix, Supabase storage and auth fixes, Vercel deployment configuration, and submission hardening. This pass adds CI on push/PR for backend lint, tests and Bandit plus frontend lint, unit tests, accessibility tests and build, a pinned Gitleaks secret-scanning workflow, and submission-readiness documentation. See `README.md` and `docs/problem-alignment.md` for the full mapping.

## Generative AI services used

Google Gemini, called from the backend through the `google-genai` SDK with `GEMINI_MODEL` defaulting to `gemini-2.5-flash`. It powers the grounded assistant chat with sources and rewrites daily-plan and indoor-air summaries; numeric values are computed server-side and checked before rewritten text is accepted. The Gemini key is configured only as backend `GEMINI_API_KEY` and is never exposed to the browser. No image, audio, embedding or RAG service is used; Open-Meteo/CAMS and CARTO are data and map providers, not generative AI services.

## GitHub repository URL

`<paste the GitHub repository URL supplied by the team>`

## Video / demo URL

`<paste the unlisted walkthrough or demo link supplied by the team>`

## LinkedIn post URL

`<paste the LinkedIn post URL supplied by the team>`

## Notes for evaluators

No demo user is seeded. Register a new account, complete the four-step onboarding, then follow the walkthrough in `README.md` across dashboard, air quality, lifestyle, daily plan, indoor air, impact, assistant, community and settings. The emission factors are development placeholders, Indian AQI is computed from modelled concentrations, and assistant/daily-plan text requires Gemini; these limits are documented in `docs/data-and-limitations.md`.
