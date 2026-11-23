# AirAware AI

Environmental intelligence for Indian cities: live air quality, exposure-aware daily planning, indoor air guidance, personal carbon tracking, and an assistant that explains it all without inventing numbers.

Frontend: React 19 + Vite + Tailwind v4 + React Router 7 + Recharts + Leaflet
Backend: Flask + Supabase Postgres + Open-Meteo + Gemini

## Live deployment

- App: https://airaware-ai-sigma.vercel.app
- API health: https://airaware-ai-sigma.vercel.app/api/health
- Repository: https://github.com/TheMukeshDev/airAwareAI
- Vercel Services deploys the Vite frontend and Flask backend from this monorepo; `/api/*` routes to the backend and all other routes to the frontend.

## Evaluator walkthrough

No demo user is seeded. Create an account on the Register screen (or with `POST /api/auth/register`), then complete the four-step onboarding before opening the dashboard.

Suggested path for an evaluator:

1. Register and complete onboarding (location, household, commute, goals).
2. Dashboard: read the AQI gauge on both scales, weather strip, pollutant grid, trend, grid readings and recommendations.
3. Air quality: inspect the forecast, ventilation window and model-grid map.
4. Lifestyle: enter transport, home energy, cooking, diet and waste inputs; review the monthly footprint.
5. Daily plan: generate a plan, open an action and mark it complete.
6. Indoor air: complete the questionnaire and review the score and immediate fixes.
7. Impact: log a journey, then review avoided emissions, weekly trend and history.
8. Assistant: ask a grounded question and check the returned sources.
9. Community: view aggregate stats, join a challenge and open the opt-in leaderboard.
10. Settings: change AQI scale, location, notifications and privacy controls.

If a recorded walkthrough is required, paste the user-supplied unlisted video link here before submission. No video URL is fabricated in this repository.

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

See `docs/data-and-limitations.md` for the full list, and `docs/problem-alignment.md` for requirement-to-file mapping and evidence commands.

## Run it locally

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env   # then edit values; never commit .env
.\.venv\Scripts\python.exe app.py
```

The API starts on `http://127.0.0.1:5000`. It reads `SUPABASE_DB_URL` from `backend/.env` and connects to your hosted Supabase Postgres project. The test suite uses an isolated in-memory store and never writes to Supabase.

For a non-development deployment, set `FLASK_ENV=production`, set an explicit `JWT_SECRET_KEY` of at least 32 characters, set `CORS_ORIGINS` to your frontend origin(s), and serve with `waitress-serve --host=127.0.0.1 --port=5000 --call app:create_app`. The app refuses to start in production with generated secrets or without explicit CORS origins, never enables Flask debug by default, sends security headers, and rate-limits login, registration, assistant chat, and air-quality reads.

Apply the schema with the Supabase CLI:

```powershell
npx supabase db push --remote "<SUPABASE_DB_URL>"
```

Create accounts through `POST /api/auth/register` or the Register screen. There is no seeded demo user or sample community data.

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Vite runs on `http://localhost:5173` and proxies `/api` to `http://127.0.0.1:5000`.

### Environment values

Backend (`backend/.env`, server-side only):

- `SUPABASE_DB_URL`: hosted Supabase Postgres connection URI (Dashboard → Connect), not the project URL. For serverless deployments, use the connection pooler URI with IPv4 egress; the direct `db.<ref>.supabase.co` endpoint may be IPv6-only and unreachable from Vercel.
- `GEMINI_API_KEY`: Google AI Studio key for Gemini chat and plan summaries.
- `GEMINI_MODEL` defaults to `gemini-2.5-flash`.
- `CARTO_API_KEY`: CARTO Basemaps key used only by the backend `/api/map/tiles` proxy. `backend/config.py` reads it and `backend/routes/map_tiles.py` appends it to the upstream CARTO request; it is never placed in a response or a browser bundle. Restart the backend after changing it.
- Production also requires explicit `JWT_SECRET_KEY` and `CORS_ORIGINS`, as described above.

Frontend (`frontend/.env` is optional):

- `VITE_API_URL` defaults to `/api` and uses the Vercel rewrite or Vite dev proxy.
- There is no `VITE_CARTO_API_KEY` and no browser-exposed map key. The map client requests `/api/map/tiles/dark_all/{z}/{x}/{y}.png` through `frontend/src/components/map/StationMap.jsx`.

Never commit `.env` or `.env.*` files. The example files are the only environment files meant to be tracked.

## Tests and CI

Two GitHub Actions workflows run on every push and pull request:

- `.github/workflows/ci.yml`: backend Ruff, pytest and Bandit; frontend lint, unit tests, accessibility tests and build.
- `.github/workflows/security.yml`: pinned Gitleaks action for secret scanning.

Exact commands:

```powershell
cd backend
python -m pip install -r requirements.txt -r requirements-dev.txt
ruff check .
pytest -q
bandit -q -c bandit.yaml -r .
```

```powershell
cd frontend
npm ci
npm run lint
npm run test
npm run test:a11y
npm run build
```

The backend suite stubs air quality and Gemini calls, then exercises auth, onboarding, readings, forecast, lifestyle analysis, impact logging, plans, indoor scoring, assistant behavior, community endpoints, rate limiting, token revocation, CORS, security headers, the server-side tile proxy and production secret validation against the isolated test store. The frontend suite covers URL safety, dashboard parsing, a11y, auth flows, error states and component behavior with Vitest, Testing Library and axe.

## API surface

There is no `/api/docs` route in the current Flask app; the older interactive-docs claim has been removed. The implemented endpoints are:

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`
- `GET/PUT /api/profile`, `POST /api/profile/onboarding`, `DELETE /api/profile`
- `GET /api/air-quality/current|forecast|stations`
- `GET /api/map/tiles/<style>/<z>/<x>/<y>.png`
- `GET/POST /api/lifestyle`, `POST /api/lifestyle/analyze`
- `GET /api/daily-plan/today`, `POST /api/daily-plan/generate`, `PATCH /api/daily-plan/<plan>/actions/<action>`
- `POST /api/indoor/assessment`, `GET /api/indoor/recommendations`
- `GET /api/impact/personal|history`, `POST /api/impact/log`
- `POST /api/assistant/chat`, `GET /api/assistant/history`
- `GET /api/community/stats|challenges|leaderboard`, `POST /api/community/challenges/join`
- `GET /api/health`, `GET /api/ready`

All except auth, public air quality endpoints, map tiles and health checks require a bearer token.

## Submission field checklist

- **Deployed app URL:** https://airaware-ai-sigma.vercel.app
- **GitHub repository URL:** https://github.com/TheMukeshDev/airAwareAI
- **Video/demo URL:** `<paste the unlisted link supplied by the team>`
- **LinkedIn post URL:** `<paste the URL supplied by the team>`
- **Changes/updates:** use the concise answer in `docs/submission-answers.md`.
- **Generative AI services used:** Google Gemini via the backend; see `docs/submission-answers.md` for the full answer.
- **Notes for evaluators:** no seeded demo user; follow the walkthrough steps above; video and LinkedIn URLs above are placeholders and must be replaced with user-supplied values before submitting.
- **Before submitting:** confirm both workflows are green, keep all keys in hosting-provider environment settings, and confirm `backend/.env.example` and `frontend/.env.example` remain trackable.

## Layout

```
backend/
  app.py              app factory, CORS, JWT and error handlers
  config.py           environment configuration
  db.py               Supabase Postgres collection adapter and test store
  extensions.py       JWT, rate limiter, token denylist, collections, password hashing
  routes/             one blueprint per feature, including the CARTO tile proxy
  services/           air quality, footprint, planner, indoor, assistant, community
  utils/              validation and HTTP helpers
  data/               versioned emission factors
  tests/              pytest suite
  pyproject.toml      lint configuration
  bandit.yaml         security scan configuration
.github/workflows/
  ci.yml              backend and frontend checks
  security.yml        pinned Gitleaks secret scan
docs/
  data-and-limitations.md
  problem-alignment.md
  submission-answers.md
supabase/
  migrations/         database schema applied with the Supabase CLI
frontend/src/
  pages/ components/ context/ hooks/ services/ lib/
```
