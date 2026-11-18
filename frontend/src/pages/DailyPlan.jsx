import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  Sparkles,
  Wand2,
  Wind,
} from "lucide-react";
import { PageHeader } from "../components/common/PageHeader";
import { Button } from "../components/common/Button";
import { Card, CardDescription, CardHeader, CardTitle } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { Progress } from "../components/common/Progress";
import { DataNote } from "../components/common/DataNote";
import { EmptyState } from "../components/common/EmptyState";
import { LoadingBlock } from "../components/common/Spinner";
import { RecommendationList } from "../components/dashboard/RecommendationList";
import { useAuth } from "../context/AuthContext";
import { planApi, apiError } from "../services/api";
import { classifyAqi } from "../lib/aqi";
import { formatNumber } from "../lib/utils";

function groupByWindow(actions) {
  const groups = [
    { key: "morning", label: "Morning", icon: Clock3 },
    { key: "afternoon", label: "Afternoon", icon: Wind },
    { key: "evening", label: "Evening", icon: CalendarCheck },
    { key: "anytime", label: "Anytime", icon: CheckCircle2 },
  ];
  return groups
    .map((group) => ({ ...group, items: actions.filter((action) => (action.slot ?? "anytime") === group.key) }))
    .filter((group) => group.items.length);
}

export function DailyPlan() {
  const { user } = useAuth();
  const [state, setState] = useState({ plan: null, loading: true, generating: false });
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    planApi
      .today()
      .then((data) => {
        if (!cancelled) setState({ plan: data.plan ?? data ?? null, loading: false, generating: false });
      })
      .catch(() => {
        if (!cancelled) setState({ plan: null, loading: false, generating: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const generate = async (regenerate = false) => {
    setState((current) => ({ ...current, generating: true }));
    try {
      const data = await planApi.generate({ regenerate });
      setState({ plan: data.plan ?? data, loading: false, generating: false });
      toast.success(regenerate ? "Plan regenerated with fresh readings." : "Today's plan is ready.");
    } catch (error) {
      toast.error(apiError(error, "Could not generate a plan."));
      setState((current) => ({ ...current, generating: false }));
    }
  };

  const toggle = async (action) => {
    const plan = state.plan;
    if (!plan?.id) return;
    setBusyId(action.id);
    try {
      const data = await planApi.complete(plan.id, action.id, !action.completed);
      setState((current) => ({ ...current, plan: data.plan ?? data }));
    } catch (error) {
      toast.error(apiError(error, "Could not update the action."));
    } finally {
      setBusyId(null);
    }
  };

  const plan = state.plan;
  const actions = plan?.actions ?? [];
  const done = actions.filter((action) => action.completed).length;
  const context = plan?.context;
  const category = context?.scale ? classifyAqi(context?.aqi, context.scale) : null;
  const groups = groupByWindow(actions);
  const saved = actions.filter((a) => a.completed).reduce((sum, a) => sum + (Number(a.co2_saved_kg) || 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Module 03"
        title="Daily action planner"
        description="A pollution-aware routine for today. Gemini sequences and explains; the numbers come from your readings and factor set."
        actions={
          <Button onClick={() => generate(Boolean(plan))} loading={state.generating} size="sm" variant={plan ? "secondary" : "primary"}>
            <Wand2 size={14} aria-hidden="true" />
            {plan ? "Regenerate" : "Generate plan"}
          </Button>
        }
      />

      {state.loading ? (
        <LoadingBlock label="Loading today's plan" />
      ) : plan ? (
        <>
          <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <Card>
              <CardHeader
                action={
                  <Badge tone={done === actions.length && actions.length ? "aurora" : "neutral"}>
                    {done}/{actions.length} done
                  </Badge>
                }
              >
                <CardTitle as="h2">{plan.title || "Today's focus"}</CardTitle>
                <CardDescription>{plan.summary || "Personalised from your profile and today's readings."}</CardDescription>
              </CardHeader>
              <div className="mt-4">
                <Progress value={actions.length ? (done / actions.length) * 100 : 0} label="Today's completion" />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2.5">
                <div className="rounded-xl border border-hairline bg-ink-900/60 p-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Estimated saving</p>
                  <p className="mt-1 font-display text-[17px] font-semibold text-aurora-300 tabular-nums">
                    {formatNumber(saved)} <span className="text-[10px] font-normal text-slate-400">kg CO₂e</span>
                  </p>
                </div>
                <div className="rounded-xl border border-hairline bg-ink-900/60 p-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Generated by</p>
                  <p className="mt-1 text-[12.5px] font-medium text-slate-200">{plan.generated_by || "Not specified"}</p>
                </div>
                <div className="rounded-xl border border-hairline bg-ink-900/60 p-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">For</p>
                  <p className="mt-1 text-[12.5px] font-medium text-slate-200">{plan.date || "Not specified"}</p>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader
                action={
                  category ? <Badge tone={category.tone} dot>{category.label}</Badge> : <Badge tone="neutral">AQI unavailable</Badge>
                }
              >
                <CardTitle as="h2">Plan context</CardTitle>
                <CardDescription>What the planner used, at generation time</CardDescription>
              </CardHeader>
              <div className="mt-4 space-y-2 text-[11.5px]">
                {[
                  ["Location", context?.location ?? user?.location?.city ?? "—"],
                  ["AQI used", context?.aqi !== undefined && context?.aqi !== null && context?.scale ? `${Math.round(context.aqi)} (${context.scale === "india" ? "India" : "US"})` : "—"],
                  ["PM2.5", context?.pm2_5 !== undefined && context?.pm2_5 !== null ? `${formatNumber(context.pm2_5)} µg/m³` : "—"],
                  ["Outside window", context?.outdoor_window || "No safe low-pollution window identified"],
                  ["Readings source", context?.source || "—"],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-3 border-b border-hairline pb-2 last:border-0">
                    <span className="shrink-0 text-slate-400">{label}</span>
                    <span className="text-right text-slate-200">{value}</span>
                  </div>
                ))}
              </div>
              {context?.alert ? (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-verypoor/25 bg-verypoor/[0.06] p-3 text-[11.5px] leading-relaxed text-verypoor/90" role="alert">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                  {context.alert}
                </div>
              ) : null}
            </Card>
          </div>

          {groups.length ? (
            groups.map((group) => {
              const Icon = group.icon;
              return (
                <Card key={group.key}>
                  <CardHeader action={<Badge tone="neutral">{group.items.length} actions</Badge>}>
                    <CardTitle as="h2" className="flex items-center gap-2">
                      <Icon size={14} className="text-aurora-400" aria-hidden="true" />
                      {group.label}
                    </CardTitle>
                  </CardHeader>
                  <div className="mt-4">
                    <RecommendationList items={group.items} onToggle={toggle} busyId={busyId} />
                  </div>
                </Card>
              );
            })
          ) : (
            <EmptyState icon={Sparkles} title="No actions in this plan" description="Regenerate to build a fresh set of actions." />
          )}

          <DataNote tone="info">
            Completed actions update your estimated avoided emissions. They do not change the city&apos;s measured AQI, and
            AirAware never claims that they do.
          </DataNote>
        </>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <EmptyState
            icon={Sparkles}
            title="No plan for today yet"
            description="The planner combines today's air quality, your commute and your household profile into a short list you can finish before bed."
            action={
              <Button onClick={() => generate(false)} loading={state.generating}>
                <Wand2 size={15} aria-hidden="true" />
                Generate today's plan
              </Button>
            }
            className="min-h-[320px]"
          />
          <Card>
            <CardTitle as="h2">How plans are built</CardTitle>
            <CardDescription>Computed safeguards, model wording.</CardDescription>
            <ol className="mt-4 space-y-3 text-[12px] leading-relaxed text-slate-300">
              {[
                "AirAware computes candidate actions from your profile and today's readings.",
                "It selects actions with known emission or exposure benefits.",
                "A model rewrites them for your routine, explains each one, and returns structured data.",
                "Every response is validated before it appears here.",
                "Completed actions are logged for impact tracking.",
              ].map((step, index) => (
                <li key={step} className="flex gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/12 text-[10px] font-semibold text-slate-300" aria-hidden="true">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      )}
    </div>
  );
}

export default DailyPlan;
