import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { PageHeader } from "../components/common/PageHeader";
import { Button } from "../components/common/Button";
import { Segmented } from "../components/common/Toggle";
import { DataNote } from "../components/common/DataNote";
import { LiveAnnouncer } from "../components/common/LiveAnnouncer";
import { useAsyncResource } from "../hooks/useAsyncResource";
import { AqiCard } from "../components/dashboard/AqiCard";
import { WeatherStrip } from "../components/dashboard/WeatherStrip";
import { DashboardStats } from "../components/dashboard/DashboardStats";
import { DailyPlanSummaryCard } from "../components/dashboard/DailyPlanSummaryCard";
import { NearbyGridCard } from "../components/dashboard/NearbyGridCard";
import { PollutionTrendCard } from "../components/dashboard/PollutionTrendCard";
import { VentilationWindowCard } from "../components/dashboard/VentilationWindowCard";
import { useAirQuality, useForecast, useUserCoords } from "../hooks/useAirQuality";
import { useAuth } from "../context/AuthContext";
import { impactApi, planApi, apiError } from "../services/api";
import { classifyAqi } from "../lib/aqi";

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

const SCALES = [
  { value: "us", label: "US AQI" },
  { value: "india", label: "India AQI" },
];

export default function Dashboard() {
  const { user } = useAuth();
  const coords = useUserCoords(user);
  const [scale, setScale] = useState(user?.preferences?.aqi_scale ?? "us");
  const { data: reading, loading, error, refresh } = useAirQuality(coords);
  const { data: forecast } = useForecast(coords, 24);
  const planState = useAsyncResource(async () => {
    const response = await planApi.today();
    return response.plan ?? response;
  }, [], { fallback: "Could not load today's plan." });
  const impactState = useAsyncResource(() => impactApi.personal({ period: "30d" }), [], {
    fallback: "Could not load your impact summary.",
  });
  const [generating, setGenerating] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [date] = useState(() =>
    new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }),
  );

  const announcement = loading
    ? "Loading air quality reading."
    : error
      ? `Air quality unavailable: ${error}`
      : reading
        ? "Air quality reading updated."
        : "";

  const value = scale === "india" ? reading?.aqi_india : reading?.aqi;
  const missing = value === null || value === undefined;
  const displayReading = reading ? { ...reading, aqi: missing ? null : value, scale } : null;
  const category = classifyAqi(value, scale);
  const series = useMemo(
    () =>
      (forecast?.hourly ?? []).slice(0, 24).map((hour) => ({
        label: new Date(hour.time).toLocaleTimeString("en-GB", { hour: "2-digit" }),
        value: scale === "india" ? hour.india_aqi : hour.us_aqi,
      })),
    [forecast, scale],
  );
  const actions = planState.data?.actions ?? [];
  const cached = Boolean(reading?.stale || reading?.cache?.hit);

  const toggleAction = async (action) => {
    if (!planState.data?.id) return;
    setBusyId(action.id);
    try {
      const response = await planApi.complete(planState.data.id, action.id, !action.completed);
      planState.setData(response.plan ?? response);
    } catch (failure) {
      toast.error(apiError(failure, "Could not update that action."));
    } finally {
      setBusyId(null);
    }
  };

  const generatePlan = async () => {
    setGenerating(true);
    try {
      return await planApi.generate({});
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-5">
      <LiveAnnouncer message={announcement} />
      <PageHeader
        eyebrow={date}
        title={`${greeting()}, ${user?.name?.split(" ")[0] ?? "there"}`}
        description={`Today's air in ${reading?.location?.name ?? user?.location?.city ?? "your city"} and what to do about it.`}
        actions={
          <>
            <Segmented value={scale} onChange={setScale} ariaLabel="AQI scale" options={SCALES} size="sm" />
            <Button variant="secondary" size="sm" to="/assistant">
              <Sparkles size={14} aria-hidden="true" />
              Ask AirAware
            </Button>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1.05fr_1.95fr]">
        <AqiCard reading={displayReading} loading={loading} error={error} onRefresh={refresh} />
        <div className="space-y-4">
          <WeatherStrip weather={reading?.weather} />
          <DashboardStats reading={reading} actions={actions} impactState={impactState} />
          <PollutionTrendCard
            reading={reading}
            forecast={forecast}
            series={series}
            missing={missing}
            categoryColor={category.style.hex}
            scale={scale}
            onRefresh={refresh}
          />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <DailyPlanSummaryCard
          planState={planState}
          busyId={busyId}
          generating={generating}
          onToggle={toggleAction}
          onGenerate={generatePlan}
        />
        <div className="space-y-4">
          <NearbyGridCard reading={reading} cached={cached} />
          <VentilationWindowCard reading={reading} />
        </div>
      </div>
      <DataNote>
        AirAware reports concentrations and AQI separately, labels the AQI scale, and never fills a missing reading with
        an estimate. Personal and community impact figures are modelled, not measured.
      </DataNote>
    </div>
  );
}
