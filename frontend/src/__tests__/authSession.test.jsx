import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthProvider";
import { useAuth } from "../context/AuthContext";
import { profileApi, TOKEN_KEY, USER_KEY } from "../services/api";

vi.mock("../services/api", () => ({
  TOKEN_KEY: "airaware.token",
  USER_KEY: "airaware.user",
  authApi: { login: vi.fn(), register: vi.fn() },
  profileApi: { get: vi.fn() },
}));

function tokenFor(expSeconds) {
  const payload = btoa(JSON.stringify({ exp: expSeconds })).replace(/=+$/, "");
  return `header.${payload}.signature`;
}

function SessionProbe() {
  const { user, isAuthenticated } = useAuth();
  return (
    <div data-testid="session" data-auth={String(isAuthenticated)}>
      {user?.name ?? "none"}
    </div>
  );
}

function renderSession() {
  return render(
    <AuthProvider>
      <SessionProbe />
    </AuthProvider>,
  );
}

describe("auth session", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("restores a persisted session from storage and profile response", async () => {
    localStorage.setItem(TOKEN_KEY, tokenFor(Math.floor(Date.now() / 1000) + 600));
    localStorage.setItem(USER_KEY, JSON.stringify({ name: "Stored User" }));
    vi.mocked(profileApi.get).mockResolvedValueOnce({ user: { name: "Fresh User", onboarding_complete: true } });

    renderSession();

    expect(await screen.findByText("Fresh User")).toBeInTheDocument();
    expect(screen.getByTestId("session")).toHaveAttribute("data-auth", "true");
    expect(JSON.parse(localStorage.getItem(USER_KEY)).name).toBe("Fresh User");
  });

  it("clears the session when an unauthorized event is dispatched", async () => {
    localStorage.setItem(TOKEN_KEY, tokenFor(Math.floor(Date.now() / 1000) + 600));
    localStorage.setItem(USER_KEY, JSON.stringify({ name: "Stored User" }));
    vi.mocked(profileApi.get).mockResolvedValueOnce({ user: { name: "Fresh User" } });
    renderSession();
    expect(await screen.findByText("Fresh User")).toBeInTheDocument();

    await act(async () => {
      window.dispatchEvent(new Event("airaware:unauthorized"));
    });

    expect(await screen.findByText("none")).toBeInTheDocument();
    expect(screen.getByTestId("session")).toHaveAttribute("data-auth", "false");
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(USER_KEY)).toBeNull();
  });

  it("drops an expired token without calling the profile endpoint", async () => {
    localStorage.setItem(TOKEN_KEY, tokenFor(Math.floor(Date.now() / 1000) - 60));
    localStorage.setItem(USER_KEY, JSON.stringify({ name: "Stored User" }));

    renderSession();

    await waitFor(() => expect(localStorage.getItem(TOKEN_KEY)).toBeNull());
    expect(profileApi.get).not.toHaveBeenCalled();
    expect(localStorage.getItem(USER_KEY)).toBeNull();
  });
});
