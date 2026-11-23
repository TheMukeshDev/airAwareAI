import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowUpRight,
  CalendarCheck,
  Clock3,
  Leaf,
  RefreshCw,
  Sparkles,
  TrendingDown,
  Wind,
} from "lucide-react";
import { PageHeader } from "../components/common/PageHeader";
import { Button } from "../components/common/Button";
import { Card, CardDescription, CardHeader, CardTitle } from "../components/common/Card";
import { Stat } from "../components/common/Stat";
import { Badge } from "../components/common/Badge";
import { Progress } from "../components/common/Progress";
import { Segmented } from "../components/common/Toggle";
import { DataNote } from "../components/common/DataNote";
import { LoadingBlock } from "../components/common/Spinner";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";
import { LiveAnnouncer } from "../components/common/LiveAnnouncer";
import { useAsyncResource } from "../hooks/useAsyncResource";
import { AqiCard } from "../components/dashboard/AqiCard";
import { WeatherStrip } from "../components/dashboard/WeatherStrip";
import { PollutantGrid } from "../components/dashboard/PollutantGrid";
import { RecommendationList } from "../components/dashboard/RecommendationList";
import { TrendChart } from "../components/charts/Charts";
import { useAirQuality, useForecast, useUserCoords } from "../hooks/useAirQuality";
import { useAuth } from "../context/AuthContext";
import { impactApi, planApi, apiError } from "../services/api";
import { classifyAqi, aqiScaleLabel } from "../lib/aqi";
import { formatNumber, relativeTime } from "../lib/utils";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function Dashboard() {
  const { user } = useAuth();
  const coords = useUserCoords(user);
  const [scale, setScale] = useState(user?.preferences?.aqi_scale || "us");
  const { data: reading, loading, error, refresh } = useAirQuality(coords);
  const { data: forecast } = useForecast(coords, 24);
  const plan = useAsyncResource(async () => {
    const data = await planApi.today();
    return data.plan ?? data;
  }, [], { fallback: "Could not load today's plan." });
  const impact = useAsyncResource(() => impactApi.personal({ period: "30d" }), [], {
    fallback: "Could not load your impact summary.",
  });
  const [generating, setGenerating] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [todayLabel] = useState(() =>
    new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }),
  );

  const announcement = loading
    ? "Loading air quality reading."
    : error
      ? `Air quality unavailable: ${error}`
      : reading
        ? "Air quality reading updated."
        : "";


  const generatePlan = async () => {
    setGenerating(true);
    try {
      const data = await planApi.generate({});
      plan.setData(data.plan ?? data);
      toast.success("Today's plan is ready.");
    } catch (err) {
      toast.error(apiError(err, "Could not generate a plan right now."));
    } finally {
      setGenerating(false);
    }
  };

  const toggleAction = async (action) => {
    if (!plan.data?.id) return;
    setBusyId(action.id);
    try {
      const data = await planApi.complete(plan.data.id, action.id, !action.completed);
      plan.setData(data.plan ?? data);
    } catch (err) {
      toast.error(apiError(err, "Could not update that action."));
    } finally {
      setBusyId(null);
    }
  };

  const displayAqi = scale === "india" ? reading?.aqi_india : reading?.aqi;
  const scaleUnavailable = displayAqi === null || displayAqi === undefined;
  const readingForScale = reading
    ? { ...reading, aqi: scaleUnavailable ? null : displayAqi, scale }
    : null;
  const category = classifyAqi(displayAqi, scale);

  const trend = useMemo(() => {
    const hourly = forecast?.hourly ?? [];
    return hourly.slice(0, 24).map((entry) => ({
      label: new Date(entry.time).toLocaleTimeString("en-GB", { hour: "2-digit" }),
      value: scale === "india" ? entry.india_aqi : entry.us_aqi,
    }));
  }, [forecast, scale]);

  const actions = plan.data?.actions ?? [];
  const completed = actions.filter((action) => action.completed).length;
  const avoided = impact.data?.totals?.avoided_kg ?? 0;
  const cached = Boolean(reading?.stale || reading?.cache?.hit);

  return (
    <div className="space-y-5">
      <LiveAnnouncer message={announcement} />
      <PageHeader
        eyebrow={todayLabel}
        title={`${greeting()}, ${user?.name?.split(" ")[0] || "there"}`}
        description={`Today's air in ${reading?.location?.name || user?.location?.city || "your city"} and what to do about it.`}
        actions={
          <>
            <Segmented
              value={scale}
              onChange={setScale}
              ariaLabel="AQI scale"
              options={[
                { value: "us", label: "US AQI" },
                { value: "india", label: "India AQI" },
              ]}
              size="sm"
            />
            <Button variant="secondary" size="sm" to="/assistant">
              <Sparkles size={14} aria-hidden="true" />
              Ask AirAware
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.05fr_1.95fr]">
        <AqiCard reading={readingForScale} loading={loading} error={error} onRefresh={refresh} />

        <div className="space-y-4">
          <WeatherStrip weather={reading?.weather} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label="Plan progress"
              value={`${completed}/${actions.length || 0}`}
              icon={CalendarCheck}
              tone="aurora"
              hint={actions.length ? "Actions completed today" : "No plan generated yet"}
            />
            <Stat
              label="Avoided · 30 days"
              value={formatNumber(avoided)}
              unit="kg CO₂e"
              icon={Leaf}
              tone="good"
              hint={impact.data?.totals?.logged_activities ? `${impact.data.totals.logged_activities} logged activities` : "Log a trip to start"}
            />
            <Stat
              label="Exposure today"
              value={reading?.exposure?.level ?? "—"}
              icon={Wind}
              tone={reading?.exposure?.level === "high" ? "verypoor" : "glow"}
              hint={reading?.exposure?.message ?? "Based on readings and time outdoors"}
            />
          </div>

          {impact.error ? (
            <ErrorState message={impact.error} onRetry={impact.reload} compact retryLabel="Retry impact" />
          ) : null}

          <Card className="p-4 sm:p-5">
            <CardHeader
              action={
                <Badge tone="neutral" dot>
                  24h forecast
                </Badge>
              }
            >
              <CardTitle as="h2">Pollution trend</CardTitle>
              <CardDescription>
                {aqiScaleLabel(scale)} · {forecast?.source ?? "Open-Meteo (CAMS)"}
              </CardDescription>
            </CardHeader>
            <div className="mt-3">
              {scaleUnavailable && reading ? (
                <div className="flex h-[168px] items-center justify-center text-[12px] text-slate-400">
                  {aqiScaleLabel(scale)} unavailable for this reading.
                </div>
              ) : trend.some((d) => d.value !== null && d.value !== undefined) ? (
                <TrendChart
                  data={trend}
                  color={category.style.hex}
                  height={168}
                  ariaLabel={`24 hour ${aqiScaleLabel(scale)} trend`}
                  unit="AQI"
                />
              ) : (
                <div className="flex h-[168px] items-center justify-center text-[12px] text-slate-400">
                  Forecast unavailable for this location.
                </div>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3 text-[10.5px] text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <Clock3 size={11} aria-hidden="true" />
                {reading?.observed_at ? `Reading observed ${relativeTime(reading.observed_at)}` : "No reading timestamp"}
              </span>
              <button
                type="button"
                onClick={refresh}
                className="inline-flex items-center gap-1 text-slate-400 hover:text-aurora-300"
              >
                <RefreshCw size={11} aria-hidden="true" />
                Refresh
              </button>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <Card>
          <CardHeader
            action={
              plan.data ? (
                <Link to="/daily-plan" className="text-[12px] text-slate-400 hover:text-aurora-300">
                  View plan <ArrowUpRight size={12} className="inline" aria-hidden="true" />
                </Link>
              ) : null
            }
          >
            <CardTitle as="h2">Today&apos;s recommendations</CardTitle>
            <CardDescription>
              {plan.data?.summary ||
                "Generated from your habits and today's readings. Every action stores why it was suggested."}
            </CardDescription>
          </CardHeader>

          <div className="mt-4">
            {plan.error ? (
              <ErrorState message={plan.error} onRetry={plan.reload} />
            ) : plan.loading ? (
              <LoadingBlock className="min-h-[160px] border-0 bg-transparent" label="Loading your plan" />
            ) : actions.length ? (
              <>
                <Progress
                  value={(completed / actions.length) * 100}
                  label="Completed today"
                  className="mb-4"
                />
                <RecommendationList items={actions.slice(0, 4)} onToggle={toggleAction} busyId={busyId} />
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
                action={
                  <Button onClick={generatePlan} loading={generating} size="sm">
                    <Sparkles size={14} aria-hidden="true" />
                    Generate today&apos;s plan
                  </Button>
                }
              />
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader
              action={
                <Badge tone={cached ? "moderate" : "neutral"}>
                  {cached ? "Cached" : reading?.source ? "Fresh model data" : "Unavailable"}
                </Badge>

              }
            >
              <CardTitle as="h2">Pollutants</CardTitle>
              <CardDescription>Concentrations in µg/m³ · not the same as AQI</CardDescription>
            </CardHeader>
            <div className="mt-4">
              <PollutantGrid pollutants={reading?.pollutants} units={reading?.units} />
            </div>
          </Card>

          <Card className="bg-gradient-to-br from-aurora-500/10 via-transparent to-glow-500/8">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle as="h2">Indoor air today</CardTitle>
                <CardDescription>Ventilation window vs. outdoor reading</CardDescription>
              </div>
              <TrendingDown size={16} className="text-aurora-300" aria-hidden="true" />
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-slate-300">
              {reading?.indoor_hint ??
                "Open windows when outdoor PM2.5 is lowest — usually early morning — and cook with ventilation running."}
            </p>
            <Button to="/indoor-air" variant="outline" size="sm" className="mt-4">
              Open indoor coach
            </Button>
          </Card>
        </div>
      </div>

      <DataNote>
        AirAware reports concentrations and AQI separately, labels the AQI scale, and never fills a missing reading with
        an estimate. Personal and community impact figures are modelled, not measured.
      </DataNote>
    </div>
  );
}

export default Dashboard;
