# Data sources, methods and limitations

## Air quality

- Provider: Open-Meteo Air Quality API, which serves CAMS model output for the nearest grid cell.
- Fields used: PM2.5, PM10, NO2, SO2, O3, CO, US AQI, European AQI, plus hourly series for trends and the best ventilation window.
- The provider does not return an Indian National AQI for these coordinates. AirAware computes one from modelled 24-hour pollutant means with CPCB sub-index breakpoints and labels it "CPCB-style computed".
- Model output is not a monitor on your street. Local hotspots, indoor infiltration and street-level traffic effects are not represented.
- Responses are cached for `CACHE_TTL_SECONDS` (default 600). If the provider fails, the last cached payload is served and flagged `stale: true`. If nothing is cached, the endpoint returns `503` rather than inventing a reading.
- "Nearby stations" are sampled CAMS grid cells, not physical monitoring stations. The map labels them accordingly.

### CPCB sub-index breakpoints used

| Pollutant | Averaging | Breakpoints (µg/m³, except CO mg/m³) |
| --- | --- | --- |
| PM2.5 | 24 h | 0–30–60–90–120–250 |
| PM10 | 24 h | 0–50–100–250–350–430 |
| NO2 | 24 h | 0–40–80–180–280–400 |
| SO2 | 24 h | 0–40–80–380–800–1600 |
| O3 | 8 h | 0–50–100–168–208–748 |
| CO | 8 h | 0–1–2–10–17–34 |

The reported Indian AQI is the maximum sub-index, and the responsible pollutant is shown alongside it. Because these use a trailing 24-hour mean from a forecast-plus-observation series, values can differ from an official CPCB station bulletin.

## Emissions

`backend/data/emission_factors_v1.json` is a development factor set (`v1-dev`):

- Transport per passenger-km: walk/cycle 0, metro 0.017, bus 0.041, motorcycle 0.043, petrol car 0.171, diesel car 0.158, carpool 0.057 (three occupants).
- Grid electricity 0.71 kg CO2e/kWh, shared across the household.
- LPG 42.46 kg CO2e per 14.2 kg cylinder; PNG, electric and biomass cooking use monthly household estimates.
- Diet monthly per person: vegetarian 65, mixed 110, high-meat 180 kg CO2e.
- Waste monthly per household: 9 kg base, adjusted for segregation, composting and single-use avoidance.
- Flights: 180 kg CO2e per economy flight assuming 1,200 km.

These are broad placeholders chosen so the product can compute consistently. Replace them with documented national factors before any public or regulatory reporting. The API returns `factor_version` everywhere and marks records `verified: false`.

## Storage

- Application records live in Supabase Postgres in `public.airaware_documents`, a JSONB document table applied by `supabase/migrations/20261118000000_airaware_documents.sql`.
- Row level security is enabled with no public policies. The Flask API connects with the database URL; browser clients never receive direct table access.
- The test suite uses an in-memory store and does not write to Supabase.
- There is no demo account or sample community data seeded at startup.

## Assistant

- Gemini (`gemini-2.5-flash` by default) receives a compact context: current AQI on both scales, pollutant concentrations, source, ventilation window and a short lifestyle summary.
- The model is instructed not to invent readings, to name the AQI scale, and not to give medical advice.
- Chat replies and daily-plan wording require Gemini. Missing configuration or a provider failure returns `503`; there is no rules-based answer fallback.
- Plan candidate actions and emissions math are computed from the supplied data; Gemini rewrites titles, summaries and explanations without changing numeric values.
- Sources are returned with each answer and rendered in the chat.

## Privacy

- Community totals are aggregates only: member count, collective avoided emissions, per-member average, and an opt-in leaderboard that shows display names and avoided kg.
- Individual journeys, coordinates and household profiles are never exposed through community endpoints.
- The leaderboard uses self-logged estimates and states that they are not verified.

## Health

AirAware gives exposure-reduction suggestions, not medical advice. It does not diagnose or treat conditions. Users with symptoms are pointed to a clinician.
