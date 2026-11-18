import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router-dom";
import { AppShell, ScrollToTop } from "./components/layout/AppShell";
import { PublicLayout } from "./components/layout/PublicLayout";
import { NotFound, ProtectedRoute, PublicOnlyRoute } from "./components/layout/ProtectedRoute";
import { LoadingBlock } from "./components/common/Spinner";
import { ErrorBoundary } from "./components/common/ErrorBoundary";

const Landing = lazy(() => import("./pages/Landing"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AirQuality = lazy(() => import("./pages/AirQuality"));
const Lifestyle = lazy(() => import("./pages/Lifestyle"));
const DailyPlan = lazy(() => import("./pages/DailyPlan"));
const IndoorAir = lazy(() => import("./pages/IndoorAir"));
const Impact = lazy(() => import("./pages/Impact"));
const Assistant = lazy(() => import("./pages/Assistant"));
const Community = lazy(() => import("./pages/Community"));
const Settings = lazy(() => import("./pages/Settings"));

function RouteFallback() {
  return <LoadingBlock className="min-h-[40vh]" label="Loading page" />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ScrollToTop />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Landing />} />
          </Route>

          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route element={<AppShell />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/air-quality" element={<AirQuality />} />
              <Route path="/lifestyle" element={<Lifestyle />} />
              <Route path="/daily-plan" element={<DailyPlan />} />
              <Route path="/indoor-air" element={<IndoorAir />} />
              <Route path="/my-impact" element={<Impact />} />
              <Route path="/assistant" element={<Assistant />} />
              <Route path="/community" element={<Community />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
