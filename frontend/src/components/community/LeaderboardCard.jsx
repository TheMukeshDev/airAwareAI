import { Award } from "lucide-react";
import { Button } from "../common/Button";
import { Card, CardDescription, CardHeader, CardTitle } from "../common/Card";
import { Badge } from "../common/Badge";
import { LoadingBlock } from "../common/Spinner";
import { ErrorState } from "../common/ErrorState";
import { cn, formatNumber } from "../../lib/utils";

const RANK_COLORS = ["text-moderate", "text-slate-300", "text-poor"];

export function LeaderboardCard({ leaderboardState }) {
  const entries = leaderboardState.data?.entries ?? [];
  return (
    <Card>
      <CardHeader action={<Badge tone="neutral">Top 10</Badge>}>
        <CardTitle as="h2">Leaderboard</CardTitle>
        <CardDescription>Display names only · estimates for the current period</CardDescription>
      </CardHeader>
      <div className="mt-3 space-y-1">
        {leaderboardState.error ? (
          <ErrorState message={leaderboardState.error} onRetry={leaderboardState.reload} />
        ) : leaderboardState.loading ? (
          <LoadingBlock className="border-0 bg-transparent" label="Loading leaderboard" />
        ) : entries.length ? (
          entries.map((entry) => (
            <div
              key={`${entry.rank}-${entry.name}`}
              className={cn(
                "flex items-center gap-3 rounded-xl px-2.5 py-2",
                entry.is_you ? "border border-aurora-400/30 bg-aurora-400/8" : "border border-transparent",
              )}
            >
              <span aria-hidden="true" className={cn("w-6 text-center font-display text-[12px] font-semibold", RANK_COLORS[entry.rank - 1] ?? "text-slate-400")}>
                {entry.rank <= 3 ? <Award size={14} className="mx-auto" /> : entry.rank}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-slate-200">
                {entry.name}
                {entry.is_you ? <span className="ml-1.5 text-[10px] text-aurora-400">you</span> : null}
              </span>
              <span className="text-[11.5px] font-medium tabular-nums text-slate-100">{formatNumber(entry.avoided_kg)} kg</span>
            </div>
          ))
        ) : (
          <p role="status" className="py-4 text-center text-[12px] text-slate-400">No leaderboard entries yet.</p>
        )}
      </div>
    </Card>
  );
}

export function CommunityCallout() {
  return (
    <Card className="bg-gradient-to-br from-aurora-500/10 via-transparent to-glow-500/8">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-aurora-400/15 text-aurora-300">
          <Award size={18} />
        </span>
        <div>
          <CardTitle as="h2">Start a habit, not a competition</CardTitle>
          <CardDescription>Leaderboards are opt-in and show display names only. The real measure is the collective kilograms avoided — not who logged last.</CardDescription>
        </div>
      </div>
      <Button to="/my-impact" variant="outline" size="sm" className="mt-4">Log an activity</Button>
    </Card>
  );
}

export default LeaderboardCard;
