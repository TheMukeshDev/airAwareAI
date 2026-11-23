import { NavLink, useNavigate } from "react-router-dom";
import { LogOut, Sparkles, ChevronRight } from "lucide-react";
import { cn, initials } from "../../lib/utils";
import { navGroups } from "../../lib/navigation";
import { useAuth } from "../../context/AuthContext";
import { Logo } from "./Logo";

export function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <aside className="glass-nav fixed inset-y-0 left-0 z-40 hidden w-[268px] flex-col lg:flex">
      <div className="flex h-[72px] items-center px-5">
        <Logo to="/dashboard" />
      </div>

      <nav className="no-scrollbar flex-1 overflow-y-auto px-3 pb-4" aria-label="Primary">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-6">
            <p className="px-2.5 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              {group.label}
            </p>
            <ul className="space-y-1">
              {group.items.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    className={({ isActive }) =>
                      cn(
                        "group relative flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-[13.5px] font-medium transition-colors",
                        isActive
                          ? "bg-white/[0.07] text-white"
                          : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className={cn(
                            "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full transition-all",
                            isActive ? "bg-aurora-400 opacity-100" : "opacity-0",
                          )}
                          aria-hidden="true"
                        />
                        <Icon
                          size={17}
                          aria-hidden="true"
                          className={cn("shrink-0 transition-colors", isActive ? "text-aurora-400" : "text-slate-400 group-hover:text-slate-300")}
                        />
                        <span className="truncate">{label}</span>
                        {isActive ? <ChevronRight size={14} className="ml-auto text-slate-400" aria-hidden="true" /> : null}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="px-3 pb-3">
        <NavLink
          to="/assistant"
          className="block rounded-2xl border border-aurora-400/25 bg-gradient-to-br from-aurora-500/16 via-aurora-500/6 to-glow-500/10 p-3.5 transition-colors hover:border-aurora-400/40"
        >
          <div className="flex items-center gap-2 text-[12px] font-semibold text-aurora-300">
            <Sparkles size={14} aria-hidden="true" />
            Gemini inside
          </div>
          <p className="mt-1.5 text-[11.5px] leading-snug text-slate-400">
            Ask about today&apos;s air and get a plan built around your habits.
          </p>
        </NavLink>
      </div>

      <div className="border-t border-hairline p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-aurora-400/30 to-glow-400/20 text-[12px] font-semibold text-aurora-200 ring-1 ring-white/10">
            {initials(user?.name || "Air Aware") || "AA"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-slate-100">{user?.name || "Guest"}</p>
            <p className="truncate text-[11px] text-slate-400">{user?.location?.city || user?.email || "Not signed in"}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/6 hover:text-verypoor"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
