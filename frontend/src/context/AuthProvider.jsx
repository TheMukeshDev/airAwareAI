import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authApi, profileApi, TOKEN_KEY, USER_KEY } from "../services/api";
import { AuthContext } from "./AuthContext.jsx";

function readStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function isTokenExpired(token) {
  const payload = decodeJwtPayload(token);
  if (!payload || !payload.exp) return false;
  return Date.now() >= payload.exp * 1000;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [booting, setBooting] = useState(Boolean(localStorage.getItem(TOKEN_KEY)));
  const expiryTimer = useRef(null);

  const persistSession = useCallback((nextToken, nextUser) => {
    if (nextToken) localStorage.setItem(TOKEN_KEY, nextToken);
    if (nextUser) localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setToken(nextToken ?? null);
    setUser(nextUser ?? null);
  }, []);

  const logout = useCallback(() => {
    if (expiryTimer.current) {
      window.clearTimeout(expiryTimer.current);
      expiryTimer.current = null;
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const scheduleExpiry = useCallback((nextToken) => {
    if (expiryTimer.current) {
      window.clearTimeout(expiryTimer.current);
      expiryTimer.current = null;
    }
    const payload = decodeJwtPayload(nextToken);
    if (!payload?.exp) return;
    const ms = payload.exp * 1000 - Date.now();
    if (ms <= 0) {
      logout();
      return;
    }
    expiryTimer.current = window.setTimeout(() => logout(), ms);
  }, [logout]);

  const refreshUser = useCallback(async () => {
    const data = await profileApi.get();
    const nextUser = data.user ?? data;
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
    return nextUser;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (!storedToken) return undefined;
    if (isTokenExpired(storedToken)) {
      Promise.resolve().then(() => {
        logout();
        setBooting(false);
      });
      return undefined;
    }
    Promise.resolve().then(() => scheduleExpiry(storedToken));
    profileApi
      .get()
      .then((data) => {
        if (cancelled) return;
        const nextUser = data.user ?? data;
        localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
        setUser(nextUser);
      })
      .catch((error) => {
        if (cancelled) return;
        if (error?.response?.status === 401) logout();
      })
      .finally(() => {
        if (!cancelled) setBooting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [logout, scheduleExpiry]);

  useEffect(() => {
    const handler = () => logout();
    window.addEventListener("airaware:unauthorized", handler);
    return () => window.removeEventListener("airaware:unauthorized", handler);
  }, [logout]);

  const login = useCallback(
    async (credentials) => {
      const data = await authApi.login(credentials);
      persistSession(data.access_token, data.user);
      scheduleExpiry(data.access_token);
      return data.user;
    },
    [persistSession, scheduleExpiry],
  );

  const register = useCallback(
    async (payload) => {
      const data = await authApi.register(payload);
      persistSession(data.access_token, data.user);
      scheduleExpiry(data.access_token);
      return data.user;
    },
    [persistSession, scheduleExpiry],
  );

  const updateUser = useCallback((patch) => {
    setUser((current) => {
      const next = { ...(current ?? {}), ...patch };
      localStorage.setItem(USER_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token),
      booting,
      login,
      register,
      logout,
      refreshUser,
      updateUser,
      needsOnboarding: Boolean(token) && !user?.onboarding_complete && !user?.onboarding_skipped,
    }),
    [user, token, booting, login, register, logout, refreshUser, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthProvider;
