import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

vi.mock("../hooks/useAirQuality", () => ({
  useAirQuality: () => ({ data: null, loading: false, error: null, refresh: () => {} }),
  useForecast: () => ({ data: null, loading: false, error: null }),
  useUserCoords: () => ({ latitude: 25.4358, longitude: 81.8463 }),
}));

vi.mock("../services/api", () => ({
  planApi: { today: vi.fn(() => new Promise(() => {})) },
  lifestyleApi: { get: vi.fn(() => new Promise(() => {})) },
  impactApi: {
    personal: vi.fn(() => new Promise(() => {})),
    history: vi.fn(() => new Promise(() => {})),
  },
  apiError: () => "Request failed",
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: { name: "Test User", location: { city: "Prayagraj", latitude: 25.4358, longitude: 81.8463 }, preferences: { aqi_scale: "us" } },
    isAuthenticated: false,
    login: vi.fn(),
    register: vi.fn(),
  }),
}));

vi.mock("../components/charts/Charts", () => ({
  TrendChart: () => <div>Chart</div>,
  SimpleBarChart: () => <div>Chart</div>,
  Sparkline: () => <div>Chart</div>,
}));

import { Landing } from "../pages/Landing";
import { Login } from "../pages/Login";
import { Dashboard } from "../pages/Dashboard";

describe("a11y", () => {
  it("Landing has no axe violations", async () => {
    const { container } = render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );
    expect(await axe(container)).toHaveNoViolations();
  }, 10000);

  it("Login has no axe violations", async () => {
    const { container } = render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    expect(await axe(container)).toHaveNoViolations();
  }, 10000);

  it("Dashboard has no axe violations post-interaction baseline render", async () => {
    const { container } = render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    expect(await axe(container)).toHaveNoViolations();
  }, 10000);
});