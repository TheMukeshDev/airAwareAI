import { Card, CardDescription, CardHeader, CardTitle } from "../common/Card";
import { Badge } from "../common/Badge";
import { Progress } from "../common/Progress";
import { SimpleBarChart } from "../../components/charts/Charts";
import { formatNumber } from "../../lib/utils";

export function FootprintBreakdownCard({ analysis }) {
  const breakdown = analysis?.breakdown ?? [];
  const total = analysis?.total_kg_per_month ?? 0;
  const max = Math.max(...breakdown.map((item) => item.kg_per_month), 1);

  return (
    <Card>
      <CardHeader action={<Badge tone="aurora">Estimated</Badge>}>
        <CardTitle as="h2">Monthly footprint</CardTitle>
        <CardDescription>Attributed to your share of household activity</CardDescription>
      </CardHeader>
      <div className="mt-4 flex items-end gap-2">
        <span className="font-display text-[38px] font-semibold leading-none text-white tabular-nums">
          {formatNumber(total)}
        </span>
        <span className="pb-1 text-[12px] text-slate-300">kg CO₂e / month</span>
      </div>
      <p className="mt-2 text-[11.5px] text-slate-400" role="status" aria-live="polite">
        ≈ {formatNumber(total * 12, { maximumFractionDigits: 0 })} kg CO₂e per year · factor set{" "}
        {analysis.factor_version ?? "unknown"}
      </p>
      <div className="mt-4">
        <SimpleBarChart
          data={breakdown.map((item) => ({ label: item.label, value: item.kg_per_month }))}
          unit="kg"
          height={168}
          colors={["#3fe0ac", "#38bdf8", "#f5c542", "#c084fc"]}
          ariaLabel={`Estimated monthly footprint by category, ${formatNumber(total)} kilograms CO2 equivalent. ${breakdown.map((item) => `${item.label}: ${formatNumber(item.kg_per_month)} kilograms`).join(", ")}.`}
        />
      </div>
      <div className="mt-3 space-y-2.5 border-t border-hairline pt-3">
        {breakdown.map((item) => (
          <div key={item.key}>
            <div className="flex items-center justify-between text-[11.5px]">
              <span className="text-slate-300">{item.label}</span>
              <span className="text-slate-100 tabular-nums">{formatNumber(item.kg_per_month)} kg</span>
            </div>
            <Progress value={max ? (item.kg_per_month / max) * 100 : 0} label={`${item.label} share`} className="mt-1" />
          </div>
        ))}
      </div>
    </Card>
  );
}

export default FootprintBreakdownCard;
