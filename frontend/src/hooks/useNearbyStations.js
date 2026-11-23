import { useEffect, useState } from "react";
import { airQualityApi, apiError } from "../services/api";

export function useNearbyStations(coords) {
  const [stations, setStations] = useState([]);
  const [active, setActive] = useState(null);
  const [state, setState] = useState({ loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    airQualityApi
      .stations(coords)
      .then((response) => {
        if (cancelled) return;
        const points = response.stations ?? [];
        setStations(points);
        setActive(points[0] ?? null);
        setState({ loading: false, error: null });
      })
      .catch((error) => {
        if (!cancelled) {
          setState({ loading: false, error: apiError(error, "Nearby reference points unavailable.") });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [coords]);

  return { stations, active, setActive, ...state };
}

export default useNearbyStations;
