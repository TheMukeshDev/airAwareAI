import { Leaf } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "../common/Card";
import { DataNote } from "../common/DataNote";
import { formatNumber } from "../../lib/utils";
import { FootprintBreakdownCard } from "./FootprintBreakdownCard";

export function ImprovementCard({ analysis }) {
  const opportunities = analysis?.opportunities ?? [];
  return (
    <Card>
      <CardHeader
        action={<Leaf size={15} className="text-aurora-300" aria-hidden="true" />}
      >
        <CardTitle as="h2">Areas for improvement</CardTitle>
        <CardDescription>Ranked by estimated monthly saving</CardDescription>
      </CardHeader>
      <ul className="mt-4 space-y-2.5" role="status" aria-live="polite">
        {opportunities.map((item) => (
          <li key={item.title} className="rounded-xl border border-hairline bg-ink-900/50 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[12.5px] font-medium text-slate-100">{item.title}</p>
              {item.saving_kg !== undefined && item.saving_kg !== null ? (
                <span className="shrink-0 rounded-full border border-aurora-400/30 bg-aurora-400/10 px-2 py-0.5 text-[10px] font-semibold text-aurora-300">
                  −{formatNumber(item.saving_kg)} kg
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-slate-300">{item.detail}</p>
            {item.difficulty ? (
              <p className="mt-1.5 text-[10.5px] uppercase tracking-wider text-slate-400">{item.difficulty}</p>
            ) : null}
          </li>
        ))}
        {opportunities.length ? null : (
          <li className="text-[11.5px] text-slate-400">No opportunities identified for this profile yet.</li>
        )}
      </ul>
    </Card>
  );
}

export function LifestyleAnalysis({ analysis }) {
  return (
    <>
      <FootprintBreakdownCard analysis={analysis} />
      <ImprovementCard analysis={analysis} />
      <DataNote>
        {analysis.assumptions?.[0] ??
          "Emission factors must be documented and versioned; values are estimates unless stated otherwise."}
      </DataNote>
    </>
  );
}

export default LifestyleAnalysis;
