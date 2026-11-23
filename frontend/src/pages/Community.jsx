import { useState } from "react";
import { PageHeader } from "../components/common/PageHeader";
import { Badge } from "../components/common/Badge";
import { ErrorState } from "../components/common/ErrorState";
import { DataNote } from "../components/common/DataNote";
import { useAsyncResource } from "../hooks/useAsyncResource";
import { communityApi } from "../services/api";
import { CommunityStats } from "../components/community/CommunityStats";
import { GreenChallengesCard } from "../components/community/GreenChallengesCard";
import { LeaderboardCard, CommunityCallout } from "../components/community/LeaderboardCard";

export default function Community() {
  const stats = useAsyncResource(() => communityApi.stats(), [], {
    fallback: "Could not load community totals.",
  });
  const challenges = useAsyncResource(
    async () => ({ items: (await communityApi.challenges()).challenges ?? [] }),
    [],
    { initialData: { items: [] }, fallback: "Could not load green challenges." },
  );
  const leaderboard = useAsyncResource(
    async () => ({ entries: (await communityApi.leaderboard({ page: 1, per_page: 10 })).entries ?? [] }),
    [],
    { initialData: { entries: [] }, fallback: "Could not load the leaderboard." },
  );
  const [busyId, setBusyId] = useState(null);

  const setChallengeItem = (id, value) =>
    challenges.setData((previous) => ({
      items: previous.items.map((challenge) => (challenge.id === id ? value : challenge)),
    }));
  const incrementMembers = (alreadyJoined) =>
    stats.setData((previous) =>
      previous && {
        ...previous,
        members: !alreadyJoined && typeof previous.members === "number" ? previous.members + 1 : previous.members,
      },
    );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Module 07"
        title="Community hub"
        description="Collective progress, built only from aggregated estimates. Individual locations and habits are never shown."
        actions={<Badge tone="aurora" dot>Privacy-safe aggregation</Badge>}
      />
      {stats.error ? <ErrorState message={stats.error} onRetry={stats.reload} /> : null}
      <CommunityStats stats={stats.data} />
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <GreenChallengesCard
            challengeState={challenges}
            busyId={busyId}
            onJoined={{ setBusy: setBusyId, setItem: setChallengeItem, incrementMembers }}
          />
          <DataNote tone="info">
            Community totals sum each participant's avoided-emissions estimate. Shared journeys are split per person
            before aggregation to avoid double-counting, and no individual data is exposed.
          </DataNote>
        </div>
        <div className="space-y-4">
          <LeaderboardCard leaderboardState={leaderboard} />
          <CommunityCallout />
        </div>
      </div>
    </div>
  );
}
