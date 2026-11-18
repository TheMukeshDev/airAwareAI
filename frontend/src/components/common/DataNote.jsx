import { Info } from "lucide-react";
import { cn } from "../../lib/utils";

export function DataNote({ children, className, tone = "neutral" }) {
  const tones = {
    neutral: "border-hairline bg-white/[0.02] text-slate-400",
    warning: "border-moderate/25 bg-moderate/[0.06] text-moderate/90",
    info: "border-glow-400/20 bg-glow-400/[0.05] text-slate-400",
  };
  return (
    <div className={cn("flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[11.5px] leading-relaxed", tones[tone], className)}>
      <Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

export default DataNote;
