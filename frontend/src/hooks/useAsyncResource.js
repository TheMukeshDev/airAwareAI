import { useCallback, useEffect, useRef, useState } from "react";
import { apiError } from "../services/api";

export function useAsyncResource(loader, deps = [], options = {}) {
  const { initialData = null, fallback = "Could not load this section.", immediate = true } = options;
  const [state, setState] = useState({ data: initialData, loading: immediate, error: null });
  const loaderRef = useRef(loader);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const dependencyKey = JSON.stringify(deps);

  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
  });

  const reload = useCallback(async () => {
    const generation = ++generationRef.current;
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await loaderRef.current();
      if (mountedRef.current && generation === generationRef.current) {
        setState({ data, loading: false, error: null });
      }
      return data;
    } catch (error) {
      if (mountedRef.current && generation === generationRef.current) {
        setState((current) => ({
          data: current.data,
          loading: false,
          error: apiError(error, fallback),
        }));
      }
      return undefined;
    }
  }, [fallback]);

  useEffect(() => {
    if (immediate) {
      Promise.resolve().then(() => reload());
    }
    return undefined;
  }, [reload, immediate, dependencyKey]);

  const setData = useCallback((updater) => {
    setState((current) => ({
      ...current,
      data: typeof updater === "function" ? updater(current.data) : updater,
    }));
  }, []);

  return { ...state, reload, setData };
}

export default useAsyncResource;
