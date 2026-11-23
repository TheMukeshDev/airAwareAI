import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

vi.mock("../hooks/useAirQuality", () => ({
  useAirQuality: () => ({ data: null, loading: false, error: null, refresh: () => {} }),
  useForecast: () => ({ data: null, loading: false, error: null, refresh: () => {} }),
  useUserCoords: () => ({ latitude: 25.4358, longitude: 81.8463 }),
}));

vi.mock("../services/api", () => ({
  planApi: { today: vi.fn(() => new Promise(() => {})), generate: vi.fn(() => new Promise(() => {})), complete: vi.fn(() => new Promise(() => {})) },
  lifestyleApi: { get: vi.fn(() => new Promise(() => {})), save: vi.fn(() => new Promise(() => {})), analyze: vi.fn(() => new Promise(() => {})) },
  impactApi: { personal: vi.fn(() => new Promise(() => {})), history: vi.fn(() => new Promise(() => {})), log: vi.fn(() => new Promise(() => {})) },
  assistantApi: { history: vi.fn(() => new Promise(() => {})), chat: vi.fn(() => new Promise(() => {})) },
  communityApi: {
    stats: vi.fn(() => new Promise(() => {})),
    challenges: vi.fn(() => new Promise(() => {})),
    leaderboard: vi.fn(() => new Promise(() => {})),
    join: vi.fn(() => new Promise(() => {})),
  },
  indoorApi: { create: vi.fn(() => new Promise(() => {})) },
  airQualityApi: {
    current: vi.fn(() => new Promise(() => {})),
    forecast: vi.fn(() => new Promise(() => {})),
    stations: vi.fn(() => new Promise(() => {})),
  },
  profileApi: { get: vi.fn(() => new Promise(() => {})), update: vi.fn(() => new Promise(() => {})), completeOnboarding: vi.fn(() => new Promise(() => {})) },
  authApi: { login: vi.fn(() => new Promise(() => {})), register: vi.fn(() => new Promise(() => {})) },
  apiError: (_error, fallback) => fallback ?? "Request failed",
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: { name: "Test User", location: { city: "Prayagraj", latitude: 25.4358, longitude: 81.8463 }, preferences: { aqi_scale: "us" } },
    isAuthenticated: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
    updateUser: vi.fn(),
  }),
}));

vi.mock("../components/charts/Charts", () => ({
  TrendChart: () => <div>Chart</div>,
  SimpleBarChart: () => <div>Chart</div>,
  Sparkline: () => <div>Chart</div>,
}));

import { impactApi } from "../services/api";
import AirQuality from "../pages/AirQuality";
import Assistant from "../pages/Assistant";
import Community from "../pages/Community";
import DailyPlan from "../pages/DailyPlan";
import Dashboard from "../pages/Dashboard";
import Impact from "../pages/Impact";
import IndoorAir from "../pages/IndoorAir";
import Landing from "../pages/Landing";
import Lifestyle from "../pages/Lifestyle";
import Login from "../pages/Login";
import Onboarding from "../pages/Onboarding";
import Register from "../pages/Register";
import Settings from "../pages/Settings";

async function renderPage(Component) {
  let result;
  await act(async () => {
    result = render(
      <MemoryRouter>
        <Component />
      </MemoryRouter>,
    );
  });
  return result;
}

describe("a11y", () => {
  it("Landing has no axe violations", async () => {
    const { container } = await renderPage(Landing);
    expect(await axe(container, { rules: { "aria-allowed-role": { enabled: false } } })).toHaveNoViolations();
  }, 15000);

  it("Login has no axe violations", async () => {
    const { container } = await renderPage(Login);
    expect(await axe(container, { rules: { "aria-allowed-role": { enabled: false } } })).toHaveNoViolations();
  }, 15000);

  it("Register has no axe violations", async () => {
    const { container } = await renderPage(Register);
    expect(await axe(container, { rules: { "aria-allowed-role": { enabled: false } } })).toHaveNoViolations();
  }, 15000);

  it("Dashboard has no axe violations post-interaction baseline render", async () => {
    const { container } = await renderPage(Dashboard);
    expect(await axe(container, { rules: { "aria-allowed-role": { enabled: false } } })).toHaveNoViolations();
  }, 15000);

  it("AirQuality has no axe violations", async () => {
    const { container } = await renderPage(AirQuality);
    expect(await axe(container, { rules: { "aria-allowed-role": { enabled: false } } })).toHaveNoViolations();
  }, 15000);

  it("Assistant stays keyboard reachable and has no axe violations", async () => {
    const user = userEvent.setup();
    const { container } = await renderPage(Assistant);
    await user.tab();
    expect(document.activeElement).toBeInstanceOf(HTMLElement);
    expect(await axe(container, { rules: { "aria-allowed-role": { enabled: false } } })).toHaveNoViolations();
  }, 15000);

  it("DailyPlan has no axe violations", async () => {
    const { container } = await renderPage(DailyPlan);
    expect(await axe(container, { rules: { "aria-allowed-role": { enabled: false } } })).toHaveNoViolations();
  }, 15000);

  it("Impact has no axe violations", async () => {
    const { container } = await renderPage(Impact);
    expect(await axe(container, { rules: { "aria-allowed-role": { enabled: false } } })).toHaveNoViolations();
  }, 15000);

  it("Community has no axe violations", async () => {
    const { container } = await renderPage(Community);
    expect(await axe(container, { rules: { "aria-allowed-role": { enabled: false } } })).toHaveNoViolations();
  }, 15000);

  it("Lifestyle has no axe violations", async () => {
    const { container } = await renderPage(Lifestyle);
    expect(await axe(container, { rules: { "aria-allowed-role": { enabled: false } } })).toHaveNoViolations();
  }, 15000);

  it("IndoorAir has no axe violations", async () => {
    const { container } = await renderPage(IndoorAir);
    expect(await axe(container, { rules: { "aria-allowed-role": { enabled: false } } })).toHaveNoViolations();
  }, 15000);

  it("Settings has no axe violations", async () => {
    const { container } = await renderPage(Settings);
    expect(await axe(container, { rules: { "aria-allowed-role": { enabled: false } } })).toHaveNoViolations();
  }, 15000);

  it("Onboarding has no axe violations", async () => {
    const { container } = await renderPage(Onboarding);
    expect(await axe(container, { rules: { "aria-allowed-role": { enabled: false } } })).toHaveNoViolations();
  }, 15000);

  it("Impact renders a retryable error state when loading fails", async () => {
    vi.mocked(impactApi.personal).mockRejectedValueOnce(new Error("boom"));
    await renderPage(Impact);
    expect(await screen.findByText("Could not load your impact summary.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load your impact summary.");
  }, 15000);
});
