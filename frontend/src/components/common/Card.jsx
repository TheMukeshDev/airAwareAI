import { cn } from "../../lib/utils";

export function Card({ className, as: Component = "section", ...props }) {
  return <Component className={cn("surface p-5 sm:p-6", className)} {...props} />;
}

export function CardHeader({ className, children, action, ...props }) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)} {...props}>
      <div className="min-w-0">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardTitle({ className, as: Component = "h3", ...props }) {
  return <Component className={cn("text-[15px] font-semibold text-white", className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
  return <p className={cn("mt-1 text-[13px] leading-relaxed text-slate-400", className)} {...props} />;
}

export default Card;
