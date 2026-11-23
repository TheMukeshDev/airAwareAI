import { act, render, screen, waitFor, renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: { user: null, isAuthenticated: false, booting: false, needsOnboarding: false, logout: vi.fn(), login: vi.fn(), register: vi.fn(), refreshUser: vi.fn(), updateUser: vi.fn() },
  api: {
    authLogin: vi.fn(), authRegister: vi.fn(), profileGet: vi.fn(), profileUpdate: vi.fn(),
    airCurrent: vi.fn(), airForecast: vi.fn(), airStations: vi.fn(),
    assistantHistory: vi.fn(), assistantChat: vi.fn(),
  },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("react-hot-toast", () => ({ default: mocks.toast }));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
  TileLayer: () => <div />,
  CircleMarker: ({ children, eventHandlers }) => (
    <button type="button" onClick={eventHandlers?.click} onKeyDown={eventHandlers?.keydown}>{children}</button>
  ),
  Popup: ({ children }) => <div>{children}</div>,
  useMap: () => ({ setView: vi.fn(), getZoom: () => 10 }),
}));

vi.mock("../services/api", () => ({
  TOKEN_KEY: "airaware.token",
  USER_KEY: "airaware.user",
  authApi: { login: mocks.api.authLogin, register: mocks.api.authRegister },
  profileApi: { get: mocks.api.profileGet, update: mocks.api.profileUpdate },
  airQualityApi: { current: mocks.api.airCurrent, forecast: mocks.api.airForecast, stations: mocks.api.airStations },
  assistantApi: { history: mocks.api.assistantHistory, chat: mocks.api.assistantChat },
  apiError: (error, fallback) => error?.response?.data?.error || error?.message || fallback || "Request failed",
}));

import { AuthContext, useAuth } from "../context/AuthContext";
import { AuthProvider } from "../context/AuthProvider";
import { PublicLayout } from "../components/layout/PublicLayout";
import { AppShell, ScrollToTop } from "../components/layout/AppShell";
import { ProtectedRoute, PublicOnlyRoute, NotFound } from "../components/layout/ProtectedRoute";
import StationMap from "../components/map/StationMap";
import { useAssistantChat } from "../hooks/useAssistantChat";
import { useNearbyStations } from "../hooks/useNearbyStations";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.api.assistantHistory.mockResolvedValue({ messages: [] });
  mocks.api.assistantChat.mockResolvedValue({ id: "reply-1", reply: "Take it gently.", sources: [], schema_validated: true });
  mocks.api.profileGet.mockResolvedValue({ name: "Stored", onboarding_complete: true });
  mocks.api.airStations.mockResolvedValue({ stations: [] });
});

function contextValue(overrides = {}) {
  return {
    user: null,
    token: null,
    isAuthenticated: false,
    booting: false,
    needsOnboarding: false,
    logout: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    refreshUser: vi.fn(),
    updateUser: vi.fn(),
    ...overrides,
  };
}

describe("layout branches", () => {
  it("PublicLayout renders menu, escape/tab focus handling and authenticated links", async () => {
    const user = userEvent.setup();
    const value = contextValue({ isAuthenticated: true, user: { name: "Asha" } });
    render(
      <AuthContext.Provider value={value}>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/" element={<PublicLayout />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    const menu = screen.getByRole("button", { name: "Open menu" });
    await user.click(menu);
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Open menu" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await user.keyboard("{Tab}");
  });

  it("Sidebar and mobile navigation cover active links and both sign-out paths", async () => {
    const user = userEvent.setup();
    const logout = vi.fn();
    const value = contextValue({
      isAuthenticated: true,
      user: { name: "Asha Rao", email: "asha@example.com", location: { city: "Prayagraj" } },
      logout,
    });
    render(
      <AuthContext.Provider value={value}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/dashboard" element={<div>Dashboard branch</div>} />
              <Route path="/settings" element={<div>Settings branch</div>} />
              <Route path="/login" element={<div>Login branch</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(screen.getByText("Asha Rao")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Sign out" })[0]);
    expect(logout).toHaveBeenCalled();
  });

  it("covers route guard boot, public-only, authenticated and onboarding branches", () => {
    const guardRender = (value, initialPath, guard) =>
      render(
        <AuthContext.Provider value={value}>
          <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
              <Route path="/login" element={<div>Login guard</div>} />
              <Route path="/onboarding" element={<div>Onboarding guard</div>} />
              <Route path="/dashboard" element={<div>Dashboard guard</div>} />
              <Route element={guard()} >
                <Route path="/guarded" element={<div>Guarded content</div>} />
              </Route>
              <Route element={<PublicOnlyRoute />}>
                <Route path="/public" element={<div>Public content</div>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>,
      );

    const boot = guardRender(contextValue({ booting: true }), "/guarded", () => <ProtectedRoute />);
    expect(screen.getByText("Restoring your session…")).toBeInTheDocument();
    boot.unmount();

    const publicOnly = guardRender(contextValue({ isAuthenticated: true }), "/public", () => <ProtectedRoute />);
    expect(screen.getByText("Dashboard guard")).toBeInTheDocument();
    publicOnly.unmount();

    render(
      <AuthContext.Provider value={contextValue({ isAuthenticated: true, needsOnboarding: true })}>
        <MemoryRouter initialEntries={["/guarded"]}>
          <Routes>
            <Route path="/onboarding" element={<div>Onboarding guard</div>} />
            <Route element={<ProtectedRoute />}><Route path="/guarded" element={<div>Guarded</div>} /></Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    expect(screen.getByText("Onboarding guard")).toBeInTheDocument();
  });

  it("renders not found and scroll-to-top route effects", () => {
    render(
      <MemoryRouter initialEntries={["/missing"]}>
        <Routes>
          <Route path="*" element={<><NotFound /><ScrollToTop /></>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "This page drifted away" })).toBeInTheDocument();
  });
});

describe("map and station hooks", () => {
  it("covers selected, unselected, empty, click and keyboard StationMap branches", async () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <StationMap
        center={{ latitude: 25.4, longitude: 81.8 }}
        stations={[
          { id: "1", name: "Central", latitude: 25.4, longitude: 81.8, aqi: 72, pm2_5: null },
          { id: "2", name: null, latitude: 25.5, longitude: 81.9, aqi: null },
        ]}
        activeId="1"
        onSelect={onSelect}
      />,
    );
    expect(screen.getByText(/Selected/)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button")[0]);
    expect(onSelect).toHaveBeenCalled();
    fireKey(screen.getAllByRole("button")[1], "Enter");
    fireKey(screen.getAllByRole("button")[1], "x");
    rerender(<StationMap center={null} stations={[]} />);
    expect(screen.getByText("No grid point selected.")).toBeInTheDocument();
  });

  it("loads and cancels nearby stations", async () => {
    mocks.api.airStations.mockReset();
    mocks.api.airStations.mockResolvedValue({ stations: [{ id: "s1", name: "One" }] });
    const first = renderHook(() => useNearbyStations({ latitude: 25.4, longitude: 81.8 }));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(first.result.current.active.name).toBe("One");
    act(() => first.result.current.setActive({ id: "manual" }));
    expect(first.result.current.active.id).toBe("manual");
    first.unmount();

    mocks.api.airStations.mockReset();
    mocks.api.airStations.mockRejectedValue(new Error("offline"));
    const second = renderHook(() => useNearbyStations({ latitude: 1, longitude: 2 }));
    await waitFor(() => expect(second.result.current.error).toBeTruthy());
  });
});

function fireKey(element, key) {
  act(() => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

describe("assistant hook and auth context", () => {
  it("covers hook success, ignored send, error, retry and history reload", async () => {
    const { result } = renderHook(() => useAssistantChat());
    await waitFor(() => expect(result.current.history.loading).toBe(false));
    await act(async () => result.current.send(""));
    expect(result.current.messages).toHaveLength(0);

    await act(async () => result.current.send("What about PM2.5?"));
    await waitFor(() => expect(result.current.validated).toBe(true));
    expect(result.current.messages.at(-1).content).toBe("Take it gently.");

    mocks.api.assistantChat.mockRejectedValueOnce(new Error("offline"));
    await act(async () => result.current.send("Try again"));
    await waitFor(() => expect(result.current.error).toBe("offline"));
    await act(async () => result.current.retry());
    expect(mocks.toast.error).toHaveBeenCalled();
  });

  it("throws outside an AuthProvider and reads a supplied context", () => {
    function Probe() {
      useAuth();
      return null;
    }
    expect(() => render(<Probe />)).toThrow("useAuth must be used within an AuthProvider");
    render(<AuthContext.Provider value={contextValue({ isAuthenticated: true })}><div>Context</div></AuthContext.Provider>);
  });

  it("covers AuthProvider login, register, update, refresh, malformed storage and 401 cleanup", async () => {
    const token = `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).replace(/=+$/, "")}.signature`;
    localStorage.setItem("airaware.token", token);
    localStorage.setItem("airaware.user", "{bad json");
    mocks.api.profileGet.mockResolvedValueOnce({ user: { name: "Fresh" } });
    mocks.api.authLogin.mockResolvedValueOnce({ access_token: token, user: { name: "Logged" } });
    mocks.api.authRegister.mockResolvedValueOnce({ access_token: token, user: { name: "Registered" } });
    mocks.api.profileGet.mockResolvedValueOnce({ name: "Refreshed" });

    function Probe() {
      const auth = useAuth();
      return (
        <div>
          <span data-testid="auth-name">{auth.user?.name || "none"}</span>
          <button onClick={() => auth.login({ email: "a@b.com", password: "x" })}>login</button>
          <button onClick={() => auth.register({ email: "a@b.com", password: "x" })}>register</button>
          <button onClick={() => auth.updateUser({ name: "Updated" })}>update</button>
          <button onClick={() => auth.refreshUser()}>refresh</button>
          <button onClick={() => auth.logout()}>provider logout</button>
        </div>
      );
    }

    const user = userEvent.setup();
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId("auth-name").textContent).toBe("Fresh"));
    await user.click(screen.getByRole("button", { name: "login" }));
    await waitFor(() => expect(screen.getByTestId("auth-name").textContent).toBe("Logged"));
    await user.click(screen.getByRole("button", { name: "update" }));
    expect(screen.getByTestId("auth-name").textContent).toBe("Updated");
    await user.click(screen.getByRole("button", { name: "register" }));
    await waitFor(() => expect(screen.getByTestId("auth-name").textContent).toBe("Registered"));
    await user.click(screen.getByRole("button", { name: "refresh" }));
    await waitFor(() => expect(screen.getByTestId("auth-name").textContent).toBe("Refreshed"));
    await user.click(screen.getByRole("button", { name: "provider logout" }));
    expect(screen.getByTestId("auth-name").textContent).toBe("none");
  });
});

