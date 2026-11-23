import { Badge } from "../common/Badge";
import { Card, CardDescription, CardHeader, CardTitle } from "../common/Card";
import { aqiScaleLabel, classifyAqi } from "../../lib/aqi";
import { cn, formatNumber } from "../../lib/utils";

export function StationList({ stations, activeId, onSelect, scale, loading }) {
  return (
    <Card className="p-4 sm:p-5">
      <CardHeader
        action={
          <Badge tone="neutral">
            {loading ? "Loading" : `${stations.length} points`}
          </Badge>
        }
      >
        <CardTitle as="h2" id="station-list-heading">
          Nearby reference points
        </CardTitle>
        <CardDescription>Sampled grid cells around your coordinates</CardDescription>
      </CardHeader>
      <div
        className="mt-3 max-h-[188px] space-y-1.5 overflow-y-auto pr-1"
        role="group"
        aria-labelledby="station-list-heading"
      >
        {stations.length ? (
          stations.map((station) => {
            const stationScale = station.scale ?? scale;
            const value = stationScale === "india"
              ? station.aqi_india ?? null
              : station.aqi ?? station.us_aqi ?? null;
            const category = classifyAqi(value, stationScale);
            const active = station.id === activeId;
            return (
              <button
                key={station.id}
                type="button"
                onClick={() => onSelect(station)}
                aria-current={active ? "true" : undefined}
                aria-label={`${station.name}. ${aqiScaleLabel(stationScale)} ${value ?? "unavailable"}. ${category.label}. PM2.5 ${formatNumber(station.pm2_5)} micrograms per cubic meter. ${station.distance_km} kilometers away.`}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                  active
                    ? "border-aurora-400/40 bg-aurora-400/8"
                    : "border-hairline bg-ink-900/50 hover:border-white/15",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-medium text-slate-100">{station.name}</span>
                  <span className="block truncate text-[11px] text-slate-300">
                    {aqiScaleLabel(stationScale)} · PM2.5 {formatNumber(station.pm2_5)} µg/m³ · {station.distance_km} km
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-lg border px-2 py-1 text-[11px] font-semibold tabular-nums",
                    category.style.bg,
                    category.style.border,
                    category.style.text,
                  )}
                >
                  {value ?? "—"}
                </span>
              </button>
            );
          })
        ) : (
          <p role="status" aria-live="polite" className="text-[12px] leading-relaxed text-slate-300">
            {loading ? "Loading reference points…" : "No reference points were returned for this location."}
          </p>
        )}
      </div>
    </Card>
  );
}

export default StationList;
