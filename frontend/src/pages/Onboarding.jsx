import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, ArrowRight, Check, Home, Leaf, MapPin, Bike } from "lucide-react";
import { Button } from "../components/common/Button";
import { LabeledSelect, Field, Input } from "../components/common/Field";
import { Progress } from "../components/common/Progress";
import { LiveAnnouncer } from "../components/common/LiveAnnouncer";
import { ErrorState } from "../components/common/ErrorState";
import { useAuth } from "../context/AuthContext";
import { profileApi, apiError } from "../services/api";
import { cn } from "../lib/utils";
import { Logo } from "../components/layout/Logo";
import { CITIES, COOKING_FUELS, GOALS, HOUSEHOLDS, TRANSPORT_MODES } from "../lib/constants";

const STEPS = [
  { key: "location", title: "Where do you breathe?", description: "Your readings and plans are grounded in this location.", icon: MapPin },
  { key: "household", title: "Your household", description: "Indoor guidance depends on how you live and cook.", icon: Home },
  { key: "commute", title: "How you move", description: "This sets your transport baseline for avoided-emission maths.", icon: Bike },
  { key: "goals", title: "What matters most?", description: "Pick the outcomes the planner should optimise for.", icon: Leaf },
];

export function Onboarding() {
  const { user, updateUser, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [refreshError, setRefreshError] = useState(null);
  const [pendingSkip, setPendingSkip] = useState(false);

  const headingRef = useRef(null);
  const [form, setForm] = useState({
    city: user?.location?.city || "",
    household_type: "",
    household_size: "",
    cooking_fuel: "",
    primary_mode: "",
    commute_distance_km: "",
    commute_days_per_week: "",
    goals: [],
  });

  const city = useMemo(() => CITIES.find((entry) => entry.name === form.city) ?? CITIES[0], [form.city]);
  const active = STEPS[step];
  const Icon = active.icon;

  const announcement = `Step ${step + 1} of ${STEPS.length}: ${active.title}`;

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);


  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const toggleGoal = (value) =>
    setForm((current) => ({
      ...current,
      goals: current.goals.includes(value)
        ? current.goals.filter((entry) => entry !== value)
        : [...current.goals, value],
    }));

  const canContinue = () => {
    if (step === 0) return Boolean(form.city);
    if (step === 1) return Boolean(form.household_type && form.cooking_fuel && Number(form.household_size) > 0);
    if (step === 2) return Boolean(form.primary_mode);
    if (step === 3) return form.goals.length > 0;
    return true;
  };

  const next = () => {
    if (!canContinue()) return;
    setStep((current) => Math.min(STEPS.length - 1, current + 1));
  };
  const back = () => setStep((current) => Math.max(0, current - 1));

  const buildPayload = (skipped = false) => {
    const chosenCity = CITIES.find((entry) => entry.name === form.city) ?? CITIES[0];
    return {
      onboarding_complete: !skipped,
      onboarding_skipped: skipped,
      location: {
        city: chosenCity.name,
        state: chosenCity.admin1,
        country: "India",
        latitude: chosenCity.latitude,
        longitude: chosenCity.longitude,
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
    };
  };

  const finishSetup = async (skipped) => {
    try {
      await refreshUser();
      setRefreshError(null);
      toast.success(skipped ? "You can complete setup anytime from Settings." : "You're set up.");
      navigate("/dashboard", { replace: true });
    } catch (error) {
      const message = apiError(error, "Setup saved, but your session could not be refreshed.");
      setRefreshError(message);
      toast.error(message);
    }
  };

  const submit = async (skipped = false) => {
    setSubmitting(true);
    try {
      const payload = buildPayload(skipped);
      await profileApi.completeOnboarding(payload);
      updateUser({
        location: payload.location,
        preferences: { ...(user?.preferences ?? {}), goal: form.goals[0] ?? "reduce_emissions" },
        onboarding_complete: !skipped,
        onboarding_skipped: skipped,
      });
      setPendingSkip(skipped);
      await finishSetup(skipped);
    } catch (error) {
      toast.error(apiError(error, "Could not save onboarding."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main id="main-content" tabIndex={-1} className="app-bg min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink-800 focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>
      <LiveAnnouncer message={announcement} />
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-6 sm:px-6">
        <div className="flex items-center justify-between">
          <Logo to="/dashboard" />
          <button
            type="button"
            onClick={() => submit(true)}
            className="text-[12px] text-slate-400 hover:text-slate-200"
            disabled={submitting}
          >
            Skip for now
          </button>
        </div>

        <div className="mt-8">
          <Progress value={((step + 1) / STEPS.length) * 100} label={`Step ${step + 1} of ${STEPS.length}`} />
        </div>

        <div className="surface mt-6 flex-1 p-6 sm:p-8">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-aurora-400/20 bg-aurora-400/8 text-aurora-300" aria-hidden="true">
            <Icon size={19} />
          </span>
          <h1 ref={headingRef} tabIndex={-1} className="mt-4 font-display text-[24px] font-semibold text-white">
            {active.title}
          </h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">{active.description}</p>

          {refreshError ? (
            <ErrorState
              message={refreshError}
              onRetry={() => finishSetup(pendingSkip)}
              retryLabel="Refresh profile"
            />
          ) : null}

          <div className="mt-7 space-y-4">
            {step === 0 ? (
              <>
                <LabeledSelect
                  label="City"
                  value={form.city}
                  onChange={(event) => set("city", event.target.value)}
                  hint={form.city ? `Coordinates used: ${city.latitude}, ${city.longitude} · India` : "Select your city to ground readings."}
                  required
                >
                  <option value="">Select a city</option>
                  {CITIES.map((entry) => (
                    <option key={entry.name} value={entry.name}>
                      {entry.name}, {entry.admin1}
                    </option>
                  ))}
                </LabeledSelect>
                <div className="rounded-xl border border-hairline bg-ink-900/60 p-4">
                  <p className="text-[12px] leading-relaxed text-slate-400">
                    AirAware uses model output for the nearest grid cell and, where available, station data. Model data is
                    not the same as a monitor in your street.
                  </p>
                </div>
              </>
            ) : null}

            {step === 1 ? (
              <>
                <LabeledSelect
                  label="Household type"
                  value={form.household_type}
                  onChange={(event) => set("household_type", event.target.value)}
                  required
                >
                  <option value="">Select household type</option>
                  {HOUSEHOLDS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </LabeledSelect>
                <Field label="People in the household" required>
                  {({ id, ...fieldProps }) => (
                    <Input
                      id={id}
                      type="number"
                      min={1}
                      max={20}
                      value={form.household_size}
                      onChange={(event) => set("household_size", event.target.value)}
                      {...fieldProps}
                    />
                  )}
                </Field>
                <LabeledSelect
                  label="Main cooking fuel"
                  value={form.cooking_fuel}
                  onChange={(event) => set("cooking_fuel", event.target.value)}
                  hint="Fuel type changes indoor pollution guidance significantly."
                  required
                >
                  <option value="">Select cooking fuel</option>
                  {COOKING_FUELS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </LabeledSelect>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <LabeledSelect
                  label="Usual commute mode"
                  value={form.primary_mode}
                  onChange={(event) => set("primary_mode", event.target.value)}
                  required
                >
                  <option value="">Select commute mode</option>
                  {TRANSPORT_MODES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </LabeledSelect>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="One-way distance (km)">
                    {({ id, ...fieldProps }) => (
                      <Input
                        id={id}
                        type="number"
                        min={0}
                        max={200}
                        step="0.5"
                        value={form.commute_distance_km}
                        onChange={(event) => set("commute_distance_km", event.target.value)}
                        {...fieldProps}
                      />
                    )}
                  </Field>
                  <Field label="Commute days per week">
                    {({ id, ...fieldProps }) => (
                      <Input
                        id={id}
                        type="number"
                        min={0}
                        max={7}
                        value={form.commute_days_per_week}
                        onChange={(event) => set("commute_days_per_week", event.target.value)}
                        {...fieldProps}
                      />
                    )}
                  </Field>
                </div>
                <p className="text-[12px] text-slate-400">Leave distance or days blank if unknown; you can update later.</p>
              </>
            ) : null}

            {step === 3 ? (
              <div role="group" aria-labelledby="goals-heading">
                <p id="goals-heading" className="mb-2 text-[12.5px] font-medium text-slate-300">Goals</p>
                <div className="flex flex-wrap gap-2">
                  {GOALS.map((goal) => {
                    const activeGoal = form.goals.includes(goal.value);
                    return (
                      <button
                        key={goal.value}
                        type="button"
                        onClick={() => toggleGoal(goal.value)}
                        aria-pressed={activeGoal}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[12.5px] transition-colors",
                          activeGoal
                            ? "border-aurora-400/50 bg-aurora-400/12 text-aurora-200"
                            : "border-hairline bg-ink-900/60 text-slate-400 hover:border-white/20",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 items-center justify-center rounded-full border",
                            activeGoal ? "border-aurora-400 bg-aurora-400 text-ink-950" : "border-white/20",
                          )}
                          aria-hidden="true"
                        >
                          {activeGoal ? <Check size={10} strokeWidth={3} /> : null}
                        </span>
                        {goal.label}
                      </button>
                    );
                  })}
                </div>
                {!form.goals.length ? (
                  <p className="mt-2 text-[12px] text-moderate" role="alert">Select at least one goal to personalise your plan.</p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="mt-8 flex items-center justify-between gap-3 border-t border-hairline pt-5">
            <Button variant="ghost" type="button" onClick={step === 0 ? () => submit(true) : back}>
              <ArrowLeft size={15} aria-hidden="true" />
              {step === 0 ? "Cancel" : "Back"}
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={next} disabled={!canContinue()}>
                Continue
                <ArrowRight size={15} aria-hidden="true" />
              </Button>
            ) : (
              <Button type="button" onClick={() => submit(false)} loading={submitting} disabled={!form.goals.length}>
                Finish setup
                <Check size={15} aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

export default Onboarding;
