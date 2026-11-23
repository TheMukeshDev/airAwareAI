import { Card, CardDescription, CardHeader, CardTitle } from "../common/Card";
import { Badge } from "../common/Badge";
import { formatNumber } from "../../lib/utils";

export function OutdoorContextCard({ reading, category }) {
  return (
    <Card>
      <CardHeader action={<Badge tone="neutral">Outdoor context</Badge>}>
        <CardTitle as="h2">Ventilation window</CardTitle>
        <CardDescription>
          {reading?.location?.name
            ? `${reading.location.name}${reading.source ? ` · ${reading.source}` : ""}`
            : "No outdoor reading available"}
        </CardDescription>
      </CardHeader>
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-hairline bg-ink-900/60 p-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Outdoor AQI</p>
          <p className={`mt-1 font-display text-[20px] font-semibold tabular-nums ${category?.style?.text ?? "text-slate-300"}`}>
            {reading?.aqi !== undefined && reading?.aqi !== null ? Math.round(reading.aqi) : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-hairline bg-ink-900/60 p-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">PM2.5</p>
          <p className="mt-1 font-display text-[20px] font-semibold tabular-nums text-white">
            {formatNumber(reading?.pollutants?.pm2_5)}
          </p>
        </div>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-slate-300">
        {reading?.indoor_hint ??
          "When outdoor PM2.5 is high, keep windows closed during peak traffic hours and ventilate briefly when readings drop."}
      </p>
    </Card>
  );
}

export default OutdoorContextCard;
