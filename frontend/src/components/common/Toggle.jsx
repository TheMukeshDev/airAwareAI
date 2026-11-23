import { cn } from "../../lib/utils";

export function Toggle({ checked, onChange, label, description, id, className, labelId }) {
  const computedLabelId = labelId || (id ? `${id}-label` : undefined);
  const descriptionId = description && id ? `${id}-description` : undefined;
  const accessibleLabel = computedLabelId
    ? { "aria-labelledby": computedLabelId }
    : { "aria-label": label || "Toggle" };
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <span id={computedLabelId} className="text-[13.5px] font-medium text-slate-200">
          {label}
        </span>
        {description ? (
          <p id={descriptionId} className="mt-0.5 text-[12.5px] leading-snug text-slate-400">
            {description}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        id={id}
        {...accessibleLabel}
        aria-checked={Boolean(checked)}
        aria-describedby={descriptionId}
        onClick={() => onChange?.(!checked)}
        className={cn(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors duration-200",
          checked ? "border-aurora-400/50 bg-aurora-500/80" : "border-white/12 bg-white/8",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-transform duration-200",
            checked ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}

export function Segmented({ options, value, onChange, size = "md", className, ariaLabel }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-xl border border-hairline bg-ink-900/70 p-1",
        className,
      )}
      role="group"
      aria-label={ariaLabel || "Options"}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-label={option.label}
            aria-pressed={active}
            onClick={() => onChange?.(option.value)}
            className={cn(
              "rounded-lg font-medium transition-colors",
              size === "sm" ? "px-2.5 py-1 text-[11.5px]" : "px-3.5 py-1.5 text-[12.5px]",
              active ? "bg-aurora-400/15 text-aurora-300" : "text-slate-400 hover:text-slate-200",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default Toggle;
