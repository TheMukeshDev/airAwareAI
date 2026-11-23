import { Lamp, ShieldCheck, ThermometerSun, Wrench, Wind } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "../common/Card";
import { Badge } from "../common/Badge";
import { LoadingBlock } from "../common/Spinner";

const ICONS = {
  ventilation: Wind,
  cooking: Lamp,
  filtration: ShieldCheck,
  maintenance: Wrench,
  general: ThermometerSun,
};

export function IndoorAssessment({ assessment, loading }) {
  if (loading) return <LoadingBlock label="Assessing your home" />;
  if (!assessment) {
    return (
      <Card role="status">
        <CardTitle as="h2">No assessment yet</CardTitle>
        <CardDescription>
          Complete the two steps and AirAware will prioritise actions for your home — starting with the cheapest and most
          effective.
        </CardDescription>
      </Card>
    );
  }

  const recommendations = assessment.recommendations ?? [];
  return (
    <>
      <Card>
        <CardHeader action={<Badge tone="aurora">{assessment.score ?? "—"}/100</Badge>}>
          <CardTitle as="h2">Indoor air score</CardTitle>
          <CardDescription>{assessment.summary}</CardDescription>
        </CardHeader>
        {assessment.immediate ? (
          <p role="status" className="mt-3 rounded-xl border border-moderate/25 bg-moderate/[0.07] p-3 text-[11.5px] leading-relaxed text-moderate/90">
            {assessment.immediate}
          </p>
        ) : null}
      </Card>
      {recommendations.map((section) => {
        const Icon = ICONS[section.key] ?? ICONS.general;
        return (
          <Card key={section.key}>
            <CardHeader action={<Icon size={15} className="text-aurora-300" aria-hidden="true" />}>
              <CardTitle as="h2">{section.label}</CardTitle>
            </CardHeader>
            <ul className="mt-3 space-y-2.5">
              {(section.items ?? []).map((item) => (
                <li key={item.title} className="rounded-xl border border-hairline bg-ink-900/50 p-3.5">
                  <p className="text-[12.5px] font-medium text-slate-100">{item.title}</p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-slate-300">{item.detail}</p>
                  {item.cost ? (
                    <p className="mt-1.5 text-[10.5px] uppercase tracking-wider text-slate-400">{item.cost}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </>
  );
}

export default IndoorAssessment;
