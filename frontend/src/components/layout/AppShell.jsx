import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import { BottomNav, MobileTopbar } from "./BottomNav";

export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "instant" });
  }, [pathname]);
  return null;
}

export function AppShell() {
  const { pathname } = useLocation();
  const routeKey =
    pathname === "/air-quality" ? "air-quality" :
    pathname === "/lifestyle" ? "lifestyle" :
    pathname === "/daily-plan" ? "daily-plan" :
    pathname === "/indoor-air" ? "indoor-air" :
    pathname === "/my-impact" ? "my-impact" :
    pathname === "/assistant" ? "assistant" :
    pathname === "/community" ? "community" :
    pathname === "/settings" ? "settings" : "dashboard";

  return (
    <div className="app-bg min-h-screen" data-route={routeKey}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink-800 focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>
      <Sidebar />
      <div className="lg:pl-[268px]">
        <MobileTopbar />
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1180px] px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-9"
        >
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}

export default AppShell;
