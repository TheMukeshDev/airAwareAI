import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Calculator, Leaf } from "lucide-react";
import { PageHeader } from "../components/common/PageHeader";
import { Button } from "../components/common/Button";
import { Card, CardDescription, CardHeader, CardTitle } from "../components/common/Card";
import { Field, Input, LabeledSelect } from "../components/common/Field";
import { Progress } from "../components/common/Progress";
import { Badge } from "../components/common/Badge";
import { DataNote } from "../components/common/DataNote";
import { LoadingBlock } from "../components/common/Spinner";
import { ErrorState } from "../components/common/ErrorState";
import { useAsyncResource } from "../hooks/useAsyncResource";
import { SimpleBarChart } from "../components/charts/Charts";
import { lifestyleApi, apiError } from "../services/api";
import { formatNumber, cn } from "../lib/utils";
import { COOKING_FUELS, TRANSPORT_MODES } from "../lib/constants";

const DIETS = [
  { value: "vegetarian", label: "Vegetarian" },
  { value: "mixed", label: "Mixed" },
  { value: "high_meat", label: "High meat" },
];

const WASTE = [
  { value: "segregates_waste", label: "I segregate dry and wet waste" },
  { value: "composts", label: "I compost kitchen waste" },
  { value: "avoids_single_use", label: "I avoid single-use plastic" },
];

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

export function Lifestyle() {
  const [draft, setDraft] = useState(null);
  const [draftAnalysis, setDraftAnalysis] = useState(null);
  const [saving, setSaving] = useState(false);
  const profile = useAsyncResource(() => lifestyleApi.get(), [], {
    fallback: "Could not load your lifestyle profile.",
  });

  const saved = profile.data?.profile ?? profile.data?.lifestyle ?? null;
  const savedFlat = saved ? saved.flat ?? saved : null;
  const form = useMemo(
    () => ({
      ...EMPTY_FORM,
      ...(savedFlat ?? {}),
      waste: savedFlat?.waste ?? EMPTY_FORM.waste,
      ...(draft ?? {}),
    }),
    [savedFlat, draft],
  );
  const analysis = draftAnalysis ?? profile.data?.analysis ?? null;

  const set = (key, value) => setDraft((current) => ({ ...(current ?? {}), [key]: value }));

  const toggleWaste = (value) =>
    setDraft((current) => {
      const waste = current?.waste ?? form.waste;
      return {
        ...(current ?? {}),
        waste: waste.includes(value) ? waste.filter((entry) => entry !== value) : [...waste, value],
      };
    });

  const payload = () => ({
    transport: {
      primary_mode: form.primary_mode || null,
      commute_distance_km: form.commute_distance_km === "" ? null : Number(form.commute_distance_km),
      commute_days_per_week: form.commute_days_per_week === "" ? null : Number(form.commute_days_per_week),
      weekly_other_km: form.weekly_other_km === "" ? null : Number(form.weekly_other_km),
      flights_per_year: form.flights_per_year === "" ? null : Number(form.flights_per_year),
    },
    home: {
      electricity_kwh_month: form.electricity_kwh_month === "" ? null : Number(form.electricity_kwh_month),
      cooking_fuel: form.cooking_fuel || null,
      lpg_cylinders_month: form.lpg_cylinders_month === "" ? null : Number(form.lpg_cylinders_month),
      household_size: form.household_size === "" ? null : Number(form.household_size),
    },
    food: { diet: form.diet || null },
    waste: form.waste,
  });

  const hasInput = () =>
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
    if (!hasInput()) {
      toast.error("Enter at least some lifestyle details before analyzing.");
      return;
    }
    setSaving(true);
    try {
      const data = await lifestyleApi.analyze(payload());
      setDraftAnalysis(data.analysis ?? data);
      toast.success("Lifestyle analysis updated.");
    } catch (error) {
      toast.error(apiError(error, "Could not analyze your lifestyle."));
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await lifestyleApi.save(payload());
      toast.success("Lifestyle profile saved.");
    } catch (error) {
      toast.error(apiError(error, "Could not save your profile."));
    } finally {
      setSaving(false);
    }
  };

  const breakdown = analysis?.breakdown ?? [];
  const total = analysis?.total_kg_per_month ?? 0;
  const max = Math.max(...breakdown.map((entry) => entry.kg_per_month), 1);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Module 02"
        title="Lifestyle pollution analyzer"
        description="Estimate where your household emissions come from, then see which changes give the largest reduction for the least disruption."
        actions={
          <Button variant="secondary" size="sm" onClick={save} loading={saving} type="button">
            Save profile
          </Button>
        }
      />

      <form onSubmit={analyze} className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader action={<Badge tone="neutral">Transport</Badge>}>
              <CardTitle as="h2">How you get around</CardTitle>
              <CardDescription>Distance is one-way. Occupancy assumptions are applied for shared modes.</CardDescription>
            </CardHeader>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <LabeledSelect label="Primary mode" value={form.primary_mode} onChange={(event) => set("primary_mode", event.target.value)}>
                <option value="">Select mode</option>
                {TRANSPORT_MODES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </LabeledSelect>
              <Field label="Commute distance (one-way, km)">
                {({ id, ...fieldProps }) => (
                  <Input id={id} type="number" min={0} max={200} step="0.5" value={form.commute_distance_km} onChange={(event) => set("commute_distance_km", event.target.value)} {...fieldProps} />
                )}
              </Field>
              <Field label="Commute days / week">
                {({ id, ...fieldProps }) => (
                  <Input id={id} type="number" min={0} max={7} value={form.commute_days_per_week} onChange={(event) => set("commute_days_per_week", event.target.value)} {...fieldProps} />
                )}
              </Field>
              <Field label="Other travel (km / week)">
                {({ id, ...fieldProps }) => (
                  <Input id={id} type="number" min={0} max={1000} value={form.weekly_other_km} onChange={(event) => set("weekly_other_km", event.target.value)} {...fieldProps} />
                )}
              </Field>
              <Field label="Flights per year">
                {({ id, ...fieldProps }) => (
                  <Input id={id} type="number" min={0} max={60} value={form.flights_per_year} onChange={(event) => set("flights_per_year", event.target.value)} {...fieldProps} />
                )}
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader action={<Badge tone="neutral">Home</Badge>}>
              <CardTitle as="h2">Energy and cooking</CardTitle>
              <CardDescription>Grid electricity uses an Indian grid-average factor in the current factor set.</CardDescription>
            </CardHeader>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Electricity (kWh / month)">
                {({ id, ...fieldProps }) => (
                  <Input id={id} type="number" min={0} max={5000} value={form.electricity_kwh_month} onChange={(event) => set("electricity_kwh_month", event.target.value)} {...fieldProps} />
                )}
              </Field>
              <Field label="People in household">
                {({ id, ...fieldProps }) => (
                  <Input id={id} type="number" min={1} max={20} value={form.household_size} onChange={(event) => set("household_size", event.target.value)} {...fieldProps} />
                )}
              </Field>
              <LabeledSelect label="Cooking fuel" value={form.cooking_fuel} onChange={(event) => set("cooking_fuel", event.target.value)}>
                <option value="">Select fuel</option>
                {COOKING_FUELS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </LabeledSelect>
              <Field label="Cylinders / month" hint="Only applies to LPG.">
                {({ id, ...fieldProps }) => (
                  <Input id={id} type="number" min={0} max={12} step="0.5" value={form.lpg_cylinders_month} onChange={(event) => set("lpg_cylinders_month", event.target.value)} disabled={form.cooking_fuel !== "lpg"} {...fieldProps} />
                )}
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader action={<Badge tone="neutral">Food & waste</Badge>}>
              <CardTitle as="h2">Consumption habits</CardTitle>
              <CardDescription>Select every practice that applies to your household.</CardDescription>
            </CardHeader>
            <div className="mt-4 space-y-3">
              <LabeledSelect label="Diet pattern" value={form.diet} onChange={(event) => set("diet", event.target.value)}>
                <option value="">Select diet</option>
                {DIETS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </LabeledSelect>
              <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Waste practices">
                {WASTE.map((option) => {
                  const active = form.waste.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleWaste(option.value)}
                      aria-pressed={active}
                      className={cn(
                        "rounded-xl border px-3 py-2.5 text-left text-[11.5px] leading-snug transition-colors",
                        active
                          ? "border-aurora-400/45 bg-aurora-400/10 text-aurora-200"
                          : "border-hairline bg-ink-900/50 text-slate-300 hover:border-white/15",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>

          <Button type="submit" loading={saving} className="w-full sm:w-auto">
            <Calculator size={15} aria-hidden="true" />
            Analyze my lifestyle
          </Button>
        </div>

        <div className="space-y-4">
          {profile.error ? (
            <ErrorState message={profile.error} onRetry={profile.reload} retryLabel="Retry profile" />
          ) : profile.loading ? (
            <LoadingBlock label="Loading your profile" />
          ) : analysis ? (
            <>
              <Card>
                <CardHeader action={<Badge tone="aurora">Estimated</Badge>}>
                  <CardTitle as="h2">Monthly footprint</CardTitle>
                  <CardDescription>Attributed to your share of household activity</CardDescription>
                </CardHeader>
                <div className="mt-4 flex items-end gap-2">
                  <span className="font-display text-[38px] font-semibold leading-none text-white tabular-nums">
                    {formatNumber(total)}
                  </span>
                  <span className="pb-1 text-[12px] text-slate-300">kg CO₂e / month</span>
                </div>
                <p className="mt-2 text-[11.5px] text-slate-400">
                  ≈ {formatNumber(total * 12, { maximumFractionDigits: 0 })} kg CO₂e per year · factor set{" "}
                  {analysis.factor_version ?? "unknown"}
                </p>
                <div className="mt-4">
                  <SimpleBarChart
                    data={breakdown.map((entry) => ({ label: entry.label, value: entry.kg_per_month }))}
                    unit="kg"
                    height={168}
                    colors={["#3fe0ac", "#38bdf8", "#f5c542", "#c084fc"]}
                  />
                </div>
                <div className="mt-3 space-y-2.5 border-t border-hairline pt-3">
                  {breakdown.map((entry) => (
                    <div key={entry.key}>
                      <div className="flex items-center justify-between text-[11.5px]">
                        <span className="text-slate-300">{entry.label}</span>
                        <span className="text-slate-100 tabular-nums">{formatNumber(entry.kg_per_month)} kg</span>
                      </div>
                      <Progress
                        value={max ? (entry.kg_per_month / max) * 100 : 0}
                        label={`${entry.label} share`}
                        className="mt-1"
                      />
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <CardHeader action={<Leaf size={15} className="text-aurora-300" aria-hidden="true" />}>
                  <CardTitle as="h2">Areas for improvement</CardTitle>
                  <CardDescription>Ranked by estimated monthly saving</CardDescription>
                </CardHeader>
                <ul className="mt-4 space-y-2.5">
                  {(analysis.opportunities ?? []).map((item) => (
                    <li key={item.title} className="rounded-xl border border-hairline bg-ink-900/50 p-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-[12.5px] font-medium text-slate-100">{item.title}</p>
                        {item.saving_kg !== undefined && item.saving_kg !== null ? (
                          <span className="shrink-0 rounded-full border border-aurora-400/30 bg-aurora-400/10 px-2 py-0.5 text-[10px] font-semibold text-aurora-300">
                            −{formatNumber(item.saving_kg)} kg
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[11.5px] leading-relaxed text-slate-300">{item.detail}</p>
                      {item.difficulty ? (
                        <p className="mt-1.5 text-[10.5px] uppercase tracking-wider text-slate-400">{item.difficulty}</p>
                      ) : null}
                    </li>
                  ))}
                  {!(analysis.opportunities ?? []).length ? (
                    <li className="text-[11.5px] text-slate-400">No opportunities identified for this profile yet.</li>
                  ) : null}
                </ul>
              </Card>

              <DataNote>
                {analysis.assumptions?.[0] ??
                  "Emission factors must be documented and versioned; values are estimates unless stated otherwise."}
              </DataNote>
            </>
          ) : (
            <Card>
              <CardTitle as="h2">No analysis yet</CardTitle>
              <CardDescription>
                Fill in the form and run the analysis. AirAware calculates each category from documented factors — the
                assistant never invents savings.
              </CardDescription>
              <Button type="submit" size="sm" className="mt-4" loading={saving}>
                <Calculator size={14} aria-hidden="true" />
                Analyze now
              </Button>
            </Card>
          )}
        </div>
      </form>
    </div>
  );
}

export default Lifestyle;
