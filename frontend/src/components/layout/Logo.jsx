import { Link } from "react-router-dom";
import { cn } from "../../lib/utils";

export function LogoMark({ className, size = 34 }) {
  return (
    <span
      className={cn(
        "relative flex items-center justify-center rounded-[11px] bg-gradient-to-br from-aurora-300 via-aurora-500 to-glow-500 text-ink-950 shadow-[0_8px_26px_-12px_rgba(23,201,147,0.9)]",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 21c3.9 0 7-2.9 7-6.6 0-4.4-4.6-8.3-6.3-11.1-.3-.5-1.1-.5-1.4 0C9.6 6.1 5 10 5 14.4 5 18.1 8.1 21 12 21Z"
          fill="currentColor"
          opacity="0.92"
        />
        <path d="M8.7 14.9h6.6M9.6 17.4h4.8" stroke="#052018" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
      </svg>
    </span>
  );
}

export function Logo({ to = "/", collapsed = false, className }) {
  return (
    <Link to={to} className={cn("group flex items-center gap-2.5", className)} aria-label="AirAware AI home">
      <LogoMark />
      {!collapsed ? (
        <span className="leading-none">
          <span className="block font-display text-[15px] font-semibold tracking-tight text-white">
            AirAware<span className="text-aurora-400"> AI</span>
          </span>
          <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.22em] text-slate-400">
            Breathe smarter
          </span>
        </span>
      ) : null}
    </Link>
  );
}

export default Logo;
