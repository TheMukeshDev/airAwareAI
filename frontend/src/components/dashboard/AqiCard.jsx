import { RefreshCw, MapPin, Clock3, Info } from "lucide-react";
import { classifyAqi } from "../../lib/aqi";
import { cn, formatNumber, relativeTime } from "../../lib/utils";
import { Badge } from "../common/Badge";
import { Button } from "../common/Button";

function AqiGauge({ value, tone, categoryLabel, scaleLabel }) {
  const max = 300;
  const pct = Math.min(1, Math.max(0, (Number(value) || 0) / max));
  const radius = 78;
  const circumference = Math.PI * radius;
  const offset = circumference * (1 - pct);
  const isEmpty = value === null || value === undefined || Number.isNaN(Number(value));
  return (
    <figure role="img" aria-label={`AQI gauge: ${isEmpty ? "unavailable" : Math.round(Number(value))}`}>
      <div className="relative h-[112px] w-[188px]">
        <svg viewBox="0 0 188 108" className="h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id="gauge-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="45%" stopColor="#f5c542" />
            <stop offset="75%" stopColor="#fb923c" />
            <stop offset="100%" stopColor="#f87171" />
          </linearGradient>
        </defs>
        <path d="M16 96 A78 78 0 0 1 172 96" fill="none" stroke="#152434" strokeWidth="10" strokeLinecap="round" />
        <path
          d="M16 96 A78 78 0 0 1 172 96"
          fill="none"
          stroke="url(#gauge-grad)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={isEmpty ? circumference : offset}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)" }}
        />
        {!isEmpty ? (
          <circle
            cx={94 + radius * Math.cos(Math.PI * (1 - pct))}
            cy={96 - radius * Math.sin(Math.PI * (1 - pct))}
            r="5"
            fill="#050a10"
            stroke={tone?.style?.hex ?? "#3fe0ac"}
            strokeWidth="3"
          />
        ) : null}
        </svg>
        <div className="absolute inset-x-0 bottom-2 text-center">
          <span className="font-display text-[34px] font-semibold leading-none tabular-nums text-white">
            {isEmpty ? "—" : Math.round(Number(value))}
          </span>
        </div>
      </div>
      <figcaption className="sr-only">
        {isEmpty
          ? "No AQI reading is available for this location."
          : `Current AQI ${Math.round(Number(value))} on the ${scaleLabel} scale, category ${categoryLabel || "unclassified"}.`}
      </figcaption>
    </figure>
  );
}

export function AqiCard({ reading, loading, error, onRefresh, className, showScale = true }) {
  const scale = reading?.scale ?? "us";
  const category = classifyAqi(reading?.aqi, scale);
  const cached = Boolean(reading?.stale || reading?.cache?.hit);

  return (
    <div className={cn("surface relative overflow-hidden p-5 sm:p-6", className)}>
      <div
        className="pointer-events-none absolute -right-14 -top-20 h-56 w-56 rounded-full blur-3xl"
        style={{ background: `${category.style.hex}22` }}
        aria-hidden="true"
      />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-300">Current air quality</p>
            {cached ? <Badge tone="moderate">Cached</Badge> : null}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-[13px] text-slate-300">
            <MapPin size={13} className="text-aurora-400" aria-hidden="true" />
            <span className="truncate">
              {reading?.location?.name || reading?.location?.city || "Location not set"}
              {reading?.location?.admin1 ? `, ${reading.location.admin1}` : ""}
            </span>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onRefresh} aria-label="Refresh air quality" className="text-slate-300">
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} aria-hidden="true" />
        </Button>
      </div>

      <div className="relative mt-3 flex flex-col items-center">
        {error ? (
          <div className="flex flex-col items-center py-6 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/5 text-slate-400">
              <Info size={18} aria-hidden="true" />
            </span>
            <p className="mt-3 max-w-[240px] text-[13px] leading-relaxed text-slate-300">{error}</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={onRefresh}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            <AqiGauge
              value={reading?.aqi}
              tone={category}
              categoryLabel={category.label}
              scaleLabel={scale === "india" ? "Indian CPCB AQI" : "US AQI"}
            />
            <div className="-mt-1 flex flex-col items-center gap-2">
              <span className={cn("text-[15px] font-semibold", category.style.text)}>
                {reading ? category.label : loading ? "Loading…" : "Unavailable"}
              </span>
              {showScale ? (
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-slate-300">
                  {scale === "india" ? "Indian AQI · CPCB scale" : "US AQI scale"}
                </span>
              ) : null}
              {scale === "india" && reading?.aqi_india_method ? (
                <span className="max-w-[230px] text-center text-[11px] leading-snug text-slate-300">
                  Computed estimate from model concentrations, not an official CPCB monitor reading.
                </span>
              ) : null}

            </div>
          </>
        )}
      </div>

      <div className="relative mt-5 grid grid-cols-2 gap-2 border-t border-hairline pt-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-slate-300">PM2.5</p>
          <p className="mt-0.5 text-[15px] font-semibold text-slate-100 tabular-nums">
            {formatNumber(reading?.pollutants?.pm2_5)}
            <span className="ml-1 text-[11px] font-normal text-slate-300">µg/m³</span>
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-slate-300">Dominant</p>
          <p className="mt-0.5 text-[15px] font-semibold text-slate-100">{reading?.primary_pollutant || "—"}</p>
        </div>
      </div>

      <div className="relative mt-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300">
        <span className="inline-flex items-center gap-1.5">
          <Clock3 size={11} aria-hidden="true" />
          {reading?.observed_at ? `Observed ${relativeTime(reading.observed_at)}` : "No observation timestamp"}
        </span>
        <span className="truncate">{reading?.source ?? "Source unavailable"}</span>
      </div>
    </div>
  );
}

export default AqiCard;
