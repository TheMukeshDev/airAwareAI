import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {
    user: null,
    isAuthenticated: true,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
    updateUser: vi.fn(),
  },
  navigate: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
  api: {
    profile: { get: vi.fn(), update: vi.fn(), completeOnboarding: vi.fn() },
    plan: { today: vi.fn(), generate: vi.fn(), complete: vi.fn() },
    indoor: { create: vi.fn() },
    impact: { personal: vi.fn(), history: vi.fn(), log: vi.fn() },
    assistant: { history: vi.fn(), chat: vi.fn() },
    lifestyle: { get: vi.fn(), save: vi.fn(), analyze: vi.fn() },
    airQuality: { current: vi.fn(), forecast: vi.fn(), stations: vi.fn() },
    community: { stats: vi.fn(), challenges: vi.fn(), leaderboard: vi.fn(), join: vi.fn() },
    auth: { login: vi.fn(), register: vi.fn() },
  },
  air: { data: null, loading: false, error: null, refresh: vi.fn() },
  forecast: { data: null, loading: false, error: null, refresh: vi.fn() },
  coords: { latitude: 25.4358, longitude: 81.8463 },
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mocks.navigate };
});

vi.mock("react-hot-toast", () => ({ default: mocks.toast }));

vi.mock("../context/AuthContext", () => ({ useAuth: () => mocks.auth }));

vi.mock("../services/api", () => ({
  profileApi: mocks.api.profile,
  planApi: mocks.api.plan,
  indoorApi: mocks.api.indoor,
  impactApi: mocks.api.impact,
  assistantApi: mocks.api.assistant,
  lifestyleApi: mocks.api.lifestyle,
  airQualityApi: mocks.api.airQuality,
  communityApi: mocks.api.community,
  authApi: mocks.api.auth,
  apiError: (error, fallback) =>
    error?.response?.data?.error ?? error?.response?.data?.message ?? error?.message ?? fallback ?? "Request failed",
  TOKEN_KEY: "airaware.token",
  USER_KEY: "airaware.user",
}));

vi.mock("../hooks/useAirQuality", () => ({
  useAirQuality: () => mocks.air,
  useForecast: () => mocks.forecast,
  useUserCoords: () => mocks.coords,
}));

vi.mock("../components/charts/Charts", () => ({
  TrendChart: () => <div>Chart</div>,
  SimpleBarChart: () => <div>Chart</div>,
  Sparkline: () => <div>Chart</div>,
}));

vi.mock("../components/indoor/OutdoorContextCard", () => ({
  OutdoorContextCard: () => <div>Outdoor context</div>,
  default: () => <div>Outdoor context</div>,
}));

import { StationMap } from "../components/map/StationMap";
import AirQuality from "../pages/AirQuality";
import Assistant from "../pages/Assistant";
import DailyPlan from "../pages/DailyPlan";
import Impact from "../pages/Impact";
import IndoorAir from "../pages/IndoorAir";
import Lifestyle from "../pages/Lifestyle";
import Onboarding from "../pages/Onboarding";
import Settings from "../pages/Settings";

function makeUser() {
  return {
    name: "Asha Test",
    email: "asha@example.com",
    location: {
      city: "Prayagraj",
      state: "Uttar Pradesh",
      country: "India",
      latitude: 25.4358,
      longitude: 81.8463,
    },
    preferences: {
      aqi_scale: "us",
      notifications: true,
      daily_digest: true,
      leaderboard_opt_in: false,
      share_aggregate: true,
    },
    lifestyle: { primary_mode: "bus", household_type: "apartment" },
    onboarding_complete: true,
  };
}

function makePlan() {
  return {
    id: "plan-1",
    title: "Today's focus",
    summary: "A short personalised plan.",
    date: "2026-11-23",
    generated_by: "Gemini",
    context: {
      location: "Prayagraj",
      aqi: 72,
      scale: "us",
      pm2_5: 18,
      outdoor_window: { label: "07:00-09:00" },
      source: "CAMS",
    },
    actions: [
      { id: "a1", title: "Walk to work", slot: "morning", completed: false, co2_saved_kg: 0.5, priority: "high" },
      { id: "a2", title: "Cook on the chimney", slot: "evening", completed: false, co2_saved_kg: 0.2 },
    ],
  };
}

function makeAssessment() {
  return {
    score: 78,
    summary: "Mostly manageable with better ventilation.",
    immediate: "Open two windows briefly after cooking.",
    recommendations: [
      {
        key: "ventilation",
        label: "Ventilation",
        items: [{ title: "Cross-ventilate", detail: "Open opposite windows for ten minutes.", cost: "Free" }],
      },
      {
        key: "cooking",
        label: "Cooking",
        items: [{ title: "Use the chimney", detail: "Run it while frying." }],
      },
    ],
  };
}

function makeLifestyleProfile() {
  return {
    primary_mode: "cycle",
    commute_distance_km: "5",
    commute_days_per_week: "4",
    weekly_other_km: "",
    flights_per_year: "",
    electricity_kwh_month: "120",
    cooking_fuel: "lpg",
    lpg_cylinders_month: "1",
    household_size: "3",
    diet: "vegetarian",
    waste: ["composts"],
  };
}

function makeAnalysis() {
  return {
    total_kg_per_month: 42,
    factor_version: "2026.1",
    breakdown: [
      { key: "transport", label: "Transport", kg_per_month: 20 },
      { key: "home", label: "Home", kg_per_month: 14 },
      { key: "food", label: "Food", kg_per_month: 8 },
    ],
    opportunities: [{ title: "Cycle more", detail: "Replace two car trips a week.", saving_kg: 5, difficulty: "Easy" }],
    assumptions: ["Factors come from the documented factor set."],
  };
}

function makeStations() {
  return [
    {
      id: "s1",
      name: "Riverfront Grid",
      aqi: 45,
      scale: "us",
      pm2_5: 12,
      distance_km: 1.2,
      latitude: 25.44,
      longitude: 81.85,
    },
    {
      id: "s2",
      name: "Civil Lines Grid",
      aqi: 88,
      scale: "us",
      pm2_5: 25,
      distance_km: 2.6,
      latitude: 25.46,
      longitude: 81.83,
    },
  ];
}

async function renderPage(Component, props) {
  let result;
  await act(async () => {
    result = render(
      <MemoryRouter>
        <Component {...props} />
      </MemoryRouter>,
    );
  });
  return result;
}

async function onboardToGoals(user) {
  await user.selectOptions(screen.getByRole("combobox", { name: /City/ }), "Delhi");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(await screen.findByRole("heading", { name: "Your household" })).toBeInTheDocument();
  await user.selectOptions(screen.getByRole("combobox", { name: /Household type/ }), "apartment");
  await user.type(screen.getByLabelText(/People in the household/), "3");
  await user.selectOptions(screen.getByRole("combobox", { name: /Main cooking fuel/ }), "lpg");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(await screen.findByRole("heading", { name: "How you move" })).toBeInTheDocument();
  await user.selectOptions(screen.getByRole("combobox", { name: /Usual commute mode/ }), "cycle");
  await user.type(screen.getByLabelText(/One-way distance/), "5");
  await user.type(screen.getByLabelText(/Commute days per week/), "4");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  expect(await screen.findByRole("heading", { name: "What matters most?" })).toBeInTheDocument();
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.user = makeUser();
  mocks.auth.isAuthenticated = true;
  mocks.air.data = {
    aqi: 72,
    scale: "us",
    location: { name: "Prayagraj" },
    pollutants: { pm2_5: 18 },
    indoor_hint: "Ventilate briefly in the evening.",
    observed_at: "2026-11-23T08:00:00Z",
  };
  mocks.air.loading = false;
  mocks.air.error = null;
  mocks.forecast.data = { hourly: [], daily: [] };
  mocks.forecast.loading = false;
  mocks.forecast.error = null;

  mocks.api.profile.get.mockResolvedValue({ user: makeUser() });
  mocks.api.profile.update.mockResolvedValue({ user: makeUser() });
  mocks.api.profile.completeOnboarding.mockResolvedValue({ user: makeUser() });
  mocks.api.plan.today.mockResolvedValue({ plan: makePlan() });
  mocks.api.plan.generate.mockResolvedValue({ plan: makePlan() });
  mocks.api.plan.complete.mockImplementation((_planId, actionId, done) =>
    Promise.resolve({
      plan: {
        ...makePlan(),
        actions: makePlan().actions.map((action) =>
          action.id === actionId ? { ...action, completed: done } : action,
        ),
      },
    }),
  );
  mocks.api.indoor.create.mockResolvedValue({ assessment: makeAssessment() });
  mocks.api.impact.personal.mockResolvedValue({
    totals: {
      avoided_kg: 12.34,
      actual_kg: 8,
      baseline_kg: 20.3,
      logged_activities: 3,
      distance_km: 30,
      reduction_pct: 39,
    },
    weekly: [{ label: "W1", avoided_kg: 2 }],
    achievements: [{ key: "first", label: "First trip" }],
    factor_version: "2026.1",
  });
  mocks.api.impact.history.mockResolvedValue({
    records: [
      {
        id: "h1",
        date: "2026-11-20",
        baseline_mode: "car_petrol",
        actual_mode: "cycle",
        distance_km: 12,
        baseline_kg: 3,
        actual_kg: 0,
        avoided_kg: 3,
      },
    ],
    page: 1,
    pages: 1,
  });
  mocks.api.impact.log.mockResolvedValue({ record: { avoided_kg: 1.5 } });
  mocks.api.assistant.history.mockResolvedValue({ messages: [] });
  mocks.api.assistant.chat.mockResolvedValue({
    id: "reply-1",
    reply: "Here is a grounded answer.",
    sources: [{ title: "Open-Meteo", url: "https://example.com/docs" }],
    schema_validated: true,
  });
  mocks.api.lifestyle.get.mockResolvedValue({ profile: makeLifestyleProfile() });
  mocks.api.lifestyle.save.mockResolvedValue({});
  mocks.api.lifestyle.analyze.mockResolvedValue({ analysis: makeAnalysis() });
  mocks.api.airQuality.stations.mockResolvedValue({ stations: makeStations() });
});

describe("Settings interactions", () => {
  it("saves edited profile fields and preference toggles", async () => {
    const user = userEvent.setup();
    await renderPage(Settings);

    expect(screen.getByRole("heading", { name: "Profile and settings" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /Full name/ })).toHaveValue("Asha Test");
    expect(screen.getByRole("combobox", { name: /City/ })).toHaveValue("Prayagraj");
    expect(screen.getByRole("switch", { name: "Air quality alerts" })).toHaveAttribute("aria-checked", "true");

    await user.clear(screen.getByRole("textbox", { name: /Full name/ }));
    await user.type(screen.getByRole("textbox", { name: /Full name/ }), "Asha Updated");
    await user.selectOptions(screen.getByRole("combobox", { name: /City/ }), "Delhi");
    await user.selectOptions(screen.getByRole("combobox", { name: "Default AQI scale" }), "india");
    await user.selectOptions(screen.getByRole("combobox", { name: /Usual transport/ }), "cycle");
    await user.selectOptions(screen.getByRole("combobox", { name: /Primary goal/ }), "reduce_exposure");
    await user.click(screen.getByRole("switch", { name: "Air quality alerts" }));
    await user.click(screen.getByRole("switch", { name: "Show me on the leaderboard" }));
    await user.click(screen.getByRole("switch", { name: "Contribute to community totals" }));

    expect(screen.getByRole("switch", { name: "Air quality alerts" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("switch", { name: "Show me on the leaderboard" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Contribute to community totals" })).toHaveAttribute(
      "aria-checked",
      "false",
    );

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(mocks.api.profile.update).toHaveBeenCalledWith({
        name: "Asha Updated",
        location: {
          city: "Delhi",
          state: "Delhi",
          country: "India",
          latitude: 28.6139,
          longitude: 77.209,
        },
        preferences: {
          notifications: false,
          daily_digest: true,
          leaderboard_opt_in: true,
          share_aggregate: false,
          transport: "cycle",
          goal: "reduce_exposure",
          aqi_scale: "india",
        },
      }),
    );
    expect(mocks.auth.updateUser).toHaveBeenCalled();
    expect(mocks.auth.refreshUser).toHaveBeenCalled();
    expect(mocks.toast.success).toHaveBeenCalledWith("Settings saved.");
  });

  it("validates required settings fields without calling the API", async () => {
    const user = userEvent.setup();
    await renderPage(Settings);

    await user.clear(screen.getByRole("textbox", { name: /Full name/ }));
    fireEvent.submit(screen.getByRole("button", { name: "Save changes" }).closest("form"));
    expect(mocks.toast.error).toHaveBeenCalledWith("Name cannot be empty.");

    await user.type(screen.getByRole("textbox", { name: /Full name/ }), "Asha Test");
    await user.selectOptions(screen.getByRole("combobox", { name: /City/ }), "");
    fireEvent.submit(screen.getByRole("button", { name: "Save changes" }).closest("form"));
    expect(mocks.toast.error).toHaveBeenCalledWith("Select a city.");
    expect(mocks.api.profile.update).not.toHaveBeenCalled();
  });

  it("reports a save failure and retries a failed profile refresh", async () => {
    const user = userEvent.setup();
    mocks.api.profile.update.mockRejectedValueOnce(new Error("save failed"));
    await renderPage(Settings);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("save failed");
    expect(mocks.toast.error).toHaveBeenCalledWith("save failed");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(mocks.toast.success).toHaveBeenCalledWith("Profile refreshed.");

    cleanup();
    mocks.auth.refreshUser.mockRejectedValueOnce(new Error("stale"));
    await renderPage(Settings);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("stale");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(mocks.toast.success).toHaveBeenCalledWith("Profile refreshed.");
  });

  it("signs out and navigates to the login page", async () => {
    const user = userEvent.setup();
    await renderPage(Settings);
    await user.click(screen.getByRole("button", { name: /Sign out/ }));
    expect(mocks.auth.logout).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith("/login", { replace: true });
  });
});

describe("Onboarding interactions", () => {
  it("completes all four setup steps and submits the profile", async () => {
    const user = userEvent.setup();
    mocks.auth.user = { ...makeUser(), location: undefined };
    await renderPage(Onboarding);

    expect(screen.getByRole("heading", { name: "Where do you breathe?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    await onboardToGoals(user);

    expect(screen.getByRole("alert")).toHaveTextContent("Select at least one goal to personalise your plan.");
    await user.click(screen.getByRole("button", { name: "Reduce my emissions" }));
    expect(screen.getByRole("button", { name: "Reduce my emissions" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Finish setup" }));

    await waitFor(() =>
      expect(mocks.api.profile.completeOnboarding).toHaveBeenCalledWith({
        onboarding_complete: true,
        onboarding_skipped: false,
        location: {
          city: "Delhi",
          state: "Delhi",
          country: "India",
          latitude: 28.6139,
          longitude: 77.209,
        },
        lifestyle: {
          household_type: "apartment",
          household_size: 3,
          cooking_fuel: "lpg",
          primary_mode: "cycle",
          commute_distance_km: 5,
          commute_days_per_week: 4,
        },
        goals: ["reduce_emissions"],
      }),
    );
    expect(mocks.auth.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ onboarding_complete: true, onboarding_skipped: false }),
    );
    expect(mocks.toast.success).toHaveBeenCalledWith("You're set up.");
    expect(mocks.navigate).toHaveBeenCalledWith("/dashboard", { replace: true });
  });

  it("navigates back between steps and skips setup from the first step", async () => {
    const user = userEvent.setup();
    await renderPage(Onboarding);
    await user.selectOptions(screen.getByRole("combobox", { name: /City/ }), "Mumbai");
    expect(screen.getByText(/Coordinates used: 19.076, 72.8777/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("heading", { name: "Your household" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { name: "Where do you breathe?" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(mocks.api.profile.completeOnboarding).toHaveBeenCalledTimes(1));
    expect(mocks.api.profile.completeOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({ onboarding_complete: false, onboarding_skipped: true, goals: [] }),
    );
    expect(mocks.toast.success).toHaveBeenCalledWith("You can complete setup anytime from Settings.");
    expect(mocks.navigate).toHaveBeenCalledWith("/dashboard", { replace: true });
  });

  it("reports a failed onboarding save and stays on the current step", async () => {
    const user = userEvent.setup();
    mocks.api.profile.completeOnboarding.mockRejectedValueOnce(new Error("save failed"));
    await renderPage(Onboarding);
    await user.click(screen.getByRole("button", { name: "Skip for now" }));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("save failed"));
    expect(screen.getByRole("heading", { name: "Where do you breathe?" })).toBeInTheDocument();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("retries a failed session refresh after setup was saved", async () => {
    const user = userEvent.setup();
    mocks.auth.refreshUser.mockRejectedValueOnce(new Error("stale"));
    await renderPage(Onboarding);
    await onboardToGoals(user);
    await user.click(screen.getByRole("button", { name: "Reduce pollution exposure" }));
    await user.click(screen.getByRole("button", { name: "Finish setup" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("stale");
    await user.click(screen.getByRole("button", { name: "Refresh profile" }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/dashboard", { replace: true }));
    expect(mocks.toast.error).toHaveBeenCalledWith("stale");
  });
});

describe("DailyPlan interactions", () => {
  it("loads a plan, toggles actions and regenerates with fresh readings", async () => {
    const user = userEvent.setup();
    await renderPage(DailyPlan);

    expect(await screen.findByText("0/2 done")).toBeInTheDocument();
    expect(screen.getByText("Today's focus")).toBeInTheDocument();
    expect(screen.getByText("Gemini")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mark Walk to work as done" }));
    await waitFor(() => expect(mocks.api.plan.complete).toHaveBeenCalledWith("plan-1", "a1", true));
    expect(await screen.findByText("1/2 done")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark Walk to work as not done" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Mark Walk to work as not done" }));
    await waitFor(() => expect(mocks.api.plan.complete).toHaveBeenLastCalledWith("plan-1", "a1", false));

    await user.click(screen.getByRole("button", { name: "Regenerate" }));
    await waitFor(() => expect(mocks.api.plan.generate).toHaveBeenCalledWith({ regenerate: true }));
    expect(mocks.toast.success).toHaveBeenCalledWith("Plan regenerated with fresh readings.");
  });

  it("generates a plan from the empty state", async () => {
    const user = userEvent.setup();
    mocks.api.plan.today.mockResolvedValue({ plan: false });
    await renderPage(DailyPlan);

    expect(await screen.findByText("No plan for today yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Generate today's plan" }));
    await waitFor(() => expect(mocks.api.plan.generate).toHaveBeenCalledWith({ regenerate: false }));
    expect(await screen.findByText("Today's focus")).toBeInTheDocument();
    expect(mocks.toast.success).toHaveBeenCalledWith("Today's plan is ready.");
  });

  it("reports a failed action update", async () => {
    const user = userEvent.setup();
    mocks.api.plan.complete.mockRejectedValueOnce(new Error("offline"));
    await renderPage(DailyPlan);
    await user.click(await screen.findByRole("button", { name: "Mark Walk to work as done" }));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("offline"));
    expect(screen.getByRole("button", { name: "Mark Walk to work as done" })).toBeEnabled();
  });

  it("reports a failed plan generation", async () => {
    const user = userEvent.setup();
    mocks.api.plan.today.mockResolvedValue({ plan: false });
    mocks.api.plan.generate.mockRejectedValueOnce(new Error("no plan"));
    await renderPage(DailyPlan);
    await user.click(await screen.findByRole("button", { name: "Generate today's plan" }));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("no plan"));
    expect(screen.getByText("No plan for today yet")).toBeInTheDocument();
  });

  it("shows plan context, safe window and alerts", async () => {
    await renderPage(DailyPlan);
    expect(await screen.findByText("Plan context")).toBeInTheDocument();
    expect(screen.getByText("72 (US)")).toBeInTheDocument();
    expect(screen.getByText("07:00-09:00")).toBeInTheDocument();
  });

  it("surfaces a context alert when the plan includes one", async () => {
    const plan = makePlan();
    plan.context.alert = "Dense smoke expected in the evening.";
    mocks.api.plan.today.mockResolvedValue({ plan });
    await renderPage(DailyPlan);
    expect(await screen.findByRole("alert")).toHaveTextContent("Dense smoke expected in the evening.");
  });
});

describe("IndoorAir interactions", () => {
  it("builds an indoor plan from selected sources, ventilation and cooking fuel", async () => {
    const user = userEvent.setup();
    await renderPage(IndoorAir);

    expect(screen.getByText("Outdoor Moderate")).toBeInTheDocument();
    const source = screen.getByRole("button", { name: "Incense, dhoop or candles" });
    await user.click(source);
    expect(source).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("switch", { name: "Windows open most of the day" }));
    expect(screen.getByRole("switch", { name: "Windows open most of the day" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("button", { name: "LPG cylinder" }));
    expect(screen.getByRole("button", { name: "LPG cylinder" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Build my indoor plan" }));
    await waitFor(() =>
      expect(mocks.api.indoor.create).toHaveBeenCalledWith({
        sources: ["incense"],
        ventilation: ["windows_often"],
        cooking_fuel: "lpg",
      }),
    );
    expect(await screen.findByRole("heading", { name: "Indoor air score" })).toBeInTheDocument();
    expect(screen.getByText("78/100")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Open two windows briefly after cooking.");
    expect(screen.getByRole("heading", { name: "Ventilation" })).toBeInTheDocument();
    expect(screen.getByText("Cross-ventilate")).toBeInTheDocument();
    expect(screen.getByText("Use the chimney")).toBeInTheDocument();
    expect(mocks.toast.success).toHaveBeenCalledWith("Indoor assessment ready.");
  });

  it("requires an input and reports assessment failures", async () => {
    const user = userEvent.setup();
    await renderPage(IndoorAir);

    await user.click(screen.getByRole("button", { name: "Build my indoor plan" }));
    expect(mocks.toast.error).toHaveBeenCalledWith("Select at least one source, ventilation option, or cooking fuel.");
    expect(mocks.api.indoor.create).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Damp walls or visible mould" }));
    mocks.api.indoor.create.mockRejectedValueOnce(new Error("engine down"));
    await user.click(screen.getByRole("button", { name: "Build my indoor plan" }));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("engine down"));
    expect(screen.getByText("No assessment yet")).toBeInTheDocument();
  });
});

describe("Impact interactions", () => {
  it("logs a journey and refreshes the summary and history", async () => {
    const user = userEvent.setup();
    await renderPage(Impact);

    expect(await screen.findByText("12.3")).toBeInTheDocument();
    expect(screen.getByText("First trip")).toBeInTheDocument();
    expect(await screen.findByText("12 km", {}, { timeout: 3000 })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Distance \(km\)/), "12");
    await user.selectOptions(screen.getByLabelText(/Baseline mode/), "car_petrol");
    await user.selectOptions(screen.getByLabelText(/Actual mode/), "cycle");
    await user.clear(screen.getByLabelText(/Passengers/));
    await user.type(screen.getByLabelText(/Passengers/), "2");
    await user.type(screen.getByLabelText(/Note/), "Office commute");
    await user.click(screen.getByRole("button", { name: "Log activity" }));

    await waitFor(() =>
      expect(mocks.api.impact.log).toHaveBeenCalledWith({
        date: new Date().toISOString().slice(0, 10),
        distance_km: 12,
        baseline_mode: "car_petrol",
        actual_mode: "cycle",
        passengers: 2,
        note: "Office commute",
      }),
    );
    expect(mocks.toast.success).toHaveBeenCalledWith(expect.stringContaining("kg CO₂e avoided."));
    await waitFor(() => expect(mocks.api.impact.personal).toHaveBeenCalledTimes(2));
    expect(mocks.api.impact.history).toHaveBeenCalledTimes(2);
  });

  it("paginates the activity history", async () => {
    const user = userEvent.setup();
    mocks.api.impact.history.mockImplementation(({ page }) =>
      Promise.resolve({
        records: [{ id: `h${page}`, date: "2026-11-20", baseline_mode: "bus", actual_mode: "walk", distance_km: 4 }],
        page,
        pages: 2,
      }),
    );
    await renderPage(Impact);

    expect(await screen.findByRole("button", { name: "Previous" }, { timeout: 3000 })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(mocks.api.impact.history).toHaveBeenCalledWith({ page: 2, per_page: 8 }));
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Previous" }));
    await waitFor(() => expect(mocks.api.impact.history).toHaveBeenLastCalledWith({ page: 1, per_page: 8 }));
  });

  it("validates the journey form and reports a failed log", async () => {
    const user = userEvent.setup();
    await renderPage(Impact);

    fireEvent.submit(screen.getByRole("button", { name: "Log activity" }).closest("form"));
    expect(mocks.toast.error).toHaveBeenCalledWith("Enter a distance greater than zero.");
    await user.type(screen.getByLabelText(/Distance \(km\)/), "5");
    await user.selectOptions(screen.getByLabelText(/Baseline mode/), "");
    fireEvent.submit(screen.getByRole("button", { name: "Log activity" }).closest("form"));
    expect(mocks.toast.error).toHaveBeenCalledWith("Select both baseline and actual mode.");
    await user.selectOptions(screen.getByLabelText(/Baseline mode/), "bus");
    await user.selectOptions(screen.getByLabelText(/Actual mode/), "walk");
    mocks.api.impact.log.mockRejectedValueOnce(new Error("log failed"));
    fireEvent.submit(screen.getByRole("button", { name: "Log activity" }).closest("form"));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("log failed"));
    expect(screen.getByLabelText(/Distance \(km\)/)).toHaveValue(5);
  });

  it("retries a failed personal summary", async () => {
    const user = userEvent.setup();
    mocks.api.impact.personal.mockRejectedValueOnce(new Error("summary failed"));
    await renderPage(Impact);

    expect(await screen.findByText("summary failed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByText("First trip")).toBeInTheDocument();
  });
});

describe("Assistant interactions", () => {
  it("sends a typed message and displays a schema-validated reply with sources", async () => {
    const user = userEvent.setup();
    mocks.api.assistant.history.mockResolvedValue({
      messages: [
        { id: "m1", role: "user", content: "Earlier question" },
        {
          id: "m2",
          role: "assistant",
          content: "Earlier answer",
          sources: [{ title: "Docs", url: "https://example.com/docs" }],
          schema_validated: true,
        },
      ],
    });
    await renderPage(Assistant);

    expect(await screen.findByText("Earlier answer")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute("href", "https://example.com/docs");

    const input = screen.getByRole("textbox", { name: "Message AirAware" });
    await user.type(input, "Is my commute safe today?{Enter}");
    await waitFor(() => expect(mocks.api.assistant.chat).toHaveBeenCalledWith({ message: "Is my commute safe today?" }));
    expect(await screen.findByText("Is my commute safe today?")).toBeInTheDocument();
    expect(screen.getByText("Here is a grounded answer.")).toBeInTheDocument();
    expect(screen.getByText("Gemini · schema validated")).toBeInTheDocument();
  });

  it("sends a suggested prompt and retries a failed reply", async () => {
    const user = userEvent.setup();
    mocks.api.assistant.chat.mockRejectedValueOnce(new Error("assistant down"));
    await renderPage(Assistant);

    expect(await screen.findByText("Ask about your air")).toBeInTheDocument();
    const prompts = screen.getAllByRole("button", { name: "Is it safe to run outside this evening?" });
    await user.click(prompts[0]);
    await waitFor(() =>
      expect(mocks.api.assistant.chat).toHaveBeenCalledWith({ message: "Is it safe to run outside this evening?" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("assistant down");
    expect(screen.getByText(/I could not reach the AirAware reasoning service/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(mocks.api.assistant.chat).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Here is a grounded answer.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("retries a failed chat history load", async () => {
    const user = userEvent.setup();
    mocks.api.assistant.history.mockRejectedValueOnce(new Error("history failed"));
    await renderPage(Assistant);

    expect(await screen.findByText("history failed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry history" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByText("Ask about your air")).toBeInTheDocument();
  });
});

describe("Lifestyle interactions", () => {
  it("loads a profile, analyzes it and saves the same details", async () => {
    const user = userEvent.setup();
    await renderPage(Lifestyle);

    expect(await screen.findByRole("heading", { name: "How you get around" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Primary mode" })).toHaveValue("cycle");
    expect(screen.getByRole("button", { name: "I compost kitchen waste" })).toHaveAttribute("aria-pressed", "true");

    await user.clear(screen.getByLabelText(/Electricity/));
    await user.type(screen.getByLabelText(/Electricity/), "200");
    await user.click(screen.getByRole("button", { name: "I segregate dry and wet waste" }));
    expect(screen.getByRole("button", { name: "I segregate dry and wet waste" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const expected = {
      transport: {
        primary_mode: "cycle",
        commute_distance_km: 5,
        commute_days_per_week: 4,
        weekly_other_km: null,
        flights_per_year: null,
      },
      home: {
        electricity_kwh_month: 200,
        cooking_fuel: "lpg",
        lpg_cylinders_month: 1,
        household_size: 3,
      },
      food: { diet: "vegetarian" },
      waste: ["composts", "segregates_waste"],
    };
    await user.click(screen.getByRole("button", { name: "Analyze my lifestyle" }));
    await waitFor(() => expect(mocks.api.lifestyle.analyze).toHaveBeenCalledWith(expected));
    expect(await screen.findByRole("heading", { name: "Monthly footprint" })).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Cycle more")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(mocks.api.lifestyle.save).toHaveBeenCalledWith(expected));
    expect(mocks.toast.success).toHaveBeenCalledWith("Lifestyle profile saved.");
  });

  it("validates an empty profile and reports analyze/save failures", async () => {
    const user = userEvent.setup();
    mocks.api.lifestyle.get.mockResolvedValue({});
    await renderPage(Lifestyle);

    expect(await screen.findByRole("heading", { name: "No analysis yet" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Analyze now" }));
    expect(mocks.toast.error).toHaveBeenCalledWith("Enter at least some lifestyle details before analyzing.");

    await user.type(screen.getByLabelText(/Electricity/), "100");
    mocks.api.lifestyle.analyze.mockRejectedValueOnce(new Error("analyze failed"));
    await user.click(screen.getByRole("button", { name: "Analyze now" }));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("analyze failed"));

    mocks.api.lifestyle.save.mockRejectedValueOnce(new Error("save failed"));
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("save failed"));
  });

  it("retries a failed lifestyle profile load", async () => {
    const user = userEvent.setup();
    mocks.api.lifestyle.get.mockRejectedValueOnce(new Error("profile failed"));
    await renderPage(Lifestyle);

    expect(await screen.findByText("profile failed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry profile" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "How you get around" })).toBeInTheDocument();
  });
});

describe("StationMap interactions", () => {
  it("selects a nearby station with the keyboard from the air quality page", async () => {
    const user = userEvent.setup();
    await renderPage(AirQuality);

    expect(await screen.findByRole("button", { name: /Riverfront Grid/ })).toHaveAttribute("aria-current", "true");
    const map = screen.getByRole("region", { name: /Nearby air quality reference points map/ });
    map.focus();
    expect(map).toHaveFocus();

    const second = screen.getByRole("button", { name: /Civil Lines Grid/ });
    second.focus();
    expect(second).toHaveFocus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(second).toHaveAttribute("aria-current", "true"));
    expect(screen.getByRole("button", { name: /Riverfront Grid/ })).not.toHaveAttribute("aria-current");
    expect(mocks.api.airQuality.stations).toHaveBeenCalledTimes(1);
  });

  it("exposes a keyboard focusable map region through its public component export", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    await renderPage(StationMap, {
      center: mocks.coords,
      stations: makeStations(),
      activeId: "s2",
      onSelect,
      label: "Station picker",
      height: 300,
    });

    const region = screen.getByRole("region", {
      name: "Station picker. Use the station list below for detailed readings.",
    });
    await user.tab();
    expect(region).toHaveFocus();
    expect(
      within(region).getByText(
        "Interactive map. Use the nearby reference point list below to select a station; map markers are also selectable with a pointer.",
      ),
    ).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
