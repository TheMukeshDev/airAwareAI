import { act, render, screen, renderHook, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import Button from "../components/common/Button";
import Badge from "../components/common/Badge";
import Card, { CardHeader, CardTitle, CardDescription } from "../components/common/Card";
import EmptyState from "../components/common/EmptyState";
import ErrorState from "../components/common/ErrorState";
import { Field, Input, Textarea, LabeledSelect } from "../components/common/Field";
import PageHeader from "../components/common/PageHeader";
import Progress from "../components/common/Progress";
import { Stat } from "../components/common/Stat";
import Toggle, { Segmented } from "../components/common/Toggle";
import DataNote from "../components/common/DataNote";
import { Spinner, LoadingBlock } from "../components/common/Spinner";
import { LiveAnnouncer } from "../components/common/LiveAnnouncer";
import AqiCard from "../components/dashboard/AqiCard";
import PollutantGrid from "../components/dashboard/PollutantGrid";
import RecommendationList from "../components/dashboard/RecommendationList";
import WeatherStrip from "../components/dashboard/WeatherStrip";
import StationMap from "../components/map/StationMap";
import Logo from "../components/layout/Logo";
import { AppShell, ScrollToTop } from "../components/layout/AppShell";
import { PublicLayout } from "../components/layout/PublicLayout";
import { NotFound } from "../components/layout/ProtectedRoute";
import { cn, formatNumber, formatDateTime, relativeTime, initials, safeExternalUrl } from "../lib/utils";
import { classifyAqi, pollutantTone, aqiScaleLabel, AQI_TONES, POLLUTANTS } from "../lib/aqi";
import { useAsyncResource } from "../hooks/useAsyncResource";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: { name: "Test", location: { city: "Prayagraj" } } }) }));
vi.mock("../services/api", () => ({ apiError: (_error, fallback) => fallback || "Request failed" }));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
  TileLayer: () => <div data-testid="tiles" />,
  CircleMarker: ({ children }) => <div>{children}</div>,
  Popup: ({ children }) => <div>{children}</div>,
  useMap: () => ({ setView: vi.fn(), getZoom: () => 10 }),
}));

describe("common components", () => {
  it("renders button variants, links, loading, href safety and active state", async () => {
    const user = userEvent.setup();
    const click = vi.fn();
    render(
      <MemoryRouter>
        <Button onClick={click}>Primary</Button>
        <Button variant="secondary" size="sm" loading>Loading</Button>
        <Button to="/dashboard">Internal</Button>
        <Button href="https://example.com">External</Button>
        <Button href="javascript:alert(1)">Unsafe</Button>
        <Button variant="danger" size="lg" disabled>Disabled</Button>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Primary" }));
    expect(click).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Internal" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: "External" })).toHaveAttribute("href", "https://example.com/");
    expect(screen.getByText("Unsafe").closest("[aria-disabled]")).toBeInTheDocument();
  });

  it("renders badges, cards, page header, data note, progress and stats", () => {
    render(
      <MemoryRouter>
        <Badge tone="good" dot>Healthy</Badge>
        <Card><CardHeader action={<span>Action</span>}><CardTitle>Title</CardTitle><CardDescription>Description</CardDescription></CardHeader></Card>
        <DataNote tone="warning">Data note</DataNote>
        <PageHeader eyebrow="Section" title="Heading" description="Desc" actions={<Button>Action</Button>} />
        <Progress value={75} label="Progress" />
        <Stat label="People" value="12" unit="users" hint="Hint" />
      </MemoryRouter>,
    );
    expect(screen.getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Data note")).toBeInTheDocument();
    expect(screen.getByText("Progress")).toBeInTheDocument();
  });

  it("covers field, toggle, segmented, spinner and live announcer branches", async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(
      <MemoryRouter>
        <Field label="Name" hint="Hint" error="Required">{({ id, ...props }) => <Input id={id} {...props} />}</Field>
        <Field label="Notes">{({ id, ...props }) => <Textarea id={id} {...props} />}</Field>
        <LabeledSelect label="Choice" value="a" onChange={change}>
          <option value="a">A</option><option value="b">B</option>
        </LabeledSelect>
        <Toggle id="toggle" checked={false} onChange={change} label="Notify" description="Desc" />
        <Toggle checked label="Checked" onChange={change} />
        <Segmented options={[{ value: "a", label: "A" }, { value: "b", label: "B" }]} value="a" onChange={change} size="sm" ariaLabel="Scale" />
        <Spinner label="Loading" />
        <LoadingBlock label="Loading page" />
        <LiveAnnouncer message="Updated" />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("switch", { name: "Notify" }));
    await user.click(screen.getByRole("switch", { name: "Checked" }));
    await user.click(screen.getByRole("button", { name: "B" }));
    expect(change).toHaveBeenCalledTimes(3);
  });

  it("renders empty and error states and retries", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(<MemoryRouter>
      <EmptyState title="Empty" description="Nothing" />
      <EmptyState title="Action" description="Try" action="/dashboard" actionLabel="Continue" />
      <ErrorState title="Problem" message="Broken" onRetry={retry} retryLabel="Retry" />
    </MemoryRouter>);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute("href", "/dashboard");
  });
});

describe("dashboard and layout components", () => {
  it("covers AQI card loading, error, cached, scale and gauge branches", async () => {
    const user = userEvent.setup();
    const refresh = vi.fn();
    const { rerender } = render(<AqiCard loading reading={null} onRefresh={refresh} />);
    expect(screen.getByLabelText(/AQI gauge/)).toBeInTheDocument();
    rerender(<AqiCard error="Unavailable" onRefresh={refresh} />);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    rerender(<AqiCard reading={{ aqi: 72, scale: "india", aqi_india_method: true, stale: true, location: { name: "Prayagraj", admin1: "UP" }, pollutants: { pm2_5: 18 }, observed_at: "2026-11-23T10:00:00Z", source: "CAMS", primary_pollutant: "PM2.5" }} onRefresh={refresh} />);
    expect(screen.getAllByText(/CPCB/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Refresh air quality" }));
  });

  it("covers pollutant, recommendation and weather variants", async () => {
    const user = userEvent.setup();
    const toggle = vi.fn();
    render(
      <MemoryRouter>
        <PollutantGrid pollutants={{ pm2_5: 18, pm10: null, ozone: 12 }} units={{ pm2_5: "µg/m³" }} />
        <RecommendationList items={[
          { id: "1", title: "Cycle", detail: "Ride", why: "Clean", priority: "high", completed: false, window: "Morning", co2_saved_kg: 1, safety: "Helmet" },
          { id: "2", title: "", completed: true, priority: "unknown" },
        ]} onToggle={toggle} busyId="1" />
        <WeatherStrip />
        <WeatherStrip weather={{ temperature_c: 24.5, relative_humidity: 50, wind_speed_kmh: 8, visibility_m: 2500, cloud_cover: 20, wind_direction: 225 }} />
      </MemoryRouter>,
    );
    await user.click(screen.getAllByRole("button")[0]);
    expect(toggle).not.toHaveBeenCalled();
  });

  it("covers StationMap and layout exports", () => {
    render(
      <MemoryRouter>
        <StationMap center={{ latitude: 25.4, longitude: 81.8 }} stations={[{ id: "1", name: "Central", latitude: 25.4, longitude: 81.8, aqi: 72, pm2_5: 18 }]} activeId="1" />
        <Logo to="/dashboard" />
        <ScrollToTop />
        <PublicLayout />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("map")).toBeInTheDocument();
  });

  it("renders not found and layout not-found contract", () => {
    render(<MemoryRouter><NotFound /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "This page drifted away" })).toBeInTheDocument();
  });

  it("renders AppShell children and boot splash", () => {
    render(<MemoryRouter><AppShell /></MemoryRouter>);
  });
});

describe("lib helpers", () => {
  it("covers utils and AQI classifications across scales and bounds", () => {
    expect(cn("px-2", "px-4")).toContain("px-4");
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber("bad")).toBe("—");
    expect(formatNumber(12.345)).toBe("12.3");
    expect(formatDateTime()).toBe("—");
    expect(formatDateTime("bad")).toBe("—");
    expect(formatDateTime("2026-11-23T10:00:00Z")).not.toBe("—");
    expect(relativeTime()).toBe("—");
    expect(relativeTime("bad")).toBe("—");
    expect(relativeTime(new Date(Date.now() - 30 * 60_000).toISOString())).not.toBe("—");
    expect(initials("  Test   User  ").toString()).toBe("TU");
    expect(initials()).toBe("");
    expect(safeExternalUrl()).toBeNull();
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("ftp://example.com")).toBeNull();
    expect(safeExternalUrl("https://example.com")).toContain("https://");

    for (const value of [null, undefined, "bad", 25, 75, 125, 175, 250, 500]) {
      expect(classifyAqi(value, "us").label).toBeTruthy();
      expect(classifyAqi(value, "india").label).toBeTruthy();
    }
    expect(pollutantTone(null)).toBe("muted");
    for (const value of [10, 20, 40, 100, 200]) expect(pollutantTone(value)).toBeTruthy();
    expect(aqiScaleLabel("india")).toContain("CPCB");
    expect(aqiScaleLabel("us")).toBe("US AQI");
    expect(AQI_TONES.good.hex).toBeTruthy();
    expect(POLLUTANTS).toHaveLength(6);
  });

  it("covers async resource success, failure and reload", async () => {
    const loader = vi.fn().mockResolvedValueOnce({ value: 1 }).mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useAsyncResource(loader, [1], { fallback: "Fallback" }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ value: 1 });
    await act(async () => {
      await result.current.reload();
    });
    await waitFor(() => expect(result.current.error).toBe("Fallback"));
  });
});
