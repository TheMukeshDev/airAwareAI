import { Inbox } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "./Button";

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-12 text-center",
        className,
      )}
    >
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-400">
        <Icon size={20} aria-hidden="true" />
      </span>
      <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
      {description ? <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-slate-400">{description}</p> : null}
      {action ? (
        <div className="mt-5">
          {typeof action === "string" ? <Button to={action} size="sm">Continue</Button> : action}
        </div>
      ) : null}
    </div>
  );
}

export default EmptyState;
