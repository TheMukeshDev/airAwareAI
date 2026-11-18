import { cn } from "../../lib/utils";

const tones = {
  neutral: "border-white/12 bg-white/6 text-slate-300",
  aurora: "border-aurora-400/35 bg-aurora-400/10 text-aurora-300",
  glow: "border-glow-400/35 bg-glow-400/10 text-glow-300",
  good: "border-good/35 bg-good/10 text-good",
  moderate: "border-moderate/35 bg-moderate/10 text-moderate",
  poor: "border-poor/35 bg-poor/10 text-poor",
  verypoor: "border-verypoor/35 bg-verypoor/10 text-verypoor",
  severe: "border-severe/35 bg-severe/10 text-severe",
  muted: "border-white/10 bg-white/5 text-slate-400",
};

export function Badge({ tone = "neutral", className, children, dot, ...props }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide",
        tones[tone] ?? tones.neutral,
        className,
      )}
      {...props}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export default Badge;
