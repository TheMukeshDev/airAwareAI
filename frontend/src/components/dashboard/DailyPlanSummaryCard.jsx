import { Link } from "react-router-dom";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { Button } from "../common/Button";
import { Card, CardDescription, CardHeader, CardTitle } from "../common/Card";
import { Progress } from "../common/Progress";
import { LoadingBlock } from "../common/Spinner";
import { EmptyState } from "../common/EmptyState";
import { ErrorState } from "../common/ErrorState";
import { RecommendationList } from "../dashboard/RecommendationList";
import { apiError } from "../../services/api";
import toast from "react-hot-toast";

export function DailyPlanSummaryCard({ planState, busyId, generating, onToggle, onGenerate }) {
  const plan = planState.data;
  const actions = plan?.actions ?? [];
  const completed = actions.filter((action) => action.completed).length;

  const generate = async () => {
    try {
      const response = await onGenerate();
      planState.setData(response.plan ?? response);
      toast.success("Today's plan is ready.");
    } catch (error) {
      toast.error(apiError(error, "Could not generate a plan right now."));
    }
  };

  return (
    <Card>
      <CardHeader
        action={
          plan ? (
            <Link to="/daily-plan" className="text-[12px] text-slate-400 hover:text-aurora-300">
              View plan <ArrowUpRight size={12} className="inline" aria-hidden="true" />
            </Link>
          ) : null
        }
      >
        <CardTitle as="h2">Today's recommendations</CardTitle>
        <CardDescription>{plan?.summary ?? "Generated from your habits and today's readings. Every action stores why it was suggested."}</CardDescription>
      </CardHeader>
      <div className="mt-4">
        {planState.error ? (
          <ErrorState message={planState.error} onRetry={planState.reload} />
        ) : planState.loading ? (
          <LoadingBlock className="min-h-[160px] border-0 bg-transparent" label="Loading your plan" />
        ) : actions.length ? (
          <>
            <Progress value={(completed / actions.length) * 100} label="Completed today" className="mb-4" />
            <RecommendationList items={actions.slice(0, 4)} onToggle={onToggle} busyId={busyId} />
            {actions.length > 4 ? (
              <Button to="/daily-plan" variant="ghost" size="sm" className="mt-3">
                All {actions.length} actions
              </Button>
            ) : null}
          </>
        ) : (
          <EmptyState
            icon={Sparkles}
            title="No plan for today yet"
            description="AirAware combines your lifestyle profile with the current AQI to build a plan you can finish today."
            action={<Button onClick={generate} loading={generating} size="sm"><Sparkles size={14} aria-hidden="true" />Generate today's plan</Button>}
          />
        )}
      </div>
    </Card>
  );
}

export default DailyPlanSummaryCard;
