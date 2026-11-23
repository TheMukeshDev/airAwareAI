import { Card, CardDescription, CardHeader, CardTitle } from "../common/Card";
import { Segmented } from "../common/Toggle";
import { TrendChart } from "../../components/charts/Charts";
import { aqiScaleLabel, classifyAqi } from "../../lib/aqi";
import { formatNumber } from "../../lib/utils";

export const FORECAST_METRICS = [
  { value: "aqi", label: "AQI" },
  { value: "pm2_5", label: "PM2.5" },
  { value: "pm10", label: "PM10" },
];

export function buildForecastSeries(forecast, metric, scale) {
  return (forecast?.hourly ?? []).slice(0, 24).map((hour) => {
    const value = metric === "aqi"
      ? scale === "india" ? hour.india_aqi : hour.us_aqi
      : hour[metric];
    return {
      label: new Date(hour.time).toLocaleTimeString("en-GB", { hour: "2-digit" }),
      value: value ?? null,
    };
  });
}

function HourlyStrip({ hours, scale }) {
  return hours.length ? (
    <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto border-t border-hairline pt-4">
      {hours.map((hour) => {
        const value = scale === "india" ? hour.india_aqi : hour.us_aqi;
        const category = classifyAqi(value, scale);
        return (
          <div
            key={hour.time}
            className="min-w-[76px] shrink-0 rounded-xl border border-hairline bg-ink-900/60 px-2.5 py-2 text-center"
          >
            <p className="text-[11px] text-slate-300">
              {new Date(hour.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </p>
            <p className={`mt-1 font-display text-[15px] font-semibold tabular-nums ${category.style.text}`}>
              {value ?? "—"}
            </p>
            <p className="text-[11px] text-slate-300">
              {hour.pm2_5 ? `PM2.5 ${formatNumber(hour.pm2_5, { maximumFractionDigits: 0 })}` : "—"}
            </p>
          </div>
        );
      })}
    </div>
  ) : null;
}

export function ForecastChart({ forecast, metric, onMetricChange, scale, categoryColor, readingMissing, loading, source }) {
  const series = buildForecastSeries(forecast, metric, scale);
  const hasValues = series.some((point) => point.value !== null && point.value !== undefined);
  const metricLabel = metric === "aqi" ? aqiScaleLabel(scale) : FORECAST_METRICS.find((item) => item.value === metric)?.label.toUpperCase();
  const description = metric === "aqi"
    ? aqiScaleLabel(scale)
    : `${FORECAST_METRICS.find((item) => item.value === metric)?.label} concentration`;

  return (
    <Card className="p-4 sm:p-5">
      <CardHeader
        action={
          <Segmented value={metric} onChange={onMetricChange} options={FORECAST_METRICS} size="sm" ariaLabel="Forecast metric" />
        }
      >
        <CardTitle as="h2">Hourly forecast</CardTitle>
        <CardDescription>
          {description} · next 24 hours · {source ?? "Open-Meteo"}
        </CardDescription>
      </CardHeader>
      <div className="mt-4">
        {hasValues ? (
          <TrendChart
            data={series}
            color={metric === "aqi" ? categoryColor : "#38bdf8"}
            height={210}
            unit={metric === "aqi" ? "AQI" : "µg/m³"}
            ariaLabel={`24 hour ${metricLabel} forecast`}
          />
        ) : (
          <div role="status" aria-live="polite" className="flex h-[210px] items-center justify-center text-[12px] text-slate-300">
            {loading ? "Loading forecast…" : metric === "aqi" && readingMissing ? `${aqiScaleLabel(scale)} unavailable.` : "Forecast unavailable."}
          </div>
        )}
      </div>
      <HourlyStrip hours={(forecast?.hourly ?? []).slice(0, 8)} scale={scale} />
    </Card>
  );
}

export default ForecastChart;
