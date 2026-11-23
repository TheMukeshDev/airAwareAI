import { useState } from "react";
import { PageHeader } from "../components/common/PageHeader";
import { Badge } from "../components/common/Badge";
import { ErrorState } from "../components/common/ErrorState";
import { DataNote } from "../components/common/DataNote";
import { useAsyncResource } from "../hooks/useAsyncResource";
import { impactApi } from "../services/api";
import { ImpactStats } from "../components/impact/ImpactStats";
import { WeeklyImpactCard } from "../components/impact/WeeklyImpactCard";
import { JourneyLogForm } from "../components/impact/JourneyLogForm";
import { ActivityHistoryCard } from "../components/impact/ActivityHistoryCard";

export default function Impact() {
  const [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState(1);
  const summary = useAsyncResource(() => impactApi.personal({ period: "30d" }), [refresh], {
    fallback: "Could not load your impact summary.",
  });
  const history = useAsyncResource(
    async () => {
      const response = await impactApi.history({ page, per_page: 8 });
      return {
        records: response.records ?? [],
        page: response.page ?? page,
        pages: response.pages ?? 1,
      };
    },
    [page, refresh],
    {
      initialData: { records: [], page: 1, pages: 1 },
      fallback: "Could not load your activity history.",
    },
  );

  const logged = () => {
    setPage(1);
    setRefresh((value) => value + 1);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Module 05"
        title="My environmental impact"
        description="Estimated emissions from activities you log, compared against a documented baseline. Estimates stay labelled — nothing here is independently verified."
        actions={<Badge tone="neutral">Factor set {summary.data?.factor_version ?? "unknown"}</Badge>}
      />
      {summary.error ? <ErrorState message={summary.error} onRetry={summary.reload} /> : null}
      <ImpactStats totals={summary.data?.totals} />
      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <WeeklyImpactCard data={summary.data} loading={summary.loading} />
        <JourneyLogForm onLogged={logged} />
      </div>
      <ActivityHistoryCard
        historyState={{
          records: history.data?.records ?? [],
          page: history.data?.page ?? 1,
          pages: history.data?.pages ?? 1,
          loading: history.loading,
          error: history.error,
          reload: history.reload,
        }}
        onPage={setPage}
      />
      <DataNote>
        Calculations use factor set {summary.data?.factor_version ?? "unknown"}: distance × emission factor, split by
        passengers, with the baseline and alternative measured over the same journey. Values are estimates, not verified
        measurements, and avoided emissions are not reductions in ambient city pollution.
      </DataNote>
    </div>
  );
}
