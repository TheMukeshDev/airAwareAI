import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { CalendarCheck, CheckCircle2, Clock3, Sparkles, Wand2, Wind } from "lucide-react";
import { PageHeader } from "../components/common/PageHeader";
import { Button } from "../components/common/Button";
import { LoadingBlock } from "../components/common/Spinner";
import { EmptyState } from "../components/common/EmptyState";
import { planApi, apiError } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { PlanSummaryCard } from "../components/daily-plan/PlanSummaryCard";
import { PlanContextCard } from "../components/daily-plan/PlanContextCard";
import { PlanSlotCard } from "../components/daily-plan/PlanSlotCard";
import { PlanEmptyState, ActivityNote } from "../components/daily-plan/PlanEmptyState";

const SLOT_META = [
  { key: "morning", label: "Morning", icon: Clock3 },
  { key: "afternoon", label: "Afternoon", icon: Wind },
  { key: "evening", label: "Evening", icon: CalendarCheck },
  { key: "anytime", label: "Anytime", icon: CheckCircle2 },
];

function getActions(plan) {
  return Array.isArray(plan?.actions) ? plan.actions.filter((item) => item && typeof item === "object") : [];
}

export default function DailyPlan() {
  const { user } = useAuth();
  const [state, setState] = useState({ plan: null, loading: true, generating: false });
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let active = true;
    planApi.today()
      .then((response) => {
        if (active) setState({ plan: response.plan ?? response ?? null, loading: false, generating: false });
      })
      .catch(() => {
        if (active) setState({ plan: null, loading: false, generating: false });
      });
    return () => {
      active = false;
    };
  }, []);

  const generate = async (regenerate = false) => {
    setState((previous) => ({ ...previous, generating: true }));
    try {
      const response = await planApi.generate({ regenerate });
      setState({ plan: response.plan ?? response, loading: false, generating: false });
      toast.success(regenerate ? "Plan regenerated with fresh readings." : "Today's plan is ready.");
    } catch (error) {
      toast.error(apiError(error, "Could not generate a plan."));
      setState((previous) => ({ ...previous, generating: false }));
    }
  };

  const toggle = async (action) => {
    const plan = state.plan;
    if (!plan?.id) return;
    setBusyId(action.id);
    try {
      const response = await planApi.complete(plan.id, action.id, !action.completed);
      setState((previous) => ({ ...previous, plan: response.plan ?? response }));
    } catch (error) {
      toast.error(apiError(error, "Could not update the action."));
    } finally {
      setBusyId(null);
    }
  };

  const plan = state.plan;
  const actions = getActions(plan);
  const completed = actions.filter((action) => action.completed).length;
  const saving = actions.filter((action) => action.completed).reduce((sum, action) => sum + (Number(action.co2_saved_kg) || 0), 0);
  const slots = SLOT_META.map((slot) => ({ ...slot, items: actions.filter((action) => (action.slot ?? "anytime") === slot.key) })).filter((slot) => slot.items.length);

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
            <PlanSummaryCard plan={plan} actions={actions} completed={completed} saving={saving} />
            <PlanContextCard context={plan.context} user={user} />
          </div>
          {slots.length ? (
            slots.map((slot) => <PlanSlotCard key={slot.key} slot={slot} busyId={busyId} onToggle={toggle} />)
          ) : (
            <EmptyState icon={Sparkles} title="No actions in this plan" description="Regenerate to build a fresh set of actions." />
          )}
          <ActivityNote />
        </>
      ) : (
        <PlanEmptyState generating={state.generating} onGenerate={generate} />
      )}
    </div>
  );
}
