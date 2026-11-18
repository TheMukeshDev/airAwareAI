import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { airQualityApi, apiError } from "../services/api";
import { DEFAULT_COORDS } from "../lib/constants";

let currentCache = null;
let currentCacheKey = null;
let currentCacheAt = 0;
let inflightCurrent = null;
let inflightKey = null;
const CURRENT_TTL_MS = 60_000;

function keyFor(lat, lon) {
  return `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
}

export function useAirQuality(coords) {
  const latitude = coords?.latitude ?? DEFAULT_COORDS.latitude;
  const longitude = coords?.longitude ?? DEFAULT_COORDS.longitude;
  const [state, setState] = useState({ data: null, loading: true, refreshing: false, error: null });
  const mountedRef = useRef(true);
  const requestRef = useRef(0);


  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const load = useCallback(async (force = false) => {
    const k = keyFor(latitude, longitude);
    const generation = ++requestRef.current;
    const commit = (next) => {
      if (mountedRef.current && generation === requestRef.current) setState(next);
    };
    const now = Date.now();
    if (!force && currentCache && currentCacheKey === k && now - currentCacheAt < CURRENT_TTL_MS) {
      commit({ data: currentCache, loading: false, refreshing: false, error: null });
      return;
    }

    commit((current) => ({
      ...current,
      loading: current.data === null,
      refreshing: current.data !== null,
      error: null,
    }));

    try {
      if (!force && inflightCurrent && inflightKey === k) {
        const data = await inflightCurrent;
        commit({ data, loading: false, refreshing: false, error: null });
        return;
      }

      const request = airQualityApi.current({ latitude, longitude });
      inflightCurrent = request;
      inflightKey = k;
      const data = await request;
      currentCache = data;
      currentCacheKey = k;
      currentCacheAt = Date.now();
      commit({ data, loading: false, refreshing: false, error: null });
    } catch (error) {
      commit((current) => ({
        data: current.data,
        loading: false,
        refreshing: false,
        error: apiError(error, "Air quality is unavailable right now."),
      }));
    } finally {
      if (inflightKey === k) {
        inflightCurrent = null;
        inflightKey = null;
      }
    }
  }, [latitude, longitude]);


  useEffect(() => {
    mountedRef.current = true;
    Promise.resolve().then(() => load());
  }, [load]);


  const refresh = useCallback(() => load(true), [load]);

  return { ...state, refresh, coords: { latitude, longitude } };
}


export function useForecast(coords, hours = 24) {
  const latitude = coords?.latitude ?? DEFAULT_COORDS.latitude;
  const longitude = coords?.longitude ?? DEFAULT_COORDS.longitude;
  const [state, setState] = useState({ data: null, loading: true, error: null });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await airQualityApi.forecast({ latitude, longitude, hours });
      return { data, error: null };
    } catch (error) {
      return { data: null, error: apiError(error, "Forecast is unavailable right now.") };
    }
  }, [latitude, longitude, hours]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await load();
      if (!cancelled) setState({ data: result.data, loading: false, error: result.error });
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const refresh = useCallback(async () => {
    const result = await load();
    setState({ data: result.data, loading: false, error: result.error });
  }, [load]);

  return { ...state, refresh };
}

export function useUserCoords(user) {
  return useMemo(
    () => ({
      latitude: user?.location?.latitude ?? DEFAULT_COORDS.latitude,
      longitude: user?.location?.longitude ?? DEFAULT_COORDS.longitude,
    }),
    [user?.location?.latitude, user?.location?.longitude],
  );
}
