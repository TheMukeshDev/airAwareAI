import { Check, Clock, Leaf, ShieldAlert, Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";

const priorities = {
  high: { label: "Priority", className: "border-verypoor/35 bg-verypoor/10 text-verypoor" },
  medium: { label: "Helpful", className: "border-moderate/35 bg-moderate/10 text-moderate" },
  low: { label: "Optional", className: "border-white/12 bg-white/5 text-slate-400" },
};

export function RecommendationItem({ item, onToggle, busy, index = 0 }) {
  const completed = Boolean(item.completed);
  const priority = priorities[item.priority] ?? priorities.medium;
  return (
    <li
      className={cn(
        "group flex gap-3 rounded-xl border border-hairline bg-ink-900/50 p-3.5 transition-colors hover:border-white/15",
        completed && "opacity-60",
        "animate-rise",
      )}
      style={{ animationDelay: `${Math.min(index * 45, 280)}ms` }}
    >
      <button
        type="button"
        onClick={() => onToggle?.(item)}
        disabled={busy || !onToggle}
        aria-pressed={completed}
        aria-label={completed ? `Mark ${item.title} as not done` : `Mark ${item.title} as done`}
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all",
          completed
            ? "border-aurora-400 bg-aurora-400 text-ink-950"
            : "border-white/20 text-transparent hover:border-aurora-400/70",
          busy && "animate-pulse",
        )}
      >
        <Check size={12} strokeWidth={3} aria-hidden="true" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn("text-[13.5px] font-medium text-slate-100", completed && "line-through")}>{item.title}</p>
          <span className={cn("rounded-full border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider", priority.className)}>
            {priority.label}
          </span>
        </div>
        {item.detail ? <p className="mt-1 text-[12.5px] leading-relaxed text-slate-400">{item.detail}</p> : null}
        {item.why ? (
          <p className="mt-1.5 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-slate-400">
            <Sparkles size={11} className="mt-0.5 shrink-0 text-aurora-400/80" aria-hidden="true" />
            {item.why}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[10.5px] text-slate-400">
          {item.window ? (
            <span className="inline-flex items-center gap-1">
              <Clock size={10} aria-hidden="true" />
              {item.window}
            </span>
          ) : null}
          {item.co2_saved_kg ? (
            <span className="inline-flex items-center gap-1 text-aurora-400/90">
              <Leaf size={10} aria-hidden="true" />
              ~{item.co2_saved_kg} kg CO₂e avoided
            </span>
          ) : null}
          {item.safety ? (
            <span className="inline-flex items-center gap-1 text-moderate">
              <ShieldAlert size={10} aria-hidden="true" />
              {item.safety}
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function RecommendationList({ items = [], onToggle, busyId, className }) {
  if (!items.length) return null;
  return (
    <ul className={cn("space-y-2.5", className)}>
      {items.map((item, index) => (
        <RecommendationItem
          key={item.id ?? `${item.title}-${index}`}
          item={item}
          index={index}
          busy={busyId === item.id}
          onToggle={onToggle}
        />
      ))}
    </ul>
  );
}

export default RecommendationList;
