import { ShieldCheck } from "lucide-react";
import { Badge } from "../common/Badge";
import { Card, CardDescription, CardHeader, CardTitle } from "../common/Card";
import { DataNote } from "../common/DataNote";
import { formatNumber } from "../../lib/utils";

export function LiveContextCard({ reading, user }) {
  const rows = [
    ["Location", reading?.location?.name ?? user?.location?.city ?? "Not set"],
    ["AQI", reading?.aqi !== undefined && reading?.aqi !== null
      ? `${Math.round(reading.aqi)} (${reading.scale === "india" ? "India" : "US"})`
      : "Unavailable"],
    ["PM2.5", reading?.pollutants?.pm2_5 !== undefined
      ? `${formatNumber(reading.pollutants.pm2_5)} µg/m³`
      : "Unavailable"],
    ["Observed", reading?.observed_at ?? "—"],
    ["Commute", user?.lifestyle?.primary_mode ?? user?.preferences?.transport ?? "Not set"],
    ["Household", user?.lifestyle?.household_type ?? "Not set"],
  ];
  return (
    <Card>
      <CardHeader action={<Badge tone="neutral">Live context</Badge>}>
        <CardTitle as="h2">What I can see</CardTitle>
        <CardDescription>Only these values are supplied to the model.</CardDescription>
      </CardHeader>
      <div className="mt-4 space-y-2 text-[11.5px]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-3 border-b border-hairline pb-2 last:border-0">
            <span className="shrink-0 text-slate-400">{label}</span>
            <span className="text-right text-slate-200">{value}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function SafetyCard() {
  return (
    <Card>
      <CardTitle as="h2" className="flex items-center gap-2">
        <ShieldCheck size={14} className="text-aurora-400" aria-hidden="true" />
        Safety boundaries
      </CardTitle>
      <ul className="mt-3 space-y-2 text-[11.5px] leading-relaxed text-slate-400">
        <li>No medical diagnosis or personal treatment advice.</li>
        <li>No invented AQI, pollutant or savings figures.</li>
        <li>No claim that an action immediately lowers citywide AQI.</li>
        <li>Outdoor exertion advice follows public health thresholds.</li>
      </ul>
    </Card>
  );
}

export function AssistantDataNote() {
  return (
    <DataNote tone="info">
      Assistant replies are generated text. Treat them as guidance, not measurement — the numbers beside this chat come
      from the air-quality API.
    </DataNote>
  );
}

export default LiveContextCard;
