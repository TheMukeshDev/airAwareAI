import { Clock3, Database } from "lucide-react";
import { Badge } from "../common/Badge";
import { Card, CardDescription, CardHeader, CardTitle } from "../common/Card";
import { PollutantGrid } from "../dashboard/PollutantGrid";
import { aqiScaleLabel, classifyAqi } from "../../lib/aqi";
import { cn, formatDateTime, formatNumber, relativeTime } from "../../lib/utils";

export function PollutantBreakdownCard({ reading, scale, stationLoading }) {
  const value = scale === "india" ? reading?.aqi_india : reading?.aqi;
  const missing = value == null;
  const category = classifyAqi(value, scale);
  const cached = reading?.cache?.hit || reading?.stale;

  return (
    <Card className="p-4 sm:p-5">
      <CardHeader
        action={
          <Badge tone={missing ? "muted" : category.tone} dot>
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
            {missing ? "—" : Math.round(value)}
          </p>
          {missing ? <p className="text-[11px] text-slate-300">Unavailable</p> : null}
        </div>
        <div className="rounded-xl border border-hairline bg-ink-900/60 p-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-slate-300">PM2.5</p>
          <p className="mt-1 font-display text-[22px] font-semibold tabular-nums text-white">
            {formatNumber(reading?.pollutants?.pm2_5)}
          </p>
          <p className="text-[11px] text-slate-300">µg/m³</p>
        </div>
      </div>
      <p role="status" aria-live="polite" className="mt-3 text-[12px] leading-relaxed text-slate-300">
        {missing
          ? `${aqiScaleLabel(scale)} is not available for this reading. Switch scales or check back later.`
          : category.health}
      </p>
      <div className="mt-3 space-y-1.5 text-[11px] text-slate-300">
        <p className="inline-flex items-center gap-1.5">
          <Clock3 size={11} aria-hidden="true" />
          Observed {reading?.observed_at ? formatDateTime(reading.observed_at) : "—"} (
          {reading?.observed_at ? relativeTime(reading.observed_at) : "n/a"})
        </p>
        <p className="inline-flex items-center gap-1.5">
          <Database size={11} aria-hidden="true" />
          {cached ? `Cached ${reading.cache?.age_seconds ?? "recently"}s ago` : "Fresh fetch"}
        </p>
      </div>
      <PollutantGrid pollutants={reading?.pollutants} units={reading?.units} className="mt-4 grid-cols-2" />
      {stationLoading ? <span className="sr-only" role="status">Loading nearby reference points.</span> : null}
    </Card>
  );
}

export default PollutantBreakdownCard;
