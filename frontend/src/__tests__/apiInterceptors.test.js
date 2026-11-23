import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, TOKEN_KEY, USER_KEY } from "../services/api";

const originalAdapter = api.defaults.adapter;

describe("api interceptors", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
  });

  it("attaches the stored bearer token to requests", async () => {
    localStorage.setItem(TOKEN_KEY, "test-token");
    let seenConfig;
    api.defaults.adapter = async (config) => {
      seenConfig = config;
      return { data: { ok: true }, status: 200, statusText: "OK", headers: {}, config };
    };

    await api.get("/test");

    const authorization = seenConfig.headers.get?.("Authorization") ?? seenConfig.headers.Authorization;
    expect(authorization).toBe("Bearer test-token");
  });

  it("clears storage and announces a 401 response", async () => {
    localStorage.setItem(TOKEN_KEY, "test-token");
    localStorage.setItem(USER_KEY, JSON.stringify({ name: "Test User" }));
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    api.defaults.adapter = async (config) =>
      Promise.reject({ config, response: { status: 401, data: { error: "Unauthorized" } } });

    await expect(api.get("/test")).rejects.toBeDefined();

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(USER_KEY)).toBeNull();
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "airaware:unauthorized" }));
  });
});
