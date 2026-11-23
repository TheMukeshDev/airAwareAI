import { Bike, History, Leaf, TrendingDown } from "lucide-react";
import { Stat } from "../common/Stat";
import { formatNumber } from "../../lib/utils";

export function ImpactStats({ totals = {} }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Avoided · 30 days" value={formatNumber(totals.avoided_kg)} unit="kg CO₂e" icon={TrendingDown} tone="good" hint="Baseline minus actual, per logged journey" />
      <Stat label="Emissions logged" value={formatNumber(totals.actual_kg)} unit="kg CO₂e" icon={Leaf} tone="aurora" hint={`Against ${formatNumber(totals.baseline_kg)} kg baseline`} />
      <Stat label="Activities" value={totals.logged_activities ?? 0} icon={History} tone="glow" hint={`${formatNumber(totals.distance_km)} km logged`} />
      <Stat
        label="Reduction"
        value={totals.reduction_pct !== undefined && totals.reduction_pct !== null ? `${formatNumber(totals.reduction_pct, { maximumFractionDigits: 0 })}%` : "—"}
        icon={Bike}
        tone="moderate"
        hint="Share of baseline emissions avoided"
      />
    </div>
  );
}

export default ImpactStats;
