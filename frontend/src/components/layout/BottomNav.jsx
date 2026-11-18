import { NavLink, useNavigate } from "react-router-dom";
import { Bell, LogOut, Sparkles } from "lucide-react";
import { cn, initials } from "../../lib/utils";
import { bottomNavItems } from "../../lib/navigation";
import { useAuth } from "../../context/AuthContext";
import { Logo } from "./Logo";

export function MobileTopbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-hairline bg-ink-950/85 px-4 backdrop-blur-xl lg:hidden">
      <Logo to="/dashboard" />
      <div className="flex items-center gap-1">
        <NavLink
          to="/assistant"
          className="rounded-xl p-2.5 text-aurora-300 transition-colors hover:bg-white/6"
          aria-label="Ask AirAware AI"
        >
          <Sparkles size={18} aria-hidden="true" />
        </NavLink>
        <button
          type="button"
          className="rounded-xl p-2.5 text-slate-400 transition-colors hover:bg-white/6 hover:text-white"
          aria-label="Settings and notifications"
          onClick={() => navigate("/settings")}
        >
          <Bell size={18} aria-hidden="true" />
        </button>
        <NavLink
          to="/settings"
          className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-aurora-400/30 to-glow-400/20 text-[11px] font-semibold text-aurora-200 ring-1 ring-white/10"
          aria-label="Profile and settings"
        >
          {initials(user?.name || "Air Aware") || "AA"}
        </NavLink>
        <button
          type="button"
          onClick={() => {
            logout();
            navigate("/login", { replace: true });
          }}
          className="hidden rounded-xl p-2.5 text-slate-400 hover:text-verypoor sm:block"
          aria-label="Sign out"
        >
          <LogOut size={17} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

export function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-ink-950/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      aria-label="Mobile primary"
    >
      <ul className="grid grid-cols-5">
        {bottomNavItems.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  "relative flex flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium transition-colors",
                  isActive ? "text-aurora-300" : "text-slate-400",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      "absolute top-0 h-0.5 w-8 rounded-full transition-opacity",
                      isActive ? "bg-aurora-400 opacity-100" : "opacity-0",
                    )}
                    aria-hidden="true"
                  />
                  <Icon size={19} strokeWidth={isActive ? 2.2 : 1.8} aria-hidden="true" />
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default BottomNav;
