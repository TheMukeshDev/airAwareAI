import { Card, CardDescription, CardHeader, CardTitle } from "../common/Card";
import { Badge } from "../common/Badge";
import { cn } from "../../lib/utils";

export const INDOOR_SOURCES = [
  { key: "incense", label: "Incense, dhoop or candles" },
  { key: "smoking", label: "Indoor smoking" },
  { key: "biomass", label: "Wood, coal or biomass cooking" },
  { key: "frying", label: "Frequent high-heat frying" },
  { key: "pets", label: "Pets in living areas" },
  { key: "damp", label: "Damp walls or visible mould" },
  { key: "road_facing", label: "Home faces a busy road" },
  { key: "construction", label: "Construction or dust nearby" },
];

export function IndoorSourcesCard({ selected, onToggle }) {
  return (
    <Card>
      <CardHeader action={<Badge tone="neutral">Step 1</Badge>}>
        <CardTitle as="h2">Indoor pollution sources</CardTitle>
        <CardDescription>Select everything that applies. These matter more than outdoor AQI for many homes.</CardDescription>
      </CardHeader>
      <div className="mt-4 grid gap-2 sm:grid-cols-2" role="group" aria-label="Indoor pollution sources">
        {INDOOR_SOURCES.map((source) => {
          const active = selected.includes(source.key);
          return (
            <button
              key={source.key}
              type="button"
              onClick={() => onToggle(selected, source.key)}
              aria-pressed={active}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-left text-[12px] transition-colors",
                active
                  ? "border-aurora-400/45 bg-aurora-400/10 text-aurora-200"
                  : "border-hairline bg-ink-900/50 text-slate-300 hover:border-white/15",
              )}
            >
              {source.label}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

export default IndoorSourcesCard;
