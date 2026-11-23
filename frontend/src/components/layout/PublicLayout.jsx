import { useEffect, useRef, useState } from "react";

import { Link, NavLink, Outlet } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Logo, LogoMark } from "./Logo";
import { Button } from "../common/Button";
import { useAuth } from "../../context/AuthContext";

const links = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#impact", label: "Impact" },
];

export function PublicLayout() {
  const [open, setOpen] = useState(false);
  const { isAuthenticated } = useAuth();
  const menuId = "public-mobile-menu";
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const previouslyOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      if (previouslyOpenRef.current) triggerRef.current?.focus();
      previouslyOpenRef.current = false;
      return undefined;
    }
    previouslyOpenRef.current = true;
    const focusable = () =>
      [triggerRef.current, ...(menuRef.current?.querySelectorAll('a[href], button:not([disabled])') ?? [])].filter(
        Boolean,
      );
    const frame = requestAnimationFrame(() => focusable()[1]?.focus());
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);


  return (
    <div className="app-bg min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink-800 focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-40 border-b border-hairline bg-ink-950/70 backdrop-blur-xl">
        <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo to="/" />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Marketing">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-lg px-3.5 py-2 text-[13.5px] text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            {isAuthenticated ? (
              <Button to="/dashboard" size="sm">
                Open dashboard
              </Button>
            ) : (
              <>
                <Button to="/login" variant="ghost" size="sm">
                  Sign in
                </Button>
                <Button to="/register" size="sm">
                  Create account
                </Button>
              </>
            )}
          </div>
          <button
            ref={triggerRef}
            type="button"
            className="rounded-lg p-2 text-slate-300 md:hidden"

            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls={menuId}
          >
            {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
        {open ? (
          <div ref={menuRef} id={menuId} className="border-t border-hairline px-4 pb-4 pt-3 md:hidden">

            <div className="flex flex-col gap-1">
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm text-slate-300 hover:bg-white/5"
                >
                  {link.label}
                </a>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button to={isAuthenticated ? "/dashboard" : "/login"} variant="secondary" size="sm">
                {isAuthenticated ? "Dashboard" : "Sign in"}
              </Button>
              <Button to={isAuthenticated ? "/assistant" : "/register"} size="sm">
                {isAuthenticated ? "Ask AirAware" : "Get started"}
              </Button>
            </div>
          </div>
        ) : null}
      </header>

      <main id="main-content" tabIndex={-1} className="">
        <Outlet />
      </main>

      <footer className="border-t border-hairline bg-ink-950/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <LogoMark size={26} />
              <span className="font-display text-sm font-semibold text-white">
                AirAware<span className="text-aurora-400"> AI</span>
              </span>
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-slate-400">
              Environmental intelligence for everyday decisions. Air quality data from CPCB, Open-Meteo and OpenAQ;
              guidance generated with Gemini and grounded in supplied readings. Emission factors and estimates are
              documented in-app and are not regulatory measurements.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-3 text-[12.5px] text-slate-400">
            <NavLink to="/air-quality" className="hover:text-white">Air quality</NavLink>
            <NavLink to="/assistant" className="hover:text-white">AI assistant</NavLink>
            <NavLink to="/community" className="hover:text-white">Community</NavLink>
            <Link to="/register" className="hover:text-white">Get started</Link>
          </div>
        </div>
        <div className="border-t border-hairline px-4 py-4 sm:px-6">
          <p className="mx-auto max-w-6xl text-[11px] leading-relaxed text-slate-400">
            AirAware AI provides estimates for awareness, not medical advice or regulatory reporting. Personal and
            community impact figures are modelled from documented emission factors and user-entered activity.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default PublicLayout;
