import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Bike, Home, Leaf, MapPin } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { profileApi, apiError } from "../services/api";
import { CITIES } from "../lib/constants";
import { LocationStep } from "../components/onboarding/LocationStep";
import { HouseholdStep } from "../components/onboarding/HouseholdStep";
import { CommuteStep } from "../components/onboarding/CommuteStep";
import { GoalsStep } from "../components/onboarding/GoalsStep";
import { OnboardingShell } from "../components/onboarding/OnboardingShell";

const STEPS = [
  { key: "location", title: "Where do you breathe?", description: "Your readings and plans are grounded in this location.", icon: MapPin },
  { key: "household", title: "Your household", description: "Indoor guidance depends on how you live and cook.", icon: Home },
  { key: "commute", title: "How you move", description: "This sets your transport baseline for avoided-emission maths.", icon: Bike },
  { key: "goals", title: "What matters most?", description: "Pick the outcomes the planner should optimise for.", icon: Leaf },
];

const EMPTY_FORM = {
  city: "",
  household_type: "",
  household_size: "",
  cooking_fuel: "",
  primary_mode: "",
  commute_distance_km: "",
  commute_days_per_week: "",
  goals: [],
};

export default function Onboarding() {
  const { user, updateUser, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [refreshError, setRefreshError] = useState(null);
  const [skipped, setSkipped] = useState(false);
  const headingRef = useRef(null);
  const [form, setForm] = useState({
    ...EMPTY_FORM,
    city: user?.location?.city ?? "",
  });
  const city = useMemo(() => CITIES.find((option) => option.name === form.city) ?? CITIES[0], [form.city]);
  const current = STEPS[step];
  const StepIcon = current.icon;
  const announcement = `Step ${step + 1} of ${STEPS.length}: ${current.title}`;

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const update = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));
  const toggleGoal = (goal) =>
    setForm((previous) => ({
      ...previous,
      goals: previous.goals.includes(goal)
        ? previous.goals.filter((item) => item !== goal)
        : [...previous.goals, goal],
    }));

  const canContinue =
    step === 0
      ? Boolean(form.city)
      : step === 1
        ? Boolean(form.household_type && form.cooking_fuel && Number(form.household_size) > 0)
        : step === 2
          ? Boolean(form.primary_mode)
          : step === 3
            ? form.goals.length > 0
            : true;

  const payload = (isSkip = false) => ({
    onboarding_complete: !isSkip,
    onboarding_skipped: isSkip,
    location: {
      city: city.name,
      state: city.admin1,
      country: "India",
      latitude: city.latitude,
      longitude: city.longitude,
    },
    lifestyle: {
      household_type: form.household_type || null,
      household_size: form.household_size ? Number(form.household_size) : null,
      cooking_fuel: form.cooking_fuel || null,
      primary_mode: form.primary_mode || null,
      commute_distance_km: form.commute_distance_km !== "" ? Number(form.commute_distance_km) : null,
      commute_days_per_week: form.commute_days_per_week !== "" ? Number(form.commute_days_per_week) : null,
    },
    goals: form.goals,
  });

  const finish = async (isSkip) => {
    try {
      await refreshUser();
      setRefreshError(null);
      toast.success(isSkip ? "You can complete setup anytime from Settings." : "You're set up.");
      navigate("/dashboard", { replace: true });
    } catch (error) {
      const message = apiError(error, "Setup saved, but your session could not be refreshed.");
      setRefreshError(message);
      toast.error(message);
    }
  };

  const save = async (isSkip = false) => {
    setSaving(true);
    try {
      const body = payload(isSkip);
      await profileApi.completeOnboarding(body);
      updateUser({
        location: body.location,
        preferences: { ...(user?.preferences ?? {}), goal: form.goals[0] ?? "reduce_emissions" },
        onboarding_complete: !isSkip,
        onboarding_skipped: isSkip,
      });
      setSkipped(isSkip);
      await finish(isSkip);
    } catch (error) {
      toast.error(apiError(error, "Could not save onboarding."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <OnboardingShell
      step={step}
      totalSteps={STEPS.length}
      announcement={announcement}
      headingRef={headingRef}
      current={current}
      StepIcon={StepIcon}
      refreshError={refreshError}
      saving={saving}
      canContinue={canContinue}
      onSkip={() => save(true)}
      onRefresh={() => finish(skipped)}
      onBack={step === 0 ? () => save(true) : () => setStep((value) => Math.max(0, value - 1))}
      onContinue={() => setStep((value) => Math.min(STEPS.length - 1, value + 1))}
      onFinish={() => save(false)}
    >
      {step === 0 ? <LocationStep form={form} onChange={update} /> : null}
      {step === 1 ? <HouseholdStep form={form} onChange={update} /> : null}
      {step === 2 ? <CommuteStep form={form} onChange={update} /> : null}
      {step === 3 ? <GoalsStep goals={form.goals} onToggle={toggleGoal} /> : null}
    </OnboardingShell>
  );
}
