import { forwardRef } from "react";
import { Link } from "react-router-dom";
import { cn, safeExternalUrl } from "../../lib/utils";

const variants = {
  primary:
    "bg-aurora-400 text-ink-950 hover:bg-aurora-300 shadow-[0_14px_38px_-16px_rgba(23,201,147,0.9)]",
  secondary: "bg-white/8 text-slate-100 hover:bg-white/14 border border-white/10",
  outline:
    "border border-aurora-400/40 text-aurora-300 hover:bg-aurora-400/10 hover:border-aurora-400/60",
  ghost: "text-slate-300 hover:text-white hover:bg-white/6",
  danger: "bg-verypoor/15 text-verypoor border border-verypoor/30 hover:bg-verypoor/25",
};

const sizes = {
  sm: "h-9 px-3.5 text-[13px] gap-1.5 rounded-lg",
  md: "h-11 px-5 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-[15px] gap-2 rounded-xl",
  icon: "h-10 w-10 rounded-xl",
};

export const Button = forwardRef(function Button(
  { to, href, variant = "primary", size = "md", className, children, loading, disabled, ...props },
  ref,
) {
  const classes = cn(
    "inline-flex items-center justify-center font-medium transition-all duration-200 select-none",
    "disabled:opacity-50 disabled:pointer-events-none",
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
    <button ref={ref} type="button" className={classes} disabled={disabled || loading} {...props}>
      {content}
    </button>
  );
});

export default Button;
