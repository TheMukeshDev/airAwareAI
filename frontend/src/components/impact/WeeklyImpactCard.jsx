import { Award } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "../common/Card";
import { Badge } from "../common/Badge";
import { SimpleBarChart } from "../../components/charts/Charts";
import { formatNumber } from "../../lib/utils";

export function WeeklyImpactCard({ data, loading }) {
  const chartData = (Array.isArray(data?.weekly) ? data.weekly : []).map((item) => ({
    label: item.label,
    value: item.avoided_kg,
  }));
  const achievements = Array.isArray(data?.achievements) ? data.achievements : [];
  const label = chartData.length
    ? `Weekly avoided emissions. ${chartData.map((item) => `${item.label}: ${formatNumber(item.value)} kilograms`).join(", ")}.`
    : "Weekly avoided emissions chart. No logged activity yet.";

  return (
    <Card>
      <CardHeader action={<Badge tone="neutral">Last 8 weeks</Badge>}>
        <CardTitle as="h2">Weekly avoided emissions</CardTitle>
        <CardDescription>Each bar aggregates logged journeys for that week</CardDescription>
      </CardHeader>
      <div className="mt-4">
        {loading ? (
          <div className="h-[220px]" />
        ) : chartData.length ? (
          <SimpleBarChart data={chartData} unit="kg" height={220} color="#3fe0ac" ariaLabel={label} />
        ) : (
          <div className="flex h-[220px] flex-col items-center justify-center gap-2 text-center" role="status">
            <p className="text-[12.5px] text-slate-300">No logged activity yet.</p>
            <p className="max-w-xs text-[11.5px] text-slate-400">
              Log a journey comparing your usual mode with an alternative to see estimated avoided emissions.
            </p>
          </div>
        )}
      </div>
      <div className="mt-4 border-t border-hairline pt-4">
        <p className="mb-2 text-[10.5px] uppercase tracking-[0.14em] text-slate-400">Achievements</p>
        <div className="flex flex-wrap gap-2" role="status" aria-live="polite">
          {achievements.length ? achievements.map((item) => (
            <span key={item.key} className="inline-flex items-center gap-1.5 rounded-full border border-aurora-400/30 bg-aurora-400/10 px-2.5 py-1 text-[11px] text-aurora-300">
              <Award size={11} aria-hidden="true" />
              {item.label}
            </span>
          )) : (
            <span className="text-[11.5px] text-slate-400">Log activities to unlock achievements.</span>
          )}
        </div>
      </div>
    </Card>
  );
}

export default WeeklyImpactCard;
