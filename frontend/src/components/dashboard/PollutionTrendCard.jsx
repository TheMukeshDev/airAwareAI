import { Clock3, RefreshCw } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "../common/Card";
import { Badge } from "../common/Badge";
import { TrendChart } from "../charts/Charts";
import { aqiScaleLabel } from "../../lib/aqi";
import { relativeTime } from "../../lib/utils";

export function PollutionTrendCard({ reading, forecast, series, missing, categoryColor, scale, onRefresh }) {
  const unavailable = missing && reading;
  return (
    <Card className="p-4 sm:p-5">
      <CardHeader
        action={<Badge tone="neutral" dot>24h forecast</Badge>}
      >
        <CardTitle as="h2">Pollution trend</CardTitle>
        <CardDescription>{aqiScaleLabel(scale)} · {forecast?.source ?? "Open-Meteo (CAMS)"}</CardDescription>
      </CardHeader>
      <div className="mt-3">
        {unavailable ? (
          <div className="flex h-[168px] items-center justify-center text-[12px] text-slate-400">
            {aqiScaleLabel(scale)} unavailable for this reading.
          </div>
        ) : series.some((item) => item.value !== null && item.value !== undefined) ? (
          <TrendChart data={series} color={categoryColor} height={168} ariaLabel={`24 hour ${aqiScaleLabel(scale)} trend`} unit="AQI" />
        ) : (
          <div className="flex h-[168px] items-center justify-center text-[12px] text-slate-400">
            Forecast unavailable for this location.
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3 text-[10.5px] text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <Clock3 size={11} aria-hidden="true" />
          {reading?.observed_at ? `Reading observed ${relativeTime(reading.observed_at)}` : "No reading timestamp"}
        </span>
        <button type="button" aria-label="Refresh air quality trend" onClick={onRefresh} className="inline-flex items-center gap-1 hover:text-aurora-300">
          <RefreshCw size={11} aria-hidden="true" />
          Refresh
        </button>
      </div>
    </Card>
  );
}

export default PollutionTrendCard;
