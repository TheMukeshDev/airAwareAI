import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { currentMock, forecastMock } = vi.hoisted(() => ({
  currentMock: vi.fn(),
  forecastMock: vi.fn(),
}));

vi.mock("../services/api", () => ({
  airQualityApi: { current: currentMock, forecast: forecastMock, stations: vi.fn() },
  apiError: (_error, fallback) => fallback,
}));

import { useAirQuality, useForecast } from "../hooks/useAirQuality";

describe("air quality hooks", () => {
  beforeEach(() => {
    currentMock.mockReset();
    forecastMock.mockReset();
  });

  it("reuses a cached current reading within the TTL", async () => {
    currentMock.mockResolvedValue({ aqi: 42 });
    const coords = { latitude: 11.1111, longitude: 22.2222 };

    const first = renderHook(() => useAirQuality(coords));
    await waitFor(() => expect(first.result.current.data).toEqual({ aqi: 42 }));
    first.unmount();

    const second = renderHook(() => useAirQuality(coords));
    await waitFor(() => expect(second.result.current.data).toEqual({ aqi: 42 }));

    expect(currentMock).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent current-reading requests", async () => {
    currentMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ aqi: 7 }), 20)),
    );
    const coords = { latitude: 33.3333, longitude: 44.4444 };

    const first = renderHook(() => useAirQuality(coords));
    const second = renderHook(() => useAirQuality(coords));

    await waitFor(() => expect(first.result.current.data).toEqual({ aqi: 7 }));
    await waitFor(() => expect(second.result.current.data).toEqual({ aqi: 7 }));
    expect(currentMock).toHaveBeenCalledTimes(1);
  });

  it("exposes a readable error when the current request fails", async () => {
    currentMock.mockRejectedValueOnce(new Error("boom"));

    const { result } = renderHook(() =>
      useAirQuality({ latitude: 55.5555, longitude: 66.6666 }),
    );

    await waitFor(() =>
      expect(result.current.error).toBe("Air quality is unavailable right now."),
    );
  });

  it("reuses a cached forecast within the TTL", async () => {
    forecastMock.mockResolvedValue({ hours: [{ pm2_5: 12 }] });
    const coords = { latitude: 77.7777, longitude: 88.8888 };

    const first = renderHook(() => useForecast(coords, 12));
    await waitFor(() => expect(first.result.current.data).toEqual({ hours: [{ pm2_5: 12 }] }));
    first.unmount();

    const second = renderHook(() => useForecast(coords, 12));
    await waitFor(() => expect(second.result.current.data).toEqual({ hours: [{ pm2_5: 12 }] }));

    expect(forecastMock).toHaveBeenCalledTimes(1);
  });
});
