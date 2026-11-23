import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Spinner } from "../common/Spinner";
import { Button } from "../common/Button";

function BootSplash() {
  return (
    <main id="main-content" tabIndex={-1} className="app-bg flex min-h-screen flex-col items-center justify-center gap-3">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink-800 focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>
      <Spinner />
      <p className="text-[12px] text-slate-400">Restoring your session…</p>
    </main>
  );
}

export function ProtectedRoute() {
  const { isAuthenticated, booting, needsOnboarding } = useAuth();
  const location = useLocation();

  if (booting) return <BootSplash />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (needsOnboarding && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }
  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { isAuthenticated, booting } = useAuth();
  if (booting) return <BootSplash />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

export function NotFound() {
  return (
    <main id="main-content" tabIndex={-1} className="app-bg flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink-800 focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>
      <p className="font-display text-[72px] font-semibold leading-none text-white/10">404</p>
      <h1 className="mt-2 font-display text-2xl font-semibold text-white">This page drifted away</h1>
      <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-slate-400">
        The route you followed does not exist. Head back to your dashboard or the public air quality preview.
      </p>
      <div className="mt-6 flex gap-2">
        <Button to="/dashboard">Go to dashboard</Button>
        <Button to="/" variant="secondary">
          Home
        </Button>
      </div>
    </main>
  );
}

export default ProtectedRoute;
