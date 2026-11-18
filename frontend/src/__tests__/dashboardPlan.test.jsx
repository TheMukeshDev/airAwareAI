import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../hooks/useAirQuality", () => ({
  useAirQuality: () => ({ data: null, loading: false, error: null, refresh: () => {} }),
  useForecast: () => ({ data: { hourly: [] }, loading: false, error: null }),
  useUserCoords: () => ({ latitude: 25.4358, longitude: 81.8463 }),
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      name: "Test User",
      location: { city: "Prayagraj", latitude: 25.4358, longitude: 81.8463 },
      preferences: { aqi_scale: "us" },
    },
  }),
}));

vi.mock("../services/api", () => ({
  planApi: {
    today: vi.fn(async () => ({
      plan: { id: "plan-1", summary: "A short plan", actions: [{ id: "action-1", title: "Test action", completed: false }] },
    })),
    complete: vi.fn(async (_planId, _actionId, done) => ({
      plan: { id: "plan-1", actions: [{ id: "action-1", title: "Test action", completed: done }] },
    })),
  },
  impactApi: { personal: vi.fn(async () => ({ totals: {} })) },
  apiError: () => "Request failed",
}));

vi.mock("../components/charts/Charts", () => ({
  TrendChart: () => <div>Chart</div>,
  SimpleBarChart: () => <div>Chart</div>,
  Sparkline: () => <div>Chart</div>,
}));

import { Dashboard } from "../pages/Dashboard";
import { planApi } from "../services/api";

describe("Dashboard daily plan", () => {
  it("renders actions and toggles them without crashing", async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );
    const button = await screen.findByRole("button", { name: "Mark Test action as done" });
    await userEvent.click(button);
    expect(planApi.complete).toHaveBeenCalledWith("plan-1", "action-1", true);
    expect(await screen.findByRole("button", { name: "Mark Test action as not done" })).toBeInTheDocument();
  });
});
