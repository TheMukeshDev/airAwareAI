import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const login = vi.fn();
const register = vi.fn();

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ login, register }),
}));

vi.mock("../services/api", () => ({
  apiError: () => "Request failed",
}));

import { Login } from "../pages/Login";
import { Register } from "../pages/Register";

describe("auth forms", () => {
  it("announces login validation errors", async () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByText("Email is required.")).toHaveAttribute("role", "alert");
    expect(screen.getByText("Password is required.")).toHaveAttribute("role", "alert");
  });

  it("announces register validation errors", async () => {
    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));
    expect(await screen.findByText("Please tell us your name.")).toHaveAttribute("role", "alert");
    expect(screen.getByText("Enter a valid email address.")).toHaveAttribute("role", "alert");
    expect(screen.getByText("Use at least 8 characters.")).toHaveAttribute("role", "alert");
  });
});