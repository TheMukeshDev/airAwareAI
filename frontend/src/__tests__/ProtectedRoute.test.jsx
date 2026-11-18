import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const authState = {
  isAuthenticated: false,
  booting: false,
  needsOnboarding: false,
};

vi.mock("../context/AuthContext", () => ({
  useAuth: () => authState,
}));

import { ProtectedRoute, PublicOnlyRoute } from "../components/layout/ProtectedRoute";

function renderProtected(initialPath) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/onboarding" element={<div>Onboarding page</div>} />
        <Route path="/dashboard" element={<div>Dashboard page</div>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/protected" element={<div>Protected page</div>} />
        </Route>
        <Route element={<PublicOnlyRoute />}>
          <Route path="/public-only" element={<div>Public only page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("route guards", () => {
  it("redirects unauthenticated users to login", () => {
    authState.isAuthenticated = false;
    authState.booting = false;
    authState.needsOnboarding = false;
    renderProtected("/protected");
    expect(screen.getByText("Login page")).toBeInTheDocument();
  });

  it("allows authenticated users through protected routes", () => {
    authState.isAuthenticated = true;
    authState.booting = false;
    authState.needsOnboarding = false;
    renderProtected("/protected");
    expect(screen.getByText("Protected page")).toBeInTheDocument();
  });

  it("redirects authenticated users who need onboarding", () => {
    authState.isAuthenticated = true;
    authState.booting = false;
    authState.needsOnboarding = true;
    renderProtected("/protected");
    expect(screen.getByText("Onboarding page")).toBeInTheDocument();
  });

  it("treats onboarding skipped as not needing onboarding", () => {
    authState.isAuthenticated = true;
    authState.booting = false;
    authState.needsOnboarding = false;
    renderProtected("/protected");
    expect(screen.getByText("Protected page")).toBeInTheDocument();
  });
});