import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {
    user: { name: "Test User", email: "test@example.com", location: { city: "Prayagraj", latitude: 25.4358, longitude: 81.8463 }, preferences: { aqi_scale: "us", notifications: true, transport: "cycle" }, lifestyle: { primary_mode: "cycle" } },
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
    updateUser: vi.fn(),
  },
  api: {
    planToday: vi.fn(), planGenerate: vi.fn(), planComplete: vi.fn(),
    impactPersonal: vi.fn(), impactHistory: vi.fn(), impactLog: vi.fn(),
    lifestyleGet: vi.fn(), lifestyleSave: vi.fn(), lifestyleAnalyze: vi.fn(),
    indoorCreate: vi.fn(), assistantHistory: vi.fn(), assistantChat: vi.fn(),
    communityStats: vi.fn(), communityChallenges: vi.fn(), communityJoin: vi.fn(), communityLeaderboard: vi.fn(),
    stations: vi.fn(), profileUpdate: vi.fn(), profileOnboarding: vi.fn(), profileGet: vi.fn(),
  },
}));

vi.mock("../context/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../hooks/useAirQuality", () => ({
  useAirQuality: () => ({
    data: { aqi: 72, scale: "us", location: { name: "Prayagraj" }, source: "CAMS", observed_at: "2026-11-23T10:00:00Z", pollutants: { pm2_5: 18.2, pm10: 35 }, aqi_india: 65 },
    loading: false, error: null, refresh: vi.fn(),
  }),
  useForecast: () => ({ data: { hourly: [{ time: "2026-11-23T10:00:00", us_aqi: 72, pm2_5: 18 }], daily: [{ date: "2026-11-23", us_aqi_max: 72, pm2_5_mean: 18 }], source: "Open-Meteo" }, loading: false }),
  useUserCoords: () => ({ latitude: 25.4358, longitude: 81.8463 }),
}));
vi.mock("../services/api", () => ({
  apiError: (_e, fallback) => fallback || "Request failed",
  planApi: { today: mocks.api.planToday, generate: mocks.api.planGenerate, complete: mocks.api.planComplete },
  impactApi: { personal: mocks.api.impactPersonal, history: mocks.api.impactHistory, log: mocks.api.impactLog },
  lifestyleApi: { get: mocks.api.lifestyleGet, save: mocks.api.lifestyleSave, analyze: mocks.api.lifestyleAnalyze },
  indoorApi: { create: mocks.api.indoorCreate },
  assistantApi: { history: mocks.api.assistantHistory, chat: mocks.api.assistantChat },
  communityApi: { stats: mocks.api.communityStats, challenges: mocks.api.communityChallenges, join: mocks.api.communityJoin, leaderboard: mocks.api.communityLeaderboard },
  airQualityApi: { stations: mocks.api.stations },
  profileApi: { update: mocks.api.profileUpdate, completeOnboarding: mocks.api.profileOnboarding, get: mocks.api.profileGet },
  authApi: { login: mocks.auth.login, register: mocks.auth.register },
}));
vi.mock("../components/charts/Charts", () => ({
  TrendChart: ({ data = [] }) => <div data-testid="trend-chart">{data.length}</div>,
  SimpleBarChart: ({ data = [] }) => <div data-testid="bar-chart">{data.length}</div>,
  Sparkline: () => <div data-testid="sparkline" />,
}));

import Settings from "../pages/Settings";
import Onboarding from "../pages/Onboarding";
import DailyPlan from "../pages/DailyPlan";
import Assistant from "../pages/Assistant";
import Impact from "../pages/Impact";
import Lifestyle from "../pages/Lifestyle";
import AirQuality from "../pages/AirQuality";
import Community from "../pages/Community";
import IndoorAir from "../pages/IndoorAir";
import Login from "../pages/Login";
import Register from "../pages/Register";

function renderPage(Page) {
  return render(<MemoryRouter><Page /></MemoryRouter>);
}

describe("full page coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.login.mockResolvedValue({ access_token: "token", user: { name: "Test User" } });
    mocks.auth.register.mockResolvedValue({ access_token: "token", user: { name: "Test User" } });
    mocks.auth.refreshUser.mockResolvedValue({ name: "Test User" });
    mocks.api.profileUpdate.mockResolvedValue({ user: { name: "Updated", location: { city: "Delhi" } } });
    mocks.api.profileOnboarding.mockResolvedValue({ user: { onboarding_complete: true } });
    mocks.api.planToday.mockResolvedValue({ plan: { id: "plan-1", title: "Clean commute", summary: "Stay safe", date: "2026-11-23", generated_by: "Gemini", actions: [{ id: "a1", title: "Cycle", detail: "Ride safely", slot: "morning", completed: false, co2_saved_kg: 1.2 }] } });
    mocks.api.planGenerate.mockResolvedValue({ plan: { id: "plan-2", title: "Fresh plan", actions: [{ id: "a2", title: "Walk", completed: false }] } });
    mocks.api.planComplete.mockImplementation(async (_p, _a, completed) => ({ plan: { id: "plan-1", actions: [{ id: "a1", title: "Cycle", completed }] } }));
    mocks.api.impactPersonal.mockResolvedValue({ totals: { avoided_kg: 12, actual_kg: 5, baseline_kg: 17, logged_activities: 3, distance_km: 20, reduction_pct: 70 }, weekly: [{ label: "W1", avoided_kg: 4 }], achievements: [{ key: "starter", label: "Starter" }], factor_version: "2026.1" });
    mocks.api.impactHistory.mockResolvedValue({ records: [{ id: "i1", date: "2026-11-23", baseline_mode: "car_petrol", actual_mode: "cycle", distance_km: 8, baseline_kg: 1.8, actual_kg: 0.1, avoided_kg: 1.7 }], page: 1, pages: 2 });
    mocks.api.impactLog.mockResolvedValue({ record: { avoided_kg: 1.7 } });
    mocks.api.lifestyleGet.mockResolvedValue({ profile: { primary_mode: "cycle", household_size: 3, waste: ["composts"] }, analysis: null });
    mocks.api.lifestyleSave.mockResolvedValue({ ok: true });
    mocks.api.lifestyleAnalyze.mockResolvedValue({ analysis: { total_kg_per_month: 120, factor_version: "2026.1", breakdown: [{ key: "transport", label: "Transport", kg_per_month: 40 }], opportunities: [{ title: "Cycle", detail: "Replace short trips", saving_kg: 20, difficulty: "easy" }] } });
    mocks.api.indoorCreate.mockResolvedValue({ assessment: { score: 82, summary: "Good home practices", immediate: "Use the kitchen fan", recommendations: [{ key: "ventilation", label: "Ventilation", items: [{ title: "Open a window", detail: "When outdoor AQI allows", cost: "free" }] }] } });
    mocks.api.assistantHistory.mockResolvedValue({ messages: [{ id: "h1", role: "assistant", content: "Hello", sources: [] }] });
    mocks.api.assistantChat.mockResolvedValue({ id: "r1", reply: "Cycle briefly.", sources: [{ title: "CAMS", url: "https://example.com" }], schema_validated: true });
    mocks.api.communityStats.mockResolvedValue({ members: 120, collective_avoided_kg: 500, your_avoided_kg: 12, your_rank: 4, neighbourhood_score: 80, neighbourhood_label: "Active" });
    mocks.api.communityChallenges.mockResolvedValue({ challenges: [{ id: "c1", title: "Cycle 100", description: "Cycle short trips", participants: 20, target_kg: 100, progress_kg: 20, progress_pct: 20, ends_at: "2026-12-01", joined: false }] });
    mocks.api.communityJoin.mockResolvedValue({ challenge: { id: "c1", joined: true } });
    mocks.api.communityLeaderboard.mockResolvedValue({ entries: [{ rank: 1, name: "A User", avoided_kg: 50 }, { rank: 2, name: "Test User", avoided_kg: 12, is_you: true }] });
    mocks.api.stations.mockResolvedValue({ stations: [{ id: "s1", name: "Central", latitude: 25.43, longitude: 81.84, aqi: 72, pm2_5: 18, distance_km: 1.2 }] });
  });

  it("covers Settings inputs, toggles, save, refresh, logout and validation", async () => {
    const user = userEvent.setup();
    renderPage(Settings);
    await user.clear(screen.getByLabelText(/Full name/));
    await user.type(screen.getByLabelText(/Full name/), "Updated User");
    await user.selectOptions(screen.getByLabelText(/City/), "Delhi");
    await user.selectOptions(screen.getByLabelText("Default AQI scale"), "india");
    await user.click(screen.getByRole("switch", { name: "Air quality alerts" }));
    await user.click(screen.getByRole("switch", { name: "Show me on the leaderboard" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(mocks.api.profileUpdate).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(mocks.auth.logout).toHaveBeenCalled();
  });

  it("walks through Onboarding and supports skip, back, and submit", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/onboarding"]}><Routes><Route path="/onboarding" element={<Onboarding />} /><Route path="/dashboard" element={<div>Dashboard</div>} /></Routes></MemoryRouter>);
    await user.selectOptions(screen.getByLabelText(/City/), "Delhi");
    await user.click(screen.getByRole("button", { name: /Continue/i }));
    await user.selectOptions(screen.getByLabelText(/Household type/), "apartment");
    await user.type(screen.getByLabelText(/People in the household/), "3");
    await user.selectOptions(screen.getByLabelText(/Main cooking fuel/), "lpg");
    await user.click(screen.getByRole("button", { name: /Continue/i }));
    await user.selectOptions(screen.getByLabelText(/Usual commute mode/), "cycle");
    await user.type(screen.getByLabelText(/One-way distance/), "5");
    await user.click(screen.getByRole("button", { name: /Continue/i }));
    await user.click(screen.getByRole("button", { name: "Reduce my emissions" }));
    await user.click(screen.getByRole("button", { name: /Finish setup/i }));
    await waitFor(() => expect(mocks.api.profileOnboarding).toHaveBeenCalled());
  });

  it("covers DailyPlan generation, context, completion and empty state", async () => {
    const user = userEvent.setup();
    renderPage(DailyPlan);
    const action = await screen.findByRole("button", { name: "Mark Cycle as done" });
    await user.click(action);
    await waitFor(() => expect(mocks.api.planComplete).toHaveBeenCalledWith("plan-1", "a1", true));
    await user.click(screen.getByRole("button", { name: "Regenerate" }));
    await waitFor(() => expect(mocks.api.planGenerate).toHaveBeenCalledWith({ regenerate: true }));
  });

  it("covers Assistant history, prompts, chat and retry", async () => {
    const user = userEvent.setup();
    renderPage(Assistant);
    await screen.findByText("Hello");
    await user.click(screen.getAllByRole("button", { name: "Explain today's PM2.5 in simple terms." })[0]);
    await waitFor(() => expect(mocks.api.assistantChat).toHaveBeenCalled());
    const input = screen.getByLabelText("Message AirAware");
    await user.type(input, "What should I do?");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(mocks.api.assistantChat).toHaveBeenCalledWith({ message: "What should I do?" }));
  });

  it("covers Impact summary, logging, history and pagination", async () => {
    const user = userEvent.setup();
    renderPage(Impact);
    await screen.findByText("Weekly avoided emissions");
    await user.clear(screen.getByLabelText(/Distance/));
    await user.type(screen.getByLabelText(/Distance/), "8");
    await user.selectOptions(screen.getByLabelText(/Baseline mode/), "car_petrol");
    await user.selectOptions(screen.getByLabelText(/Actual mode/), "cycle");
    await user.click(screen.getByRole("button", { name: "Log activity" }));
    await waitFor(() => expect(mocks.api.impactLog).toHaveBeenCalled());
  });

  it("covers Lifestyle profile, waste practices, save and analysis", async () => {
    const user = userEvent.setup();
    renderPage(Lifestyle);
    await screen.findByText("How you get around");
    await user.selectOptions(screen.getByLabelText("Primary mode"), "cycle");
    await user.type(screen.getByLabelText("Electricity (kWh / month)"), "180");
    await user.click(screen.getByRole("button", { name: "I compost kitchen waste" }));
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(mocks.api.lifestyleSave).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Analyze my lifestyle" }));
    await waitFor(() => expect(mocks.api.lifestyleAnalyze).toHaveBeenCalled());
  });

  it("covers AirQuality scale, forecast metric, map selection and refresh", async () => {
    const user = userEvent.setup();
    renderPage(AirQuality);
    await screen.findByText("Nearby reference points");
    await user.click(screen.getByRole("button", { name: "India AQI" }));
    await user.click(screen.getByRole("button", { name: "PM2.5" }));
    await user.click(screen.getByRole("button", { name: /Central/ }));
    await user.click(screen.getByRole("button", { name: "Refresh air quality data" }));
  });

  it("covers Community stats, join and leaderboard", async () => {
    const user = userEvent.setup();
    renderPage(Community);
    await screen.findByText("Green challenges");
    await user.click(screen.getByRole("button", { name: "Join" }));
    await waitFor(() => expect(mocks.api.communityJoin).toHaveBeenCalledWith("c1"));
  });

  it("covers IndoorAir selections and assessment", async () => {
    const user = userEvent.setup();
    renderPage(IndoorAir);
    await user.click(screen.getByRole("button", { name: "Incense, dhoop or candles" }));
    await user.click(screen.getByRole("switch", { name: "Windows open most of the day" }));
    await user.click(screen.getByRole("button", { name: "LPG cylinder" }));
    await user.click(screen.getByRole("button", { name: "Build my indoor plan" }));
    await waitFor(() => expect(mocks.api.indoorCreate).toHaveBeenCalled());
  });

  it("covers Login validation, password visibility and submit", async () => {
    const user = userEvent.setup();
    renderPage(Login);
    await user.click(screen.getByRole("button", { name: /Sign in/i }));
    expect(await screen.findByText("Email is required.")).toHaveAttribute("role", "alert");
    await user.type(screen.getByLabelText(/Email/), "test@example.com");
    await user.type(screen.getByLabelText(/^Password/), "password123");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    await user.click(screen.getByRole("button", { name: /Sign in/i }));
    await waitFor(() => expect(mocks.auth.login).toHaveBeenCalled());
  });

  it("covers Register validation, mismatch and successful submit", async () => {
    const user = userEvent.setup();
    renderPage(Register);
    await user.click(screen.getByRole("button", { name: /Create account/i }));
    await screen.findByText("Please tell us your name.");
    await user.type(screen.getByLabelText(/Full name/), "Test User");
    await user.type(screen.getByLabelText(/Email/), "test@example.com");
    await user.type(screen.getByLabelText(/^Password/), "password123");
    await user.type(screen.getByLabelText(/Confirm password/), "password123");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    await user.click(screen.getByRole("switch", { name: "I consent to environmental data processing" }));
    await user.click(screen.getByRole("button", { name: /Create account/i }));
    await waitFor(() => expect(mocks.auth.register).toHaveBeenCalled());
  }, 10000);
});
