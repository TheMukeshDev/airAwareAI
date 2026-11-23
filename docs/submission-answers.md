# Ready-to-paste submission answers

Submission-link policy: the GitHub repository URL is taken from the README. No demo/video or LinkedIn URL is stored or inferred in this repository.

## Deployed link

https://airaware-ai-sigma.vercel.app

Use `/api/health` for the API status check linked from the README.

## Changes / updates

AirAware AI includes a Vite/React frontend and a Flask API deployed as a Vercel Services monorepo. Recent repository changes include SPA deep-link rewrites, a server-side CARTO tile proxy with no browser-exposed map key, a shared-IP-safe signup rate limit fix, Supabase storage and auth fixes, Vercel deployment configuration, and submission hardening. This pass adds CI on push/PR for backend lint, tests and Bandit plus frontend lint, unit tests, accessibility tests and build, a pinned Gitleaks secret-scanning workflow, and submission-readiness documentation. See `README.md` and `docs/problem-alignment.md` for the full mapping.

## Generative AI services used

Google Gemini, called from the backend through the `google-genai` SDK with `GEMINI_MODEL` defaulting to `gemini-2.5-flash`. It powers the grounded assistant chat with sources and rewrites daily-plan and indoor-air summaries; numeric values are computed server-side and checked before rewritten text is accepted. The Gemini key is configured only as backend `GEMINI_API_KEY` and is never exposed to the browser. No image, audio, embedding or RAG service is used; Open-Meteo/CAMS and CARTO are data and map providers, not generative AI services.

## GitHub repository URL

https://github.com/TheMukeshDev/airAwareAI

## Video / demo URL

No demo URL is stored in this repository.

## LinkedIn post URL

No post URL is stored in this repository.

## Notes for evaluators

No demo user is seeded. Register a new account, complete the four-step onboarding, then follow the walkthrough in `README.md` across dashboard, air quality, lifestyle, daily plan, indoor air, impact, assistant, community and settings. The emission factors are a versioned baseline dataset (v1) calibrated for Indian residential and transport activity; impact records remain unverified estimates, not regulatory figures. Indian AQI is computed from modelled concentrations, and assistant/daily-plan text requires Gemini; these limits are documented in `docs/data-and-limitations.md`.
