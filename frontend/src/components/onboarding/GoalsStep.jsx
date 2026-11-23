import { Check } from "lucide-react";
import { cn } from "../../lib/utils";
import { GOALS } from "../../lib/constants";

export function GoalsStep({ goals, onToggle }) {
  return (
    <div role="group" aria-labelledby="goals-heading">
      <p id="goals-heading" className="mb-2 text-[12.5px] font-medium text-slate-300">
        Goals
      </p>
      <div className="flex flex-wrap gap-2">
        {GOALS.map((goal) => {
          const selected = goals.includes(goal.value);
          return (
            <button
              key={goal.value}
              type="button"
              onClick={() => onToggle(goal.value)}
              aria-pressed={selected}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[12.5px] transition-colors",
                selected
                  ? "border-aurora-400/50 bg-aurora-400/12 text-aurora-200"
                  : "border-hairline bg-ink-900/60 text-slate-400 hover:border-white/20",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-full border",
                  selected
                    ? "border-aurora-400 bg-aurora-400 text-ink-950"
                    : "border-white/20",
                )}
              >
                {selected ? <Check size={10} strokeWidth={3} /> : null}
              </span>
              {goal.label}
            </button>
          );
        })}
      </div>
      {goals.length ? null : (
        <p role="alert" className="mt-2 text-[12px] text-moderate">
          Select at least one goal to personalise your plan.
        </p>
      )}
    </div>
  );
}

export default GoalsStep;
