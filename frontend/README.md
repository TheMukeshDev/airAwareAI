# AirAware AI frontend

React 19 + Vite + Tailwind v4 single-page app for the AirAware AI API.

## Commands

```powershell
npm install
npm run dev      # http://localhost:5173, proxies /api to 127.0.0.1:5000
npm run lint
npm run test
npm run test:a11y
npm run build
```

## Structure

- `src/pages/` — route screens (dashboard, air quality, lifestyle, plan, indoor, impact, assistant, community, settings)
- `src/components/` — shared UI, charts, map, and accessibility helpers
- `src/context/` — auth, data, and live-region state
- `src/hooks/` — air quality and reusable browser hooks
- `src/services/` — API clients with JSDoc types
- `src/lib/` — AQI scales, formatting, and URL safety helpers
- `src/test/` and `src/__tests__/` — Vitest setup, module mocks, and accessibility tests

## Notes

- The UI labels modelled grid readings and computed Indian AQI as estimates, never as street-level measurements.
- Daily-plan text and assistant replies come from Gemini; when it is unavailable the API returns 503 rather than invented content.
- External links are restricted to absolute `http(s)` URLs before rendering.
- Map tiles are loaded through the backend `/api/map/tiles` proxy; no CARTO or other browser-exposed map key is used.
