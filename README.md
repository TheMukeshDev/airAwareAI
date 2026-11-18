# AirAware AI

Environmental intelligence for Indian cities: live air quality, exposure-aware daily planning, indoor air guidance, personal carbon tracking, and an assistant that explains it all without inventing numbers.

Frontend: React 19 + Vite + Tailwind v4 + React Router 7 + Recharts + Leaflet
Backend: Flask + Supabase Postgres + Open-Meteo + Gemini

## Live deployment

- App: https://airaware-ai-sigma.vercel.app
- API health: https://airaware-ai-sigma.vercel.app/api/health
- Vercel Services deploys the Vite frontend and Flask backend from this monorepo; `/api/*` routes to the backend and all other routes to the frontend.

## Demo

> **Before submitting:** replace this block with an unlisted YouTube or Drive link that anyone with the link can view, plus a short written walkthrough. Do not fabricate a link.

## What is inside

| Area | Screens |
| --- | --- |
| Public | Landing, Login, Register |
| Setup | Four-step onboarding (location, household, commute, goals) |
| Dashboard | AQI gauge with both scales, weather strip, pollutant grid, 48h trend, nearby grid readings, recommendations |
| Air quality | Detailed pollutants, forecast chart, ventilation window, model-grid map |
| Lifestyle | Transport, home energy, cooking, diet, waste inputs and a monthly footprint breakdown |
| Daily plan | Generated actions with outdoor windows, safety notes, CO2 savings and completion tracking |
| Indoor air | Questionnaire scoring, immediate fixes, grouped recommendations |
| Impact | Avoided emissions totals, weekly trend, journey logging, history |
| Assistant | Grounded chat with sources and suggested questions |
| Community | Aggregate statistics, challenges, leaderboard |
| Settings | Profile, location, AQI scale, notifications, privacy controls |

## Data and honesty rules

- Air quality comes from Open-Meteo's CAMS-based air quality API for the nearest model grid cell. The UI says so; these are not physical monitors on your street.
- US AQI is taken from the provider. The Indian National AQI is **computed** from modelled 24-hour concentrations using CPCB sub-index breakpoints and is labelled as computed. No API returns a ready-made Indian AQI for these coordinates.
- Emission factors live in `backend/data/emission_factors_v1.json`, are versioned, and are explicitly development placeholders. Every savings number in the UI carries the version and an estimated-vs-verified distinction.
- Gemini is required for chat and for written daily-plan summaries. It receives a compact data context and must return schema-validated JSON. If Gemini is missing or fails, the API returns `503` instead of falling back to invented or rule-based answers.

See `docs/data-and-limitations.md` for the full list.

## Run it locally

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env   # then edit values
.\.venv\Scripts\python.exe app.py
```

The API starts on `http://127.0.0.1:5000`. It reads `SUPABASE_DB_URL` from `backend/.env` and connects to your hosted Supabase Postgres project. The test suite uses an isolated in-memory store and never writes to Supabase.

For a non-development deployment, set `FLASK_ENV=production`, set an explicit `JWT_SECRET_KEY` of at least 32 characters, set `CORS_ORIGINS` to your frontend origin(s), and serve with `waitress-serve --host=127.0.0.1 --port=5000 --call app:create_app`. The app refuses to start in production with generated secrets or without explicit CORS origins, never enables Flask debug by default, sends security headers, and rate-limits login, registration, assistant chat, and air-quality reads.

Apply the schema with the Supabase CLI:

```powershell
npx supabase db push --remote "<SUPABASE_DB_URL>"
```

Create accounts through `POST /api/auth/register` or the Register screen. There is no seeded demo user.

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Vite runs on `http://localhost:5173` and proxies `/api` to `http://127.0.0.1:5000`.

Required environment values:

- `SUPABASE_DB_URL`: hosted Supabase Postgres connection URI (Dashboard → Connect), not the project URL. For serverless deployments, use the connection pooler URI with IPv4 egress; the direct `db.<ref>.supabase.co` endpoint may be IPv6-only and unreachable from Vercel.
- `GEMINI_API_KEY`: Google AI Studio key for Gemini chat and plan summaries.
- `GEMINI_MODEL` defaults to `gemini-2.5-flash`.

## Tests and checks

```powershell
cd backend
pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest tests -q
.\.venv\Scripts\ruff.exe check .
.\.venv\Scripts\python.exe -m bandit -q -c bandit.yaml -r .
```

```powershell
cd frontend
npm run lint
npm run test
npm run test:a11y
npm run build
```

The backend suite stubs air quality and Gemini calls, then exercises auth, onboarding, readings, forecast, lifestyle analysis, impact logging, plans, indoor scoring, assistant behavior, community endpoints, rate limiting, token revocation, CORS, security headers, and production secret validation against the isolated test store. The frontend suite covers URL safety, dashboard parsing, a11y, and component behavior with Vitest, Testing Library, and jest-axe.

## API surface

Interactive docs: `http://127.0.0.1:5000/api/docs` (OpenAPI JSON at `/api/openapi.json`).

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`
- `GET/PUT /api/profile`, `POST /api/profile/onboarding`, `DELETE /api/profile`
- `GET /api/air-quality/current|forecast|stations`
- `GET/POST /api/lifestyle`, `POST /api/lifestyle/analyze`
- `GET /api/daily-plan/today`, `POST /api/daily-plan/generate`, `PATCH /api/daily-plan/<plan>/actions/<action>`
- `POST /api/indoor/assessment`, `GET /api/indoor/recommendations`
- `GET /api/impact/personal|history`, `POST /api/impact/log`
- `POST /api/assistant/chat`, `GET /api/assistant/history`
- `GET /api/community/stats|challenges|leaderboard`, `POST /api/community/challenges/join`
- `GET /api/health`, `GET /api/ready`

All except auth and public air quality endpoints require a bearer token.

## Layout

```
backend/
  app.py              app factory, CORS, JWT and error handlers
  config.py           environment configuration
  db.py               Supabase Postgres collection adapter and test store
   extensions.py       JWT, rate limiter, token denylist, collections, password hashing
   routes/             one blueprint per feature
   services/           air quality, footprint, planner, indoor, assistant, community
   utils/              validation and HTTP helpers
   data/               versioned emission factors
   tests/              pytest suite
   pyproject.toml      lint configuration
   bandit.yaml         security scan configuration

supabase/
  migrations/         database schema applied with the Supabase CLI
frontend/src/
  pages/ components/ context/ hooks/ services/ lib/
```
