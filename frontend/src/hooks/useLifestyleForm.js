import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { lifestyleApi, apiError } from "../services/api";
import { useAsyncResource } from "./useAsyncResource";

const EMPTY_FORM = {
  primary_mode: "",
  commute_distance_km: "",
  commute_days_per_week: "",
  weekly_other_km: "",
  flights_per_year: "",
  electricity_kwh_month: "",
  cooking_fuel: "",
  lpg_cylinders_month: "",
  household_size: "",
  diet: "",
  waste: [],
};

const numberOrNull = (value) => (value === "" ? null : Number(value));

export function useLifestyleForm() {
  const [changes, setChanges] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [busy, setBusy] = useState(false);
  const profile = useAsyncResource(() => lifestyleApi.get(), [], {
    fallback: "Could not load your lifestyle profile.",
  });

  const saved = profile.data?.profile ?? profile.data?.lifestyle ?? null;
  const flat = saved ? saved.flat ?? saved : null;
  const form = useMemo(
    () => ({ ...EMPTY_FORM, ...(flat ?? {}), waste: flat?.waste ?? EMPTY_FORM.waste, ...(changes ?? {}) }),
    [flat, changes],
  );
  const result = analysis ?? profile.data?.analysis ?? null;

  const update = (key, value) => setChanges((current) => ({ ...(current ?? {}), [key]: value }));
  const toggleWaste = (value) =>
    setChanges((current) => {
      const waste = current?.waste ?? form.waste;
      return {
        ...(current ?? {}),
        waste: waste.includes(value) ? waste.filter((item) => item !== value) : [...waste, value],
      };
    });

  const payload = () => ({
    transport: {
      primary_mode: form.primary_mode || null,
      commute_distance_km: numberOrNull(form.commute_distance_km),
      commute_days_per_week: numberOrNull(form.commute_days_per_week),
      weekly_other_km: numberOrNull(form.weekly_other_km),
      flights_per_year: numberOrNull(form.flights_per_year),
    },
    home: {
      electricity_kwh_month: numberOrNull(form.electricity_kwh_month),
      cooking_fuel: form.cooking_fuel || null,
      lpg_cylinders_month: numberOrNull(form.lpg_cylinders_month),
      household_size: numberOrNull(form.household_size),
    },
    food: { diet: form.diet || null },
    waste: form.waste,
  });

  const hasDetails = () =>
    Boolean(
      form.primary_mode ||
        form.commute_distance_km ||
        form.electricity_kwh_month ||
        form.cooking_fuel ||
        form.household_size ||
        form.diet ||
        form.waste.length,
    );

  const analyze = async (event) => {
    event?.preventDefault();
    if (!hasDetails()) {
      toast.error("Enter at least some lifestyle details before analyzing.");
      return;
    }
    setBusy(true);
    try {
      const response = await lifestyleApi.analyze(payload());
      setAnalysis(response.analysis ?? response);
      toast.success("Lifestyle analysis updated.");
    } catch (error) {
      toast.error(apiError(error, "Could not analyze your lifestyle."));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      await lifestyleApi.save(payload());
      toast.success("Lifestyle profile saved.");
    } catch (error) {
      toast.error(apiError(error, "Could not save your profile."));
    } finally {
      setBusy(false);
    }
  };

  return { form, update, toggleWaste, analyze, save, busy, result, profile };
}

export default useLifestyleForm;
