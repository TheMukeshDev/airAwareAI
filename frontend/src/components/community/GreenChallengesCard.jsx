import toast from "react-hot-toast";
import { CalendarClock, Check, Users } from "lucide-react";
import { Button } from "../common/Button";
import { Card, CardDescription, CardHeader, CardTitle } from "../common/Card";
import { Badge } from "../common/Badge";
import { Progress } from "../common/Progress";
import { LoadingBlock } from "../common/Spinner";
import { ErrorState } from "../common/ErrorState";
import { communityApi, apiError } from "../../services/api";
import { formatNumber } from "../../lib/utils";

export function GreenChallengesCard({ challengeState, onJoined, busyId }) {
  const challenges = challengeState.data?.items ?? [];
  const join = async (challenge) => {
    onJoined.setBusy(challenge.id);
    try {
      const response = await communityApi.join(challenge.id);
      const updated = response.challenge ?? { ...challenge, joined: true };
      onJoined.setItem(challenge.id, { ...challenge, ...updated, joined: true });
      onJoined.incrementMembers(challenge.joined);
      toast.success(`Joined “${challenge.title}”.`);
    } catch (error) {
      toast.error(apiError(error, "Could not join that challenge."));
    } finally {
      onJoined.setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader action={<Badge tone="neutral">{challenges.length} open</Badge>}>
        <CardTitle as="h2">Green challenges</CardTitle>
        <CardDescription>Join a challenge to have your logged activities count toward its goal.</CardDescription>
      </CardHeader>
      <div className="mt-4 space-y-2.5">
        {challengeState.error ? (
          <ErrorState message={challengeState.error} onRetry={challengeState.reload} />
        ) : challengeState.loading ? (
          <LoadingBlock className="border-0 bg-transparent" label="Loading challenges" />
        ) : challenges.length ? (
          challenges.map((challenge) => (
            <div key={challenge.id} className="rounded-xl border border-hairline bg-ink-900/50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[13px] font-semibold text-slate-100">{challenge.title}</h3>
                    <Badge tone={challenge.joined ? "aurora" : "neutral"}>
                      {challenge.joined ? "Joined" : challenge.category ?? "Challenge"}
                    </Badge>
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
                  loading={busyId === challenge.id}
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
  );
}

export default GreenChallengesCard;
