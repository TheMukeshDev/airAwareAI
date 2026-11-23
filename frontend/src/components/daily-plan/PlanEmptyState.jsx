import { Sparkles, Wand2 } from "lucide-react";
import { Button } from "../common/Button";
import { Card, CardDescription, CardTitle } from "../common/Card";
import { EmptyState } from "../common/EmptyState";
import { DataNote } from "../common/DataNote";

export function PlanEmptyState({ generating, onGenerate }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <EmptyState
        icon={Sparkles}
        title="No plan for today yet"
        description="The planner combines today's air quality, your commute and your household profile into a short list you can finish before bed."
        action={
          <Button onClick={() => onGenerate(false)} loading={generating}>
            <Wand2 size={15} aria-hidden="true" />
            Generate today's plan
          </Button>
        }
        className="min-h-[320px]"
      />
      <HowPlansWorkCard />
    </div>
  );
}

export function HowPlansWorkCard() {
  const steps = [
    "AirAware computes candidate actions from your profile and today's readings.",
    "It selects actions with known emission or exposure benefits.",
    "A model rewrites them for your routine, explains each one, and returns structured data.",
    "Every response is validated before it appears here.",
    "Completed actions are logged for impact tracking.",
  ];
  return (
    <Card>
      <CardTitle as="h2">How plans are built</CardTitle>
      <CardDescription>Computed safeguards, model wording.</CardDescription>
      <ol className="mt-4 space-y-3 text-[12px] leading-relaxed text-slate-300">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-2.5">
            <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/12 text-[10px] font-semibold text-slate-300">
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function ActivityNote() {
  return (
    <DataNote tone="info">
      Completed actions update your estimated avoided emissions. They do not change the city's measured AQI, and AirAware
      never claims that they do.
    </DataNote>
  );
}

export default PlanEmptyState;
