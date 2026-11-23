import { AlertTriangle } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "../common/Card";
import { Badge } from "../common/Badge";
import { classifyAqi } from "../../lib/aqi";
import { formatNumber } from "../../lib/utils";

function safeLabel(value, fallback) {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object" && typeof value.label === "string" && value.label.trim()) return value.label;
  return fallback;
}

export function PlanContextCard({ context, user }) {
  const category = context?.scale ? classifyAqi(context?.aqi, context.scale) : null;
  const alert = typeof context?.alert === "string"
    ? context.alert
    : typeof context?.alert?.message === "string"
      ? context.alert.message
      : null;
  const rows = [
    ["Location", context?.location ?? user?.location?.city ?? "—"],
    ["AQI used", context?.aqi !== undefined && context?.aqi !== null && context?.scale
      ? `${Math.round(context.aqi)} (${context.scale === "india" ? "India" : "US"})`
      : "—"],
    ["PM2.5", context?.pm2_5 !== undefined && context?.pm2_5 !== null
      ? `${formatNumber(context.pm2_5)} µg/m³`
      : "—"],
    ["Outside window", safeLabel(context?.outdoor_window, "No safe low-pollution window identified")],
    ["Readings source", context?.source || "—"],
  ];

  return (
    <Card>
      <CardHeader
        action={
          category ? (
            <Badge tone={category.tone} dot>{category.label}</Badge>
          ) : (
            <Badge tone="neutral">AQI unavailable</Badge>
          )
        }
      >
        <CardTitle as="h2">Plan context</CardTitle>
        <CardDescription>What the planner used, at generation time</CardDescription>
      </CardHeader>
      <div className="mt-4 space-y-2 text-[11.5px]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-3 border-b border-hairline pb-2 last:border-0">
            <span className="shrink-0 text-slate-400">{label}</span>
            <span className="text-right text-slate-200">{value}</span>
          </div>
        ))}
      </div>
      {alert ? (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-verypoor/25 bg-verypoor/[0.06] p-3 text-[11.5px] leading-relaxed text-verypoor/90">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          {alert}
        </div>
      ) : null}
    </Card>
  );
}

export default PlanContextCard;
