import { Leaf, TrendingUp, Users, Waves } from "lucide-react";
import { Stat } from "../common/Stat";
import { formatNumber } from "../../lib/utils";

export function CommunityStats({ stats }) {
  const rank = stats?.your_rank;
  const score = stats?.neighbourhood_score;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Participants" value={formatNumber(stats?.members, { maximumFractionDigits: 0 })} icon={Users} tone="glow" hint="Accounts contributing to this hub" />
      <Stat label="Collective avoided" value={formatNumber(stats?.collective_avoided_kg)} unit="kg CO₂e" icon={Leaf} tone="good" hint="Sum of logged avoided emissions" />
      <Stat label="Your contribution" value={formatNumber(stats?.your_avoided_kg)} unit="kg CO₂e" icon={TrendingUp} tone="aurora" hint={rank ? `Rank #${rank}` : "Log activities to appear"} />
      <Stat label="Neighbourhood score" value={score ?? "—"} unit={score !== undefined && score !== null ? "/100" : undefined} icon={Waves} tone="moderate" hint={stats?.neighbourhood_label ?? "Aggregate participation signal"} />
    </div>
  );
}

export default CommunityStats;
