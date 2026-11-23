import { AlertTriangle } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./Button";

export function ErrorState({ message, onRetry, retryLabel = "Retry", className, compact = false }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-verypoor/30 bg-verypoor/[0.06] p-4 text-center",
        compact ? "min-h-[88px]" : "min-h-[150px]",
        className,
      )}
    >
      <AlertTriangle size={18} className="shrink-0 text-verypoor" aria-hidden="true" />
      <p className="max-w-sm text-[12.5px] leading-relaxed text-slate-100">{message}</p>
      {onRetry ? (
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

export default ErrorState;
