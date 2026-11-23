import { ArrowRight, CheckCircle2, MapPin } from "lucide-react";
import { Badge } from "../common/Badge";

const DEFINITIONS = [
  ["Personal emissions", "Activities you actually performed, estimated with documented emission factors."],
  ["Avoided emissions", "Baseline mode minus the alternative you chose — never a claim about ambient AQI."],
  ["Exposure", "Your potential contact with pollutants, based on readings and time outdoors."],
  ["Community impact", "Aggregated avoided emissions across participants, double-counting removed."],
];

const INDIA_NOTES = [
  { label: "Indian National AQI (CPCB)", note: "Reported alongside US AQI, never merged" },
  { label: "PM2.5 as a concentration", note: "Not presented as a complete AQI value" },
  { label: "Winter smog awareness", note: "Outdoor-exertion guidance follows public health thresholds" },
  { label: "Household reality", note: "Cooking, ventilation and filtration guidance by fuel type" },
];

export function LandingImpact() {
  return (
    <section id="impact" className="border-t border-hairline bg-ink-950/40 py-16 sm:py-20">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-aurora-400">Environmental impact</p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-white sm:text-4xl">Estimates you can audit</h2>
          <p className="mt-3 text-[14px] leading-relaxed text-slate-300">
            We separate four ideas that dashboards usually blur together: personal emissions, avoided emissions, air
            pollution exposure and community impact. Each calculation stores its factors, assumptions and version.
          </p>
          <div className="mt-6 space-y-3">
            {DEFINITIONS.map(([label, body]) => (
              <div key={label} className="flex gap-3">
                <span aria-hidden="true" className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-aurora-400" />
                <p className="text-[12.5px] leading-relaxed text-slate-300">
                  <span className="font-medium text-slate-100">{label}: </span>
                  {body}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-7 flex flex-wrap gap-2">
            <Badge tone="neutral">E = D × EF</Badge>
            <Badge tone="neutral">Avoided = baseline − alternative</Badge>
            <Badge tone="neutral">Versioned factor sets</Badge>
          </div>
        </div>
        <div className="surface p-6">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-300">
            <MapPin size={12} className="text-aurora-400" aria-hidden="true" />
            Designed for Indian cities
          </div>
          <div className="mt-4 space-y-3">
            {INDIA_NOTES.map((item) => (
              <div key={item.label} className="flex items-start justify-between gap-4 rounded-xl border border-hairline bg-ink-900/50 px-4 py-3">
                <div>
                  <p className="text-[13px] font-medium text-slate-100">{item.label}</p>
                  <p className="mt-0.5 text-[11.5px] text-slate-300">{item.note}</p>
                </div>
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-aurora-400" aria-hidden="true" />
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-xl border border-hairline bg-ink-950/40 p-4">
            <p className="text-[12px] leading-relaxed text-slate-300">
              “The air is not just a number. It is what your commute, your kitchen and your city do to your lungs — and
              what you can still change today.”
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-300">
              AirAware AI product principle
              <ArrowRight size={10} aria-hidden="true" />
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default LandingImpact;
