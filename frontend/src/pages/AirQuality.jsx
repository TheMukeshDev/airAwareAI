import { useEffect, useMemo, useState } from "react";
import { Clock3, Database, ExternalLink, Info, MapPinned, RefreshCw } from "lucide-react";
import { PageHeader } from "../components/common/PageHeader";
import { Button } from "../components/common/Button";
import { Badge } from "../components/common/Badge";
import { Card, CardDescription, CardHeader, CardTitle } from "../components/common/Card";
import { Segmented } from "../components/common/Toggle";
import { DataNote } from "../components/common/DataNote";
import { PollutantGrid } from "../components/dashboard/PollutantGrid";
import { StationMap } from "../components/map/StationMap";
import { TrendChart } from "../components/charts/Charts";
import { LiveAnnouncer } from "../components/common/LiveAnnouncer";
import { useAirQuality, useForecast, useUserCoords } from "../hooks/useAirQuality";
import { useAuth } from "../context/AuthContext";
import { airQualityApi, apiError } from "../services/api";
import { classifyAqi, aqiScaleLabel } from "../lib/aqi";
import { cn, formatDateTime, formatNumber, relativeTime, safeExternalUrl } from "../lib/utils";

const METRICS = [
  { value: "aqi", label: "AQI" },
  { value: "pm2_5", label: "PM2.5" },
  { value: "pm10", label: "PM10" },
];

export function AirQuality() {
  const { user } = useAuth();
  const coords = useUserCoords(user);
  const [scale, setScale] = useState(user?.preferences?.aqi_scale ?? "us");

  const { data: reading, loading, error, refresh } = useAirQuality(coords);
  const { data: forecast, loading: forecastLoading } = useForecast(coords, 48);
  const [metric, setMetric] = useState("aqi");
  const [stations, setStations] = useState([]);
  const [stationState, setStationState] = useState({ loading: true, error: null });
  const [activeStation, setActiveStation] = useState(null);

  useEffect(() => {
    let cancelled = false;
    airQualityApi
      .stations(coords)

      .then((data) => {
        if (cancelled) return;
        const list = data.stations ?? [];
        setStations(list);
        setActiveStation(list[0] ?? null);
        setStationState({ loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled) setStationState({ loading: false, error: apiError(err, "Nearby reference points unavailable.") });
      });
    return () => {
      cancelled = true;
    };
  }, [coords]);


  const announcement = loading
    ? "Loading air quality data."
    : error
      ? `Air quality unavailable: ${error}`
      : stationState.error
        ? stationState.error
        : reading
          ? "Air quality data updated."
          : "";


  const displayAqi = scale === "india" ? reading?.aqi_india : reading?.aqi;
  const scaleUnavailable = displayAqi === null || displayAqi === undefined;
  const category = classifyAqi(displayAqi, scale);
  const sourceUrl = safeExternalUrl(reading?.source_url);

  const chartData = useMemo(() => {
    const hourly = forecast?.hourly ?? [];
    return hourly.slice(0, 24).map((entry) => {
      const value =
        metric === "aqi"
          ? scale === "india"
            ? entry.india_aqi
            : entry.us_aqi
          : entry[metric];
      return {
        label: new Date(entry.time).toLocaleTimeString("en-GB", { hour: "2-digit" }),
        value: value ?? null,
      };
    });
  }, [forecast, metric, scale]);

  const hourlyCards = (forecast?.hourly ?? []).slice(0, 8);
  const daily = forecast?.daily ?? [];

  return (
    <div className="space-y-5">
      <LiveAnnouncer message={announcement} />
      <PageHeader
        eyebrow="Module 01"
        title="Air quality explorer"
        description={`Readings for ${reading?.location?.name || user?.location?.city || "your location"} with the reporting scale, source and observation time always visible.`}
        actions={
          <>
            <Segmented
              value={scale}
              onChange={setScale}
              ariaLabel="AQI scale"
              options={[
                { value: "us", label: "US AQI" },
                { value: "india", label: "India AQI" },
              ]}
              size="sm"
            />
            <Button variant="secondary" size="sm" onClick={() => refresh()}>
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} aria-hidden="true" />
              Refresh
            </Button>
          </>
        }
      />

      {error ? (
        <div role="alert" className="rounded-xl border border-verypoor/25 bg-verypoor/[0.06] p-3 text-[12.5px] text-verypoor/90">
          {error}
        </div>
      ) : null}
      {stationState.error ? (
        <div role="alert" className="rounded-xl border border-moderate/25 bg-moderate/[0.06] p-3 text-[12.5px] text-moderate/90">
          {stationState.error}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card className="p-4 sm:p-5">
          <CardHeader
            action={
              <Badge tone="neutral">
                {category.value === null ? "No reading" : `${aqiScaleLabel(scale)} · ${Math.round(category.value)}`}
              </Badge>
            }
          >
            <CardTitle as="h2">Map</CardTitle>
            <CardDescription>
              Your selected location plus nearby model grid points. Use the station list for detailed values.
            </CardDescription>
          </CardHeader>
          <div className="mt-4">
            <StationMap
              center={coords}
              stations={stations}
              activeId={activeStation?.id}
              onSelect={(station) => setActiveStation(station)}
              height={400}
              label="Nearby air quality reference points map"
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <MapPinned size={11} aria-hidden="true" />
              {coords.latitude.toFixed(4)}, {coords.longitude.toFixed(4)}
            </span>
            <span>{stations.length ? "Model grid points are not physical monitors." : "No reference points available."}</span>
          </div>
        </Card>

        <div className="space-y-3">
          <Card className="p-4 sm:p-5">
            <CardHeader
              action={
                <Badge tone={category.value === null ? "muted" : category.tone} dot>
                  {category.label}
                </Badge>
              }
            >
              <CardTitle as="h2">Nearest values</CardTitle>
              <CardDescription>{reading?.source ?? "Source unavailable"}</CardDescription>
            </CardHeader>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-hairline bg-ink-900/60 p-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-slate-300">AQI</p>
                <p className={cn("mt-1 font-display text-[22px] font-semibold tabular-nums", category.style.text)}>
                  {scaleUnavailable ? "—" : Math.round(displayAqi)}
                </p>
                {scaleUnavailable ? <p className="text-[11px] text-slate-300">Unavailable</p> : null}
              </div>
              <div className="rounded-xl border border-hairline bg-ink-900/60 p-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-slate-300">PM2.5</p>
                <p className="mt-1 font-display text-[22px] font-semibold tabular-nums text-white">
                  {formatNumber(reading?.pollutants?.pm2_5)}
                </p>
                <p className="text-[11px] text-slate-300">µg/m³</p>
              </div>
            </div>
            {scaleUnavailable ? (
              <p className="mt-3 text-[12px] leading-relaxed text-slate-300">
                {aqiScaleLabel(scale)} is not available for this reading. Switch scales or check back later.
              </p>
            ) : (
              <p className="mt-3 text-[12px] leading-relaxed text-slate-300">{category.health}</p>
            )}
            <div className="mt-3 space-y-1.5 text-[11px] text-slate-300">
              <p className="inline-flex items-center gap-1.5">
                <Clock3 size={11} aria-hidden="true" />
                Observed {reading?.observed_at ? formatDateTime(reading.observed_at) : "—"} (
                {reading?.observed_at ? relativeTime(reading.observed_at) : "n/a"})
              </p>
              <p className="inline-flex items-center gap-1.5">
                <Database size={11} aria-hidden="true" />
                {reading?.cache?.hit || reading?.stale ? `Cached ${reading.cache?.age_seconds ?? "recently"}s ago` : "Fresh fetch"}
              </p>
            </div>
            <PollutantGrid pollutants={reading?.pollutants} units={reading?.units} className="mt-4 grid-cols-2" />
          </Card>

          <Card className="p-4 sm:p-5">
            <CardHeader
              action={
                <Badge tone="neutral">{stationState.loading ? "Loading" : `${stations.length} points`}</Badge>
              }
            >
              <CardTitle as="h2" id="station-list-heading">Nearby reference points</CardTitle>
              <CardDescription>Sampled grid cells around your coordinates</CardDescription>
            </CardHeader>
            <div className="mt-3 max-h-[188px] space-y-1.5 overflow-y-auto pr-1" role="group" aria-labelledby="station-list-heading">
              {stations.length ? (
                stations.map((station) => {
                  const stationScale = station.scale ?? scale;
                  const stationAqi = stationScale === "india" ? (station.aqi_india ?? null) : (station.aqi ?? station.us_aqi ?? null);
                  const c = classifyAqi(stationAqi, stationScale);
                  const selected = station.id === activeStation?.id;
                  return (
                    <button
                      key={station.id}
                      type="button"
                      onClick={() => setActiveStation(station)}
                      aria-current={selected ? "true" : undefined}
                      aria-label={`${station.name}. ${aqiScaleLabel(stationScale)} ${stationAqi ?? "unavailable"}. ${c.label}. PM2.5 ${formatNumber(station.pm2_5)} micrograms per cubic meter. ${station.distance_km} kilometers away.`}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                        selected ? "border-aurora-400/40 bg-aurora-400/8" : "border-hairline bg-ink-900/50 hover:border-white/15",
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-medium text-slate-100">{station.name}</p>
                        <p className="truncate text-[11px] text-slate-300">
                          {aqiScaleLabel(stationScale)} · PM2.5 {formatNumber(station.pm2_5)} µg/m³ · {station.distance_km} km
                        </p>
                      </div>
                      <span className={cn("shrink-0 rounded-lg border px-2 py-1 text-[11px] font-semibold tabular-nums", c.style.bg, c.style.border, c.style.text)}>
                        {stationAqi ?? "—"}
                      </span>
                    </button>
                  );
                })
              ) : (
                <p className="text-[12px] leading-relaxed text-slate-300">
                  No reference points were returned for this location.
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Card className="p-4 sm:p-5">
        <CardHeader
          action={
            <Segmented value={metric} onChange={setMetric} options={METRICS} size="sm" ariaLabel="Forecast metric" />
          }
        >
          <CardTitle as="h2">Hourly forecast</CardTitle>
          <CardDescription>
            {metric === "aqi" ? aqiScaleLabel(scale) : `${METRICS.find((m) => m.value === metric)?.label} concentration`} ·
            next 24 hours · {forecast?.source ?? "Open-Meteo"}
          </CardDescription>
        </CardHeader>
        <div className="mt-4">
          {chartData.some((d) => d.value !== null && d.value !== undefined) ? (
            <TrendChart
              data={chartData}
              color={metric === "aqi" ? category.style.hex : "#38bdf8"}
              height={210}
              unit={metric === "aqi" ? "AQI" : "µg/m³"}
              ariaLabel={`24 hour ${metric === "aqi" ? aqiScaleLabel(scale) : metric.toUpperCase()} forecast`}
            />
          ) : (
            <div className="flex h-[210px] items-center justify-center text-[12px] text-slate-300">
              {forecastLoading ? "Loading forecast…" : metric === "aqi" && scaleUnavailable ? `${aqiScaleLabel(scale)} unavailable.` : "Forecast unavailable."}
            </div>
          )}
        </div>
        {hourlyCards.length ? (
          <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto border-t border-hairline pt-4">
            {hourlyCards.map((hour) => {
              const value = scale === "india" ? hour.india_aqi : hour.us_aqi;
              const c = classifyAqi(value, scale);
              return (
                <div key={hour.time} className="min-w-[76px] shrink-0 rounded-xl border border-hairline bg-ink-900/60 px-2.5 py-2 text-center">
                  <p className="text-[11px] text-slate-300">
                    {new Date(hour.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <p className={cn("mt-1 font-display text-[15px] font-semibold tabular-nums", c.style.text)}>
                    {value ?? "—"}
                  </p>
                  <p className="text-[11px] text-slate-300">{hour.pm2_5 ? `PM2.5 ${formatNumber(hour.pm2_5, { maximumFractionDigits: 0 })}` : "—"}</p>
                </div>
              );
            })}
          </div>
        ) : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-4 sm:p-5">
          <CardHeader>
            <CardTitle as="h2">Daily outlook</CardTitle>
            <CardDescription>Maximum AQI and average PM2.5 per day</CardDescription>
          </CardHeader>
          <div className="mt-3 overflow-x-auto">
            {daily.length ? (
              <table className="w-full min-w-[420px] text-left text-[12px]">
                <caption className="sr-only">Daily air quality outlook</caption>
                <thead>
                  <tr className="text-[11px] uppercase tracking-[0.12em] text-slate-300">
                    <th scope="col" className="pb-2 font-medium">Day</th>
                    <th scope="col" className="pb-2 font-medium">Max AQI</th>
                    <th scope="col" className="pb-2 font-medium">Avg PM2.5</th>
                    <th scope="col" className="pb-2 font-medium">Category</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {daily.map((day) => {
                    const value = scale === "india" ? day.india_aqi_max : day.us_aqi_max;
                    const c = classifyAqi(value, scale);
                    return (
                      <tr key={day.date}>
                        <td className="py-2.5 text-slate-300">
                          {new Date(day.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                        </td>
                        <td className="py-2.5 font-medium tabular-nums text-slate-100">{value ?? "—"}</td>
                        <td className="py-2.5 tabular-nums text-slate-400">
                          {formatNumber(day.pm2_5_mean)} <span className="text-[11px] text-slate-300">µg/m³</span>
                        </td>
                        <td className={cn("py-2.5", c.style.text)}>{c.label}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="text-[12px] text-slate-300">Daily forecast unavailable.</p>
            )}
          </div>
        </Card>

        <div className="space-y-3">
          <DataNote tone="info">
            <strong className="block text-slate-300">What this data is</strong>
            Open-Meteo serves CAMS model output for the grid cell nearest your coordinates. A model value is not a
            measurement from a physical monitor on your street.
          </DataNote>
          <DataNote tone="warning">
            <strong className="block text-moderate">Two AQI scales, never mixed</strong>
            US AQI and Indian National AQI (CPCB) use different breakpoints. AirAware labels the scale on every screen
            and never averages the two.
          </DataNote>
          <Card className="p-4">
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-300">Provenance</p>
            <div className="mt-2 space-y-2 text-[11.5px] text-slate-300">
              <p className="flex items-center justify-between gap-3">
                <span className="text-slate-300">Source</span>
                <span className="text-right text-slate-200">{reading?.source ?? "—"}</span>
              </p>
              <p className="flex items-center justify-between gap-3">
                <span className="text-slate-400">Fetched</span>
                <span>{reading?.fetched_at ? formatDateTime(reading.fetched_at) : "—"}</span>
              </p>
              <p className="flex items-center justify-between gap-3">
                <span className="text-slate-400">Scale</span>
                <span>{aqiScaleLabel(scale)}</span>
              </p>
            </div>
            {sourceUrl ? (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] text-aurora-300 hover:underline"
              >
                Data documentation (opens in new tab) <ExternalLink size={11} aria-hidden="true" />

              </a>
            ) : null}
          </Card>
        </div>
      </div>

      <p className="flex items-start gap-2 px-1 text-[11px] leading-relaxed text-slate-300">
        <Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
        Health categories follow published AQI breakpoints for awareness only. For symptoms, follow guidance from a
        qualified health professional.
      </p>
    </div>
  );
}

export default AirQuality;
