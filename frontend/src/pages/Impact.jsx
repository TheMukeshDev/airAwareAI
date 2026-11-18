import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Award, Bike, Leaf, Plus, TrendingDown, History, ArrowLeft, ArrowRight } from "lucide-react";
import { PageHeader } from "../components/common/PageHeader";
import { Button } from "../components/common/Button";
import { Card, CardDescription, CardHeader, CardTitle } from "../components/common/Card";
import { Field, Input, LabeledSelect, Textarea } from "../components/common/Field";
import { Stat } from "../components/common/Stat";
import { Badge } from "../components/common/Badge";
import { DataNote } from "../components/common/DataNote";
import { LoadingBlock } from "../components/common/Spinner";
import { SimpleBarChart } from "../components/charts/Charts";
import { impactApi, apiError } from "../services/api";
import { formatNumber } from "../lib/utils";
import { useAuth } from "../context/AuthContext";
import { TRANSPORT_MODES } from "../lib/constants";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function Impact() {
  const { user } = useAuth();
  const [summary, setSummary] = useState({ data: null, loading: true });
  const [history, setHistory] = useState({ records: [], page: 1, pages: 1, loading: true });
  const [form, setForm] = useState({
    date: today(),
    distance_km: "",
    baseline_mode: user?.lifestyle?.primary_mode ?? "",
    actual_mode: "",
    passengers: "1",
    note: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    impactApi
      .personal({ period: "30d" })
      .then((data) => {
        if (!cancelled) setSummary({ data, loading: false });
      })
      .catch(() => {
        if (!cancelled) setSummary({ data: null, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const loadHistory = useCallback(async (page = 1, signal) => {
    setHistory((current) => ({ ...current, loading: true }));
    try {
      const data = await impactApi.history({ page, per_page: 8 });
      if (!signal?.cancelled) {
        setHistory({
          records: data.records ?? [],
          page: data.page ?? page,
          pages: data.pages ?? 1,
          loading: false,
        });
      }
    } catch {
      if (!signal?.cancelled) setHistory((current) => ({ ...current, loading: false }));
    }
  }, []);

  useEffect(() => {
    const signal = { cancelled: false };
    Promise.resolve().then(() => loadHistory(1, signal));
    return () => {
      signal.cancelled = true;
    };
  }, [loadHistory, refreshKey]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event) => {
    event?.preventDefault();
    const distance = Number(form.distance_km);
    if (!distance || distance <= 0) {
      toast.error("Enter a distance greater than zero.");
      return;
    }
    if (!form.baseline_mode || !form.actual_mode) {
      toast.error("Select both baseline and actual mode.");
      return;
    }
    setSubmitting(true);
    try {
      const data = await impactApi.log({
        date: form.date,
        distance_km: distance,
        baseline_mode: form.baseline_mode,
        actual_mode: form.actual_mode,
        passengers: Number(form.passengers) || 1,
        note: form.note || undefined,
      });
      toast.success(
        data?.record?.avoided_kg > 0
          ? `Logged. ≈${formatNumber(data.record.avoided_kg, { maximumFractionDigits: 2 })} kg CO₂e avoided.`
          : "Activity logged.",
      );
      setSummary((current) => ({ ...current, loading: true }));
      setRefreshKey((key) => key + 1);
      setForm((current) => ({ ...current, note: "", distance_km: "" }));
    } catch (error) {
      toast.error(apiError(error, "Could not log this activity."));
    } finally {
      setSubmitting(false);
    }
  };

  const data = summary.data;
  const totals = data?.totals ?? {};
  const weekly = useMemo(
    () => (data?.weekly ?? []).map((entry) => ({ label: entry.label, value: entry.avoided_kg })),
    [data],
  );
  const achievements = data?.achievements ?? [];
  const factorVersion = data?.factor_version;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Module 05"
        title="My environmental impact"
        description="Estimated emissions from activities you log, compared against a documented baseline. Estimates stay labelled — nothing here is independently verified."
        actions={<Badge tone="neutral">Factor set {factorVersion ?? "unknown"}</Badge>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Avoided · 30 days"
          value={formatNumber(totals.avoided_kg)}
          unit="kg CO₂e"
          icon={TrendingDown}
          tone="good"
          hint="Baseline minus actual, per logged journey"
        />
        <Stat
          label="Emissions logged"
          value={formatNumber(totals.actual_kg)}
          unit="kg CO₂e"
          icon={Leaf}
          tone="aurora"
          hint={`Against ${formatNumber(totals.baseline_kg)} kg baseline`}
        />
        <Stat
          label="Activities"
          value={totals.logged_activities ?? 0}
          icon={History}
          tone="glow"
          hint={`${formatNumber(totals.distance_km)} km logged`}
        />
        <Stat
          label="Reduction"
          value={totals.reduction_pct !== undefined && totals.reduction_pct !== null ? `${formatNumber(totals.reduction_pct, { maximumFractionDigits: 0 })}%` : "—"}
          icon={Bike}
          tone="moderate"
          hint="Share of baseline emissions avoided"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <Card>
          <CardHeader action={<Badge tone="neutral">Last 8 weeks</Badge>}>
            <CardTitle as="h2">Weekly avoided emissions</CardTitle>
            <CardDescription>Each bar aggregates logged journeys for that week</CardDescription>
          </CardHeader>
          <div className="mt-4">
            {summary.loading ? (
              <div className="h-[220px]" />
            ) : weekly.length ? (
              <SimpleBarChart data={weekly} unit="kg" height={220} color="#3fe0ac" />
            ) : (
              <div className="flex h-[220px] flex-col items-center justify-center gap-2 text-center">
                <p className="text-[12.5px] text-slate-300">No logged activity yet.</p>
                <p className="max-w-xs text-[11.5px] text-slate-400">
                  Log a journey comparing your usual mode with an alternative to see estimated avoided emissions.
                </p>
              </div>
            )}
          </div>
          <div className="mt-4 border-t border-hairline pt-4">
            <p className="mb-2 text-[10.5px] uppercase tracking-[0.14em] text-slate-400">Achievements</p>
            <div className="flex flex-wrap gap-2">
              {achievements.length ? (
                achievements.map((item) => (
                  <span
                    key={item.key}
                    className="inline-flex items-center gap-1.5 rounded-full border border-aurora-400/30 bg-aurora-400/10 px-2.5 py-1 text-[11px] text-aurora-300"
                  >
                    <Award size={11} aria-hidden="true" />
                    {item.label}
                  </span>
                ))
              ) : (
                <span className="text-[11.5px] text-slate-400">Log activities to unlock achievements.</span>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader action={<Badge tone="aurora">New entry</Badge>}>
            <CardTitle as="h2">Log a journey</CardTitle>
            <CardDescription>Compare what you did with what you would normally have done.</CardDescription>
          </CardHeader>
          <form onSubmit={submit} className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Date" required>
                {({ id, ...fieldProps }) => (
                  <Input id={id} type="date" value={form.date} max={today()} onChange={(event) => set("date", event.target.value)} {...fieldProps} />
                )}
              </Field>
              <Field label="Distance (km)" required>
                {({ id, ...fieldProps }) => (
                  <Input id={id} type="number" min={0.1} step="0.1" value={form.distance_km} onChange={(event) => set("distance_km", event.target.value)} {...fieldProps} />
                )}
              </Field>
              <LabeledSelect label="Baseline mode" value={form.baseline_mode} onChange={(event) => set("baseline_mode", event.target.value)} hint="What you would have done" required>
                <option value="">Select baseline mode</option>
                {TRANSPORT_MODES.map((mode) => (
                  <option key={mode.value} value={mode.value}>{mode.label}</option>
                ))}
              </LabeledSelect>
              <LabeledSelect label="Actual mode" value={form.actual_mode} onChange={(event) => set("actual_mode", event.target.value)} hint="What you did" required>
                <option value="">Select actual mode</option>
                {TRANSPORT_MODES.map((mode) => (
                  <option key={mode.value} value={mode.value}>{mode.label}</option>
                ))}
              </LabeledSelect>
            </div>
            <Field label="Passengers" hint="Shared journeys split emissions per person.">
              {({ id, ...fieldProps }) => (
                <Input id={id} type="number" min={1} max={8} value={form.passengers} onChange={(event) => set("passengers", event.target.value)} {...fieldProps} />
              )}
            </Field>
            <Field label="Note (optional)">
              {({ id, ...fieldProps }) => (
                <Textarea id={id} rows={2} placeholder="Office commute, replaced bike with metro" value={form.note} onChange={(event) => set("note", event.target.value)} {...fieldProps} />
              )}
            </Field>
            <Button type="submit" loading={submitting} className="w-full">
              <Plus size={15} aria-hidden="true" />
              Log activity
            </Button>
          </form>
        </Card>
      </div>

      <Card>
        <CardHeader action={<Badge tone="neutral">{history.page}/{history.pages}</Badge>}>
          <CardTitle as="h2">Activity history</CardTitle>
          <CardDescription>Most recent first. Pagination keeps long histories fast.</CardDescription>
        </CardHeader>
        <div className="mt-3 overflow-x-auto">
          {history.loading ? (
            <LoadingBlock className="border-0 bg-transparent" label="Loading history" />
          ) : history.records.length ? (
            <table className="w-full min-w-[560px] text-left text-[12px]">
              <caption className="sr-only">Logged journey history with baseline, actual emissions, and avoided emissions</caption>
              <thead>
                <tr className="text-[10.5px] uppercase tracking-[0.12em] text-slate-400">
                  <th scope="col" className="pb-2 font-medium">Date</th>
                  <th scope="col" className="pb-2 font-medium">Journey</th>
                  <th scope="col" className="pb-2 font-medium">Distance</th>
                  <th scope="col" className="pb-2 font-medium">Baseline</th>
                  <th scope="col" className="pb-2 font-medium">Actual</th>
                  <th scope="col" className="pb-2 text-right font-medium">Avoided</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {history.records.map((record) => (
                  <tr key={record.id}>
                    <td className="py-2.5 text-slate-300">{record.date}</td>
                    <td className="py-2.5 text-slate-200">
                      {labelFor(record.baseline_mode)} → <span className="text-aurora-300">{labelFor(record.actual_mode)}</span>
                    </td>
                    <td className="py-2.5 tabular-nums text-slate-300">{formatNumber(record.distance_km)} km</td>
                    <td className="py-2.5 tabular-nums text-slate-400">{formatNumber(record.baseline_kg, { maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 tabular-nums text-slate-400">{formatNumber(record.actual_kg, { maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 text-right font-medium tabular-nums text-aurora-300">
                      {record.avoided_kg > 0 ? "+" : ""}
                      {formatNumber(record.avoided_kg, { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="py-6 text-center text-[12px] text-slate-400">No activities logged yet.</p>
          )}
        </div>
        {history.pages > 1 ? (
          <div className="mt-3 flex items-center justify-end gap-2 border-t border-hairline pt-3">
            <Button variant="ghost" size="sm" disabled={history.page <= 1} onClick={() => loadHistory(history.page - 1)}>
              <ArrowLeft size={13} aria-hidden="true" />
              Previous
            </Button>
            <Button variant="ghost" size="sm" disabled={history.page >= history.pages} onClick={() => loadHistory(history.page + 1)}>
              Next
              <ArrowRight size={13} aria-hidden="true" />
            </Button>
          </div>
        ) : null}
      </Card>

      <DataNote>
        Calculations use factor set {factorVersion ?? "unknown"}: distance × emission factor, split by passengers, with the baseline
        and alternative measured over the same journey. Values are estimates, not verified measurements, and avoided
        emissions are not reductions in ambient city pollution.
      </DataNote>
    </div>
  );
}

function labelFor(value) {
  return TRANSPORT_MODES.find((mode) => mode.value === value)?.label ?? value ?? "Unknown";
}

export default Impact;
