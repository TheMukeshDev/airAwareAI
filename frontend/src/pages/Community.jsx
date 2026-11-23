import { useState } from "react";
import toast from "react-hot-toast";
import { Award, CalendarClock, Check, Leaf, Medal, TrendingUp, Users, Waves } from "lucide-react";
import { PageHeader } from "../components/common/PageHeader";
import { Button } from "../components/common/Button";
import { Card, CardDescription, CardHeader, CardTitle } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { Progress } from "../components/common/Progress";
import { Stat } from "../components/common/Stat";
import { DataNote } from "../components/common/DataNote";
import { LoadingBlock } from "../components/common/Spinner";
import { ErrorState } from "../components/common/ErrorState";
import { useAsyncResource } from "../hooks/useAsyncResource";
import { communityApi, apiError } from "../services/api";
import { cn, formatNumber } from "../lib/utils";

const RANK_STYLES = ["text-moderate", "text-slate-300", "text-poor"];

export function Community() {
  const stats = useAsyncResource(() => communityApi.stats(), [], {
    fallback: "Could not load community totals.",
  });
  const challenges = useAsyncResource(
    async () => {
      const data = await communityApi.challenges();
      return { items: data.challenges ?? [] };
    },
    [],
    {
      initialData: { items: [] },
      fallback: "Could not load green challenges.",
    },
  );
  const leaderboard = useAsyncResource(
    async () => {
      const data = await communityApi.leaderboard({ page: 1, per_page: 10 });
      return { entries: data.entries ?? [] };
    },
    [],
    {
      initialData: { entries: [] },
      fallback: "Could not load the leaderboard.",
    },
  );
  const [joining, setJoining] = useState(null);

  const join = async (challenge) => {
    setJoining(challenge.id);
    try {
      const data = await communityApi.join(challenge.id);
      const updated = data.challenge ?? { ...challenge, joined: true };
      challenges.setData((current) => ({
        items: current.items.map((item) => (item.id === challenge.id ? { ...item, ...updated, joined: true } : item)),
      }));
      stats.setData((current) =>
        current
          ? {
              ...current,
              members:
                !challenge.joined && typeof current.members === "number" ? current.members + 1 : current.members,
            }
          : current,
      );
      toast.success(`Joined “${challenge.title}”.`);
    } catch (error) {
      toast.error(apiError(error, "Could not join that challenge."));
    } finally {
      setJoining(null);
    }
  };

  const data = stats.data;
  const yourRank = data?.your_rank;
  const challengeItems = challenges.data?.items ?? [];
  const leaderboardEntries = leaderboard.data?.entries ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Module 07"
        title="Community hub"
        description="Collective progress, built only from aggregated estimates. Individual locations and habits are never shown."
        actions={
          <Badge tone="aurora" dot>
            Privacy-safe aggregation
          </Badge>
        }
      />

      {stats.error ? <ErrorState message={stats.error} onRetry={stats.reload} /> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Participants" value={formatNumber(data?.members, { maximumFractionDigits: 0 })} icon={Users} tone="glow" hint="Accounts contributing to this hub" />
        <Stat label="Collective avoided" value={formatNumber(data?.collective_avoided_kg)} unit="kg CO₂e" icon={Leaf} tone="good" hint="Sum of logged avoided emissions" />
        <Stat label="Your contribution" value={formatNumber(data?.your_avoided_kg)} unit="kg CO₂e" icon={TrendingUp} tone="aurora" hint={yourRank ? `Rank #${yourRank}` : "Log activities to appear"} />
        <Stat label="Neighbourhood score" value={data?.neighbourhood_score ?? "—"} unit={data?.neighbourhood_score !== undefined && data?.neighbourhood_score !== null ? "/100" : undefined} icon={Waves} tone="moderate" hint={data?.neighbourhood_label ?? "Aggregate participation signal"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader action={<Badge tone="neutral">{challengeItems.length} open</Badge>}>
              <CardTitle as="h2">Green challenges</CardTitle>
              <CardDescription>Join a challenge to have your logged activities count toward its goal.</CardDescription>
            </CardHeader>
            <div className="mt-4 space-y-2.5">
              {challenges.error ? (
                <ErrorState message={challenges.error} onRetry={challenges.reload} />
              ) : challenges.loading ? (
                <LoadingBlock className="border-0 bg-transparent" label="Loading challenges" />
              ) : challengeItems.length ? (
                challengeItems.map((challenge) => (
                  <div key={challenge.id} className="rounded-xl border border-hairline bg-ink-900/50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-[13px] font-semibold text-slate-100">{challenge.title}</h3>
                          <Badge tone={challenge.joined ? "aurora" : "neutral"}>{challenge.joined ? "Joined" : challenge.category ?? "Challenge"}</Badge>
                        </div>
                        <p className="mt-1 text-[12px] leading-relaxed text-slate-300">{challenge.description}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-[10.5px] text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            <Users size={10} aria-hidden="true" />
                            {challenge.participants ?? 0} participants
                          </span>
                          {challenge.ends_at ? (
                            <span className="inline-flex items-center gap-1">
                              <CalendarClock size={10} aria-hidden="true" />
                              Ends {new Date(challenge.ends_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                            </span>
                          ) : null}
                          {challenge.target_kg ? <span>Target {formatNumber(challenge.target_kg)} kg CO₂e</span> : null}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant={challenge.joined ? "secondary" : "primary"}
                        disabled={challenge.joined}
                        loading={joining === challenge.id}
                        onClick={() => join(challenge)}
                      >
                        {challenge.joined ? <Check size={13} aria-hidden="true" /> : null}
                        {challenge.joined ? "Joined" : "Join"}
                      </Button>
                    </div>
                    {challenge.progress_pct !== undefined && challenge.progress_pct !== null ? (
                      <Progress
                        value={challenge.progress_pct}
                        label={`${formatNumber(challenge.progress_kg ?? 0)} of ${formatNumber(challenge.target_kg ?? 0)} kg`}
                        className="mt-3"
                        tone="aurora"
                      />
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="py-6 text-center text-[12px] text-slate-400">No challenges are open right now.</p>
              )}
            </div>
          </Card>

          <DataNote tone="info">
            Community totals sum each participant&apos;s avoided-emissions estimate. Shared journeys are split per person
            before aggregation to avoid double-counting, and no individual data is exposed.
          </DataNote>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader action={<Badge tone="neutral">Top 10</Badge>}>
              <CardTitle as="h2">Leaderboard</CardTitle>
              <CardDescription>Display names only · estimates for the current period</CardDescription>
            </CardHeader>
            <div className="mt-3 space-y-1">
              {leaderboard.error ? (
                <ErrorState message={leaderboard.error} onRetry={leaderboard.reload} />
              ) : leaderboard.loading ? (
                <LoadingBlock className="border-0 bg-transparent" label="Loading leaderboard" />
              ) : leaderboardEntries.length ? (
                leaderboardEntries.map((entry) => (
                  <div
                    key={`${entry.rank}-${entry.name}`}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-2.5 py-2",
                      entry.is_you ? "border border-aurora-400/30 bg-aurora-400/8" : "border border-transparent",
                    )}
                  >
                    <span className={cn("w-6 text-center font-display text-[12px] font-semibold", RANK_STYLES[entry.rank - 1] ?? "text-slate-400")} aria-hidden="true">
                      {entry.rank <= 3 ? <Medal size={14} className="mx-auto" /> : entry.rank}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-slate-200">
                      {entry.name}
                      {entry.is_you ? <span className="ml-1.5 text-[10px] text-aurora-400">you</span> : null}
                    </span>
                    <span className="text-[11.5px] font-medium tabular-nums text-slate-100">
                      {formatNumber(entry.avoided_kg)} kg
                    </span>
                  </div>
                ))
              ) : (
                <p className="py-4 text-center text-[12px] text-slate-400">No leaderboard entries yet.</p>
              )}
            </div>
          </Card>

          <Card className="bg-gradient-to-br from-aurora-500/10 via-transparent to-glow-500/8">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-aurora-400/15 text-aurora-300" aria-hidden="true">
                <Award size={18} />
              </span>
              <div>
                <CardTitle as="h2">Start a habit, not a competition</CardTitle>
                <CardDescription>
                  Leaderboards are opt-in and show display names only. The real measure is the collective kilograms
                  avoided — not who logged last.
                </CardDescription>
              </div>
            </div>
            <Button to="/my-impact" variant="outline" size="sm" className="mt-4">
              Log an activity
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default Community;
