# Ready-to-paste submission answers

Challenge: [Challenge 6] Urban Air Quality Assistant.

Submission-link policy: the GitHub repository, deployed app, demo video and LinkedIn post URLs are recorded in `README.md` and this file.

## Deployed link

https://airaware-ai-sigma.vercel.app/

Use `/api/health` for the API status check linked from the README.

## GitHub repository URL

https://github.com/TheMukeshDev/airAwareAI

## Video / demo URL

https://drive.google.com/file/d/1UBJfqxK98T6qnUIR-wvZQTPEAfkKPj5O/view?usp=drivesdk

## LinkedIn post URL

https://www.linkedin.com/posts/themukeshdev_buildwithai-promptwarsvirtual-challenge6-ugcPost-7530514418300858368-WeM3/

## Changes / updates

Refactored the full-stack monorepo (React 19 + Vite frontend, Flask backend on Vercel with Supabase Postgres) for SOLID modularity, security, accessibility and full backend coverage.

- **Architecture and code quality:** McCabe cyclomatic complexity is `<= 6` across all backend modules with 0 Ruff C901 warnings; Protocol-based providers and rule tables are extracted; all 10 React pages are split into modular subcomponents under 180 lines; `backend/db.py` is now a `backend/db/` package.
- **Dual-scale AQI and grounded Gemini:** live US AQI plus computed Indian CPCB sub-indices, with schema-validated Gemini JSON responses that fail closed with HTTP `503` instead of invented data.
- **Security and accessibility:** confirmation guards on profile deletion, strict input validation, security audit logging with 0 Bandit findings, and WCAG/ARIA landmarks on charts and maps.
- **Testing:** expanded to 180 backend tests (100% statements, 99.91% branches) and 104 frontend tests (94.75% lines, 14 axe checks).
- **Deployment:** SPA deep-link rewrites, a server-side CARTO tile proxy with no browser-exposed map key, a shared-IP-safe signup rate limit fix, Supabase storage and auth fixes, Vercel deployment configuration, CI on push/PR, and a pinned Gitleaks secret-scanning workflow.

## Generative AI services used

**Generative AI service utilized:** Google Gemini API (`gemini-2.5-flash` by default, configured through `GEMINI_MODEL` in the Flask backend).

**Where it is utilized:**

- **Grounded environmental assistant** (`POST /api/assistant/chat`, `backend/routes/assistant.py`, `backend/services/gemini_service.py`): answers user questions about local air quality, pollutant risks and mitigation steps. It receives a compact context payload of the user's live readings and profile and returns schema-validated JSON with explicit source citations.
- **Exposure-aware daily plan summaries** (`POST /api/daily-plan/generate`, `backend/routes/daily_plan.py`, `backend/services/recommendation_engine.py`): generates personalized daily action summaries, outdoor exposure windows and safety guidance from current AQI forecasts and user commute/household inputs.
- **Indoor-air wording** (`backend/routes/indoor_air.py`, `backend/services/indoor_engine.py`): optionally rewrites questionnaire-based guidance while numeric scoring stays server-side.

**Strict anti-hallucination guardrails:** Gemini is required for chat and daily-plan wording; if the API key is missing or the service fails, the backend explicitly returns HTTP `503` rather than falling back to fabricated or rule-based placeholder text. Numeric tokens in generated text are checked against computed server-side context before acceptance. The Gemini key is configured only as backend `GEMINI_API_KEY` and is never exposed to the browser. No image, audio, embedding or RAG service is used; Open-Meteo/CAMS and CARTO are data and map providers, not generative AI services.

## Notes for evaluators

No demo user is seeded. Register a new account, complete the four-step onboarding, then follow the walkthrough in `README.md` across dashboard, air quality, lifestyle, daily plan, indoor air, impact, assistant, community and settings. The emission factors are a versioned baseline dataset (v1) calibrated for Indian residential and transport activity; impact records remain unverified estimates, not regulatory figures. Indian AQI is computed from modelled concentrations, and assistant/daily-plan text requires Gemini; these limits are documented in `docs/data-and-limitations.md`.

## Prior evaluation score

AI Evaluation Score: 95.51/100 on the previous attempt. The current local projection after the latest fixes is 100/100; the official score requires a fresh evaluation run.
