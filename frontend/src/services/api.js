import axios from "axios";

/** @typedef {{ error?: string, message?: string, errors?: string[] }} ApiErrorBody */
/** @typedef {{ response?: { status?: number, data?: ApiErrorBody }, code?: string }} ApiFailure */

export const TOKEN_KEY = "airaware.token";
export const USER_KEY = "airaware.user";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  timeout: 20000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401 && localStorage.getItem(TOKEN_KEY)) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      if (!window.location.pathname.startsWith("/login")) {
        window.dispatchEvent(new CustomEvent("airaware:unauthorized"));
      }
    }
    return Promise.reject(error);
  },
);

/**
 * @param {ApiFailure | unknown} error
 * @param {string} [fallback]
 * @returns {string}
 */
export function apiError(error, fallback = "Something went wrong. Please try again.") {
  const data = error?.response?.data;
  if (typeof data?.error === "string") return data.error;
  if (typeof data?.message === "string") return data.message;
  if (Array.isArray(data?.errors) && data.errors.length) return data.errors.join(" · ");
  if (error?.code === "ECONNABORTED") return "The request timed out. Check your connection and retry.";
  if (!error?.response) return "Cannot reach the AirAware API. Is the backend running?";
  return fallback;
}

/** @type {{ register: (payload: object) => Promise<any>, login: (payload: object) => Promise<any> }} */
export const authApi = {
  register: (payload) => api.post("/auth/register", payload).then((r) => r.data),
  login: (payload) => api.post("/auth/login", payload).then((r) => r.data),
};

/** @type {{ get: () => Promise<any>, update: (payload: object) => Promise<any>, completeOnboarding: (payload: object) => Promise<any> }} */
export const profileApi = {
  get: () => api.get("/profile").then((r) => r.data),
  update: (payload) => api.put("/profile", payload).then((r) => r.data),
  completeOnboarding: (payload) => api.post("/profile/onboarding", payload).then((r) => r.data),
};

/** @type {{ current: (params: object) => Promise<any>, forecast: (params: object) => Promise<any>, stations: (params: object) => Promise<any> }} */
export const airQualityApi = {
  current: (params) => api.get("/air-quality/current", { params }).then((r) => r.data),
  forecast: (params) => api.get("/air-quality/forecast", { params }).then((r) => r.data),
  stations: (params) => api.get("/air-quality/stations", { params }).then((r) => r.data),
};

/** @type {{ get: () => Promise<any>, save: (payload: object) => Promise<any>, analyze: (payload: object) => Promise<any> }} */
export const lifestyleApi = {
  get: () => api.get("/lifestyle").then((r) => r.data),
  save: (payload) => api.post("/lifestyle", payload).then((r) => r.data),
  analyze: (payload) => api.post("/lifestyle/analyze", payload).then((r) => r.data),
};

/** @type {{ generate: (payload?: object) => Promise<any>, today: () => Promise<any>, complete: (planId: string | number, actionId: string | number, completed?: boolean) => Promise<any> }} */
export const planApi = {
  generate: (payload) => api.post("/daily-plan/generate", payload ?? {}).then((r) => r.data),
  today: () => api.get("/daily-plan/today").then((r) => r.data),
  complete: (planId, actionId, completed = true) =>
    api.patch(`/daily-plan/${planId}/actions/${actionId}`, { completed }).then((r) => r.data),
};

/** @type {{ create: (payload: object) => Promise<any> }} */
export const indoorApi = {
  create: (payload) => api.post("/indoor/assessment", payload).then((r) => r.data),
};

/** @type {{ personal: (params: object) => Promise<any>, log: (payload: object) => Promise<any>, history: (params: object) => Promise<any> }} */
export const impactApi = {
  personal: (params) => api.get("/impact/personal", { params }).then((r) => r.data),
  log: (payload) => api.post("/impact/log", payload).then((r) => r.data),
  history: (params) => api.get("/impact/history", { params }).then((r) => r.data),
};

/** @type {{ chat: (payload: object) => Promise<any>, history: () => Promise<any> }} */
export const assistantApi = {
  chat: (payload) => api.post("/assistant/chat", payload).then((r) => r.data),
  history: () => api.get("/assistant/history").then((r) => r.data),
};

/** @type {{ stats: () => Promise<any>, challenges: () => Promise<any>, join: (challengeId: string | number) => Promise<any>, leaderboard: (params: object) => Promise<any> }} */
export const communityApi = {
  stats: () => api.get("/community/stats").then((r) => r.data),
  challenges: () => api.get("/community/challenges").then((r) => r.data),
  join: (challengeId) => api.post("/community/challenges/join", { challenge_id: challengeId }).then((r) => r.data),
  leaderboard: (params) => api.get("/community/leaderboard", { params }).then((r) => r.data),
};

export default api;
