import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "../common/Button";
import { Card, CardDescription, CardHeader, CardTitle } from "../common/Card";
import { Badge } from "../common/Badge";
import { LoadingBlock } from "../common/Spinner";
import { ErrorState } from "../common/ErrorState";
import { TRANSPORT_MODES } from "../../lib/constants";
import { formatNumber } from "../../lib/utils";

function modeLabel(value) {
  return TRANSPORT_MODES.find((mode) => mode.value === value)?.label ?? value ?? "Unknown";
}

export function ActivityHistoryCard({ historyState, onPage }) {
  const records = Array.isArray(historyState.records) ? historyState.records : [];
  const pages = typeof historyState.pages === "number" ? historyState.pages : 1;
  return (
    <Card>
      <CardHeader action={<Badge tone="neutral">{historyState.page}/{pages}</Badge>}>
        <CardTitle as="h2">Activity history</CardTitle>
        <CardDescription>Most recent first. Pagination keeps long histories fast.</CardDescription>
      </CardHeader>
      <div className="mt-3 overflow-x-auto">
        {historyState.error ? (
          <ErrorState message={historyState.error} onRetry={historyState.reload} />
        ) : historyState.loading ? (
          <LoadingBlock className="border-0 bg-transparent" label="Loading history" />
        ) : records.length ? (
          <table className="w-full min-w-[560px] text-left text-[12px]">
            <caption className="sr-only">Logged journey history with baseline, actual emissions, and avoided emissions</caption>
            <thead>
              <tr className="text-[10.5px] uppercase tracking-[0.12em] text-slate-400">
                <th scope="col" className="pb-2 font-medium">Date</th>
                <th scope="col" className="pb-2 font-medium">Journey</th>
                <th scope="col" className="pb-2 font-medium">Distance</th>
                <th scope="col" className="pb-2 font-medium">Baseline</th>
                <th scope="col" className="pb-2 font-medium">Actual</th>
                <th scope="col" className="pb-2 text-right font-medium">Avoided</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {records.map((record) => (
                <tr key={record.id}>
                  <td className="py-2.5 text-slate-300">{record.date}</td>
                  <td className="py-2.5 text-slate-200">
                    {modeLabel(record.baseline_mode)} → <span className="text-aurora-300">{modeLabel(record.actual_mode)}</span>
                  </td>
                  <td className="py-2.5 tabular-nums text-slate-300">{formatNumber(record.distance_km)} km</td>
                  <td className="py-2.5 tabular-nums text-slate-400">{formatNumber(record.baseline_kg, { maximumFractionDigits: 2 })}</td>
                  <td className="py-2.5 tabular-nums text-slate-400">{formatNumber(record.actual_kg, { maximumFractionDigits: 2 })}</td>
                  <td className="py-2.5 text-right font-medium tabular-nums text-aurora-300">
                    {record.avoided_kg > 0 ? "+" : ""}{formatNumber(record.avoided_kg, { maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="py-6 text-center text-[12px] text-slate-400">No activities logged yet.</p>
        )}
      </div>
      {pages > 1 ? (
        <div className="mt-3 flex items-center justify-end gap-2 border-t border-hairline pt-3">
          <Button variant="ghost" size="sm" disabled={historyState.page <= 1} onClick={() => onPage(historyState.page - 1)}>
            <ArrowLeft size={13} aria-hidden="true" />
            Previous
          </Button>
          <Button variant="ghost" size="sm" disabled={historyState.page >= pages} onClick={() => onPage(historyState.page + 1)}>
            Next
            <ArrowRight size={13} aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

export default ActivityHistoryCard;
