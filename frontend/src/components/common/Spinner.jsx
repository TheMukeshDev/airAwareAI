import { cn } from "../../lib/utils";

export function Spinner({ className, label = "Loading" }) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        "inline-block h-5 w-5 animate-spin rounded-full border-2 border-aurora-400/30 border-t-aurora-400",
        className,
      )}
    />
  );
}

export function LoadingBlock({ className, label = "Loading data" }) {
  return (
    <div className={cn("surface flex min-h-[180px] flex-col items-center justify-center gap-3 p-8", className)}>
      <Spinner label={label} />
      <p className="text-[13px] text-slate-400">{label}</p>
    </div>
  );
}

export default Spinner;
