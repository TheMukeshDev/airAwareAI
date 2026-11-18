import { cn } from "../../lib/utils";

const tones = {
  neutral: "from-white/8 to-white/3 text-slate-200",
  aurora: "from-aurora-400/16 to-aurora-500/4 text-aurora-300",
  glow: "from-glow-400/16 to-glow-500/4 text-glow-300",
  good: "from-good/16 to-good/4 text-good",
  moderate: "from-moderate/16 to-moderate/4 text-moderate",
  poor: "from-poor/16 to-poor/4 text-poor",
  verypoor: "from-verypoor/16 to-verypoor/4 text-verypoor",
  severe: "from-severe/16 to-severe/4 text-severe",
};

export function Stat({ label, value, unit, icon: Icon, tone = "neutral", hint, className }) {
  return (
    <div className={cn("surface p-4 sm:p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11.5px] font-medium uppercase tracking-[0.14em] text-slate-400">{label}</p>
        {Icon ? (
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br border border-white/8",
              tones[tone],
            )}
            aria-hidden="true"
          >
            <Icon size={15} />
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="font-display text-2xl font-semibold text-white tabular-nums">{value}</span>
        {unit ? <span className="text-[12px] text-slate-400">{unit}</span> : null}
      </div>
      {hint ? <p className="mt-1.5 text-[12px] leading-snug text-slate-400">{hint}</p> : null}
    </div>
  );
}

export default Stat;
