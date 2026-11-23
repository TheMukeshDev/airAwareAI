import { forwardRef } from "react";
import { Link } from "react-router-dom";
import { cn, safeExternalUrl } from "../../lib/utils";

const variants = {
  primary:
    "border border-transparent bg-aurora-400 text-ink-950 hover:brightness-[1.08] active:brightness-95 " +
    "shadow-[0_8px_20px_-14px_rgba(0,0,0,0.95)]",
  secondary:
    "border border-white/12 bg-ink-800/90 text-slate-100 hover:border-white/20 hover:bg-ink-750 active:bg-ink-900",
  outline:
    "border border-aurora-400/45 bg-transparent text-aurora-300 hover:border-aurora-400/70 hover:bg-aurora-400/10 active:bg-aurora-400/15",
  ghost: "border border-transparent text-slate-300 hover:border-white/8 hover:bg-white/6 hover:text-white active:bg-white/10",
  danger:
    "border border-verypoor/35 bg-verypoor/15 text-verypoor hover:border-verypoor/55 hover:bg-verypoor/20 active:bg-verypoor/25",
};

const sizes = {
  sm: "h-9 px-3.5 text-[12.5px] gap-1.5 rounded-[9px]",
  md: "h-11 px-5 text-[13.5px] gap-2 rounded-[10px]",
  lg: "h-12 px-6 text-[14.5px] gap-2 rounded-[11px]",
  icon: "h-10 w-10 rounded-[10px]",
};

export const Button = forwardRef(function Button(
  { to, href, variant = "primary", size = "md", className, children, loading, disabled, type = "button", ...props },
  ref,
) {
  const classes = cn(
    "inline-flex cursor-pointer items-center justify-center whitespace-nowrap font-semibold leading-none",
    "transition-[color,background-color,border-color,box-shadow,filter,transform] duration-160 select-none",
    "active:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45",
    variants[variant],
    sizes[size],
    className,
  );

  const content = (
    <>
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
      ) : null}
      {children}
    </>
  );

  if (to) {
    return (
      <Link ref={ref} to={to} className={classes} {...props}>
        {content}
      </Link>
    );
  }

  if (href) {
    const safeHref = safeExternalUrl(href);
    if (!safeHref) {
      return (
        <span ref={ref} className={cn(classes, "cursor-not-allowed opacity-50")} aria-disabled="true" {...props}>
          {content}
        </span>
      );
    }
    return (
      <a ref={ref} href={safeHref} className={classes} {...props}>
        {content}
      </a>
    );
  }

  return (
    <button ref={ref} type={type} className={classes} disabled={disabled || loading} {...props}>
      {content}
    </button>
  );
});

export default Button;
