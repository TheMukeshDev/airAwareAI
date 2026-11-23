import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const mockApi = vi.hoisted(() => ({
  get: vi.fn((url, config) => Promise.resolve({ data: { url, config } })),
  post: vi.fn((url, payload) => Promise.resolve({ data: { url, payload } })),
  put: vi.fn((url, payload) => Promise.resolve({ data: { url, payload } })),
  patch: vi.fn((url, payload) => Promise.resolve({ data: { url, payload } })),
  interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
}));

vi.mock("axios", () => ({ default: { create: vi.fn(() => mockApi) } }));

import api, {
  apiError,
  assistantApi,
  authApi,
  airQualityApi,
  communityApi,
  impactApi,
  indoorApi,
  lifestyleApi,
  planApi,
  profileApi,
} from "../services/api";
import EmptyState from "../components/common/EmptyState";
import WeatherStrip from "../components/dashboard/WeatherStrip";

describe("API clients", () => {
  it("maps every resource operation to the backend contract", async () => {
    await authApi.register({ email: "a" });
    await authApi.login({ email: "a" });
    await profileApi.get();
    await profileApi.update({ name: "A" });
    await profileApi.completeOnboarding({});
    await airQualityApi.current({ latitude: 1 });
    await airQualityApi.forecast({ hours: 2 });
    await airQualityApi.stations({ latitude: 1 });
    await lifestyleApi.get();
    await lifestyleApi.save({});
    await lifestyleApi.analyze({});
    await planApi.generate();
    await planApi.today();
    await planApi.complete("p", "a", false);
    await indoorApi.create({});
    await impactApi.personal({});
    await impactApi.log({});
    await impactApi.history({});
    await assistantApi.chat({ message: "hi" });
    await assistantApi.history();
    await communityApi.stats();
    await communityApi.challenges();
    await communityApi.join("c");
    await communityApi.leaderboard({});

    expect(mockApi.post).toHaveBeenCalledWith("/daily-plan/generate", {});
    expect(mockApi.patch).toHaveBeenCalledWith("/daily-plan/p/actions/a", { completed: false });
    expect(mockApi.get).toHaveBeenCalledWith("/community/leaderboard", { params: {} });
  });

  it("normalizes all supported API failures", () => {
    expect(api).toBe(mockApi);
    expect(apiError({ response: { data: { error: "bad" } } })).toBe("bad");
    expect(apiError({ response: { data: { message: "bad" } } })).toBe("bad");
    expect(apiError({ response: { data: { errors: ["a", "b"] } } })).toBe("a · b");
    expect(apiError({ code: "ECONNABORTED" })).toMatch(/timed out/);
    expect(apiError({})).toMatch(/Cannot reach/);
    expect(apiError({ response: { status: 500 } }, "fallback")).toBe("fallback");
  });
});

describe("common data states", () => {
  it("renders empty and unavailable weather states plus all weather fields", () => {
    render(
      <MemoryRouter>
        <EmptyState title="Nothing here" description="Try again" action="/dashboard" />
        <WeatherStrip />
        <WeatherStrip
          weather={{
            temperature_c: 24.5,
            relative_humidity: 50,
            wind_speed_kmh: 8,
            visibility_m: 2500,
            cloud_cover: 20,
            wind_direction: 225,
          }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByText("Weather data unavailable.")).toBeInTheDocument();
    expect(screen.getByText("2.5 km")).toBeInTheDocument();
    expect(screen.getByText("SW")).toBeInTheDocument();
  });
});
