import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      name: "Branch User",
      email: "branch@example.com",
      location: { city: "Delhi", latitude: 28.61, longitude: 77.21 },
      preferences: { aqi_scale: "india", notifications: true },
    },
    logout: vi.fn(),
  }),
}));

vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import Badge from "../components/common/Badge";
import EmptyState from "../components/common/EmptyState";
import ErrorState from "../components/common/ErrorState";
import PageHeader from "../components/common/PageHeader";
import Progress from "../components/common/Progress";
import { Stat } from "../components/common/Stat";
import Toggle, { Segmented } from "../components/common/Toggle";
import Logo from "../components/layout/Logo";
import { Sidebar } from "../components/layout/Sidebar";
import { BottomNav, MobileTopbar } from "../components/layout/BottomNav";

import AqiCard from "../components/dashboard/AqiCard";
import DailyPlanSummaryCard from "../components/dashboard/DailyPlanSummaryCard";
import DashboardStats from "../components/dashboard/DashboardStats";
import NearbyGridCard from "../components/dashboard/NearbyGridCard";
import PollutionTrendCard from "../components/dashboard/PollutionTrendCard";
import WeatherStrip from "../components/dashboard/WeatherStrip";
import VentilationWindowCard from "../components/dashboard/VentilationWindowCard";
import RecommendationList from "../components/dashboard/RecommendationList";

import LiveContextCard, { SafetyCard, AssistantDataNote } from "../components/assistant/LiveContextCard";
import SourceCitationList from "../components/assistant/SourceCitationList";
import ChatMessageList from "../components/assistant/ChatMessageList";
import SuggestedPrompts from "../components/assistant/SuggestedPrompts";
import AssistantComposer from "../components/assistant/AssistantComposer";

import PlanContextCard from "../components/daily-plan/PlanContextCard";
import PlanSummaryCard from "../components/daily-plan/PlanSummaryCard";
import DataProvenance from "../components/air-quality/DataProvenance";
import ForecastChart from "../components/air-quality/ForecastChart";
import MapCard from "../components/air-quality/MapCard";
import PollutantBreakdownCard from "../components/air-quality/PollutantBreakdownCard";
import StationList from "../components/air-quality/StationList";

describe("branch matrix", () => {
  it("covers common and layout variants", async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(
      <MemoryRouter>
        <Badge tone="good" dot>Good</Badge>
        <Badge tone="unknown">Unknown</Badge>
        <EmptyState />
        <ErrorState title="" message="" />
        <PageHeader title="Branch" />
        <Progress value={0} label="Zero" />
        <Progress value={120} label="High" />
        <Stat label="No value" />
        <Toggle checked={false} onChange={change} label="A" description="" />
        <Toggle checked onChange={change} label="B" />
        <Segmented options={[]} value="" onChange={change} />
        <Segmented options={[{ value: "x", label: "X" }]} value="x" onChange={change} size="lg" ariaLabel="Scale" />
        <Logo />
        <Sidebar />
        <MobileTopbar />
        <BottomNav />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("switch", { name: "A" }));
    await user.click(screen.getByRole("switch", { name: "B" }));
    await user.click(screen.getByRole("button", { name: "X" }));
    expect(change).toHaveBeenCalled();
  });

  it("covers dashboard loading, cached, missing and data variants", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    const planState = {
      data: null,
      loading: false,
      error: null,
      reload: vi.fn(),
      setData: vi.fn(),
    };
    const { rerender } = render(
      <MemoryRouter>
        <AqiCard loading reading={null} onRefresh={retry} />
        <AqiCard error="down" reading={null} onRefresh={retry} />
        <AqiCard reading={{ aqi: null, scale: "us", stale: true, cache: { hit: true }, pollutants: {}, location: {} }} onRefresh={retry} />
        <AqiCard reading={{ aqi: 250, scale: "india", aqi_india_method: true, location: { name: "Delhi", admin1: "DL" }, pollutants: { pm10: 40 }, observed_at: "bad", source: "CPCB" }} onRefresh={retry} />
        <DailyPlanSummaryCard planState={planState} busyId={null} generating={false} onToggle={vi.fn()} onGenerate={vi.fn()} />
        <DashboardStats reading={null} actions={[]} impactState={{ data: null, loading: false, error: null }} />
        <NearbyGridCard reading={null} cached={false} />
        <NearbyGridCard reading={{ location: { name: "Delhi" } }} cached />
        <PollutionTrendCard reading={null} forecast={null} series={[]} missing />
        <WeatherStrip weather={null} />
        <VentilationWindowCard reading={null} />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Retry" }));
    rerender(
      <MemoryRouter>
        <DailyPlanSummaryCard planState={{ ...planState, loading: true }} busyId={null} generating={true} onToggle={vi.fn()} onGenerate={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Loading your plan")).toBeInTheDocument();
  });

  it("covers recommendation, progress and plan card variants", async () => {
    const toggle = vi.fn();
    render(
      <MemoryRouter>
        <RecommendationList
          items={[
            { id: "1", title: "One", detail: "", why: "", priority: "high", completed: false, window: "", co2_saved_kg: 0, safety: "" },
            { id: "2", title: null, detail: null, priority: "low", completed: true },
          ]}
          onToggle={toggle}
          busyId="1"
        />
        <PlanContextCard plan={{ context: { location: "Delhi", aqi: 72, scale: "india", pm2_5: 20, source: "CPCB", outdoor_window: { label: "safe", details: "Now", warning: "Avoid haze" } }, actions: [] }} />
        <PlanContextCard plan={{}} />
        <PlanSummaryCard
          plan={{ title: "Plan", summary: "Summary", date: "2026-11-23", generated_by: "Gemini" }}
          actions={[{ id: "a", title: "Action", completed: true, slot: "morning", co2_saved_kg: 1 }]}
          completed={1}
          saving={1}
        />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getAllByRole("button")[0]);
  });

  it("covers assistant and source citation variants", () => {
    render(
      <MemoryRouter>
        <LiveContextCard reading={{ aqi: 72, scale: "us", location: { name: "Delhi" }, pollutants: {}, weather: {} }} user={{}} />
        <LiveContextCard reading={null} user={null} />
        <SafetyCard />
        <AssistantDataNote />
        <SourceCitationList sources={null} />
        <SourceCitationList sources={["CAMS", { title: "AQI", url: "javascript:bad" }, { name: "Safe", url: "https://example.com" }, null]} />
        <ChatMessageList messages={[]} historyLoading historyError={null} onRetryHistory={vi.fn()} />
        <ChatMessageList messages={[{ id: "u", role: "user", content: "Hi" }, { id: "a", role: "assistant", content: "Hello", sources: ["CAMS"] }, { id: "e", role: "assistant", error: true, content: "Error" }]} historyLoading={false} historyError="History down" onRetryHistory={vi.fn()} />
        <SuggestedPrompts onSelect={vi.fn()} />
        <AssistantComposer draft="" onDraftChange={vi.fn()} onSend={vi.fn()} onSuggestion={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getAllByText(/Sources:/).length).toBeGreaterThan(0);
  });

  it("covers air-quality card variants", () => {
    render(
      <MemoryRouter>
        <DataProvenance reading={null} />
        <DataProvenance reading={{ source: "CPCB", observed_at: "2026-11-23T10:00:00Z", cache: { hit: true, age_seconds: 10 }, stale: true, provenance: { source_names: ["CPCB"], source_urls: ["https://example.com"], provider_label: "CPCB" } }} />
        <ForecastChart data={[]} metric="us_aqi" />
        <ForecastChart data={[{ time: "2026-11-23T10:00:00Z", us_aqi: 72, india_aqi: 65, pm2_5: 18 }]} metric="pm2_5" />
        <MapCard coords={{ latitude: 28.6, longitude: 77.2 }} reading={null} stations={[]} activeId={null} onSelect={vi.fn()} scale="us" />
        <MapCard
          coords={{ latitude: 28.6, longitude: 77.2 }}
          reading={{ location: { name: "Delhi" }, aqi: 72 }}
          stations={[{ id: "1", name: "One", latitude: 28.6, longitude: 77.2, aqi: 72 }]}
          activeId="1"
          onSelect={vi.fn()}
          scale="us"
        />
        <PollutantBreakdownCard pollutants={null} />
        <PollutantBreakdownCard pollutants={{ pm2_5: 18, pm10: 30, ozone: 20, nitrogen_dioxide: null, sulfur_dioxide: 2, carbon_monoxide: 100 }} />
        <StationList stations={[]} activeId={null} onSelect={vi.fn()} />
        <StationList stations={[{ id: "1", name: "One", aqi: 72, distance_km: 1.2, pm2_5: null }]} activeId="1" onSelect={vi.fn()} />
      </MemoryRouter>,
    );
  });
});
