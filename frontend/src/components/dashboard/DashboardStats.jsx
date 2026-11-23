import { CalendarCheck, Leaf, Wind } from "lucide-react";
import { Stat } from "../common/Stat";
import { ErrorState } from "../common/ErrorState";
import { formatNumber } from "../../lib/utils";

export function DashboardStats({ reading, actions, impactState }) {
  const completed = actions.filter((action) => action.completed).length;
  const totals = impactState.data?.totals ?? {};
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Plan progress"
          value={`${completed}/${actions.length || 0}`}
          icon={CalendarCheck}
          tone="aurora"
          hint={actions.length ? "Actions completed today" : "No plan generated yet"}
        />
        <Stat
          label="Avoided · 30 days"
          value={formatNumber(totals.avoided_kg ?? 0)}
          unit="kg CO₂e"
          icon={Leaf}
          tone="good"
          hint={totals.logged_activities ? `${totals.logged_activities} logged activities` : "Log a trip to start"}
        />
        <Stat
          label="Exposure today"
          value={reading?.exposure?.level ?? "—"}
          icon={Wind}
          tone={reading?.exposure?.level === "high" ? "verypoor" : "glow"}
          hint={reading?.exposure?.message ?? "Based on readings and time outdoors"}
        />
      </div>
      {impactState.error ? (
        <ErrorState message={impactState.error} onRetry={impactState.reload} compact retryLabel="Retry impact" />
      ) : null}
    </>
  );
}

export default DashboardStats;
