import { cn } from "../../lib/utils";

export function Progress({ value = 0, tone = "aurora", className, label }) {
  const clamped = Math.min(100, Math.max(0, Number(value) || 0));
  const bars = {
    aurora: "bg-gradient-to-r from-aurora-500 to-aurora-300",
    glow: "bg-gradient-to-r from-glow-500 to-glow-300",
    good: "bg-good",
    moderate: "bg-moderate",
    verypoor: "bg-verypoor",
  };
  return (
    <div className={cn("space-y-2", className)}>
      {label ? (
        <div className="flex items-center justify-between text-[12px] text-slate-400">
          <span>{label}</span>
          <span className="font-medium text-slate-200">{Math.round(clamped)}%</span>
        </div>
      ) : null}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-white/8"
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || "Progress"}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-700 ease-out", bars[tone] ?? bars.aurora)}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

export default Progress;
