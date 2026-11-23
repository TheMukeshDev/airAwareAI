import { useState } from "react";
import { Info, RefreshCw } from "lucide-react";
import { PageHeader } from "../components/common/PageHeader";
import { Button } from "../components/common/Button";
import { Segmented } from "../components/common/Toggle";
import { LiveAnnouncer } from "../components/common/LiveAnnouncer";
import { useAuth } from "../context/AuthContext";
import { useAirQuality, useForecast, useUserCoords } from "../hooks/useAirQuality";
import { useNearbyStations } from "../hooks/useNearbyStations";
import { aqiScaleLabel, classifyAqi } from "../lib/aqi";
import { MapCard } from "../components/air-quality/MapCard";
import { PollutantBreakdownCard } from "../components/air-quality/PollutantBreakdownCard";
import { StationList } from "../components/air-quality/StationList";
import { ForecastChart } from "../components/air-quality/ForecastChart";
import { DailyOutlookCard } from "../components/air-quality/DailyOutlookCard";
import { DataProvenance } from "../components/air-quality/DataProvenance";

const SCALES = [
  { value: "us", label: "US AQI" },
  { value: "india", label: "India AQI" },
];

export default function AirQuality() {
  const { user } = useAuth();
  const coords = useUserCoords(user);
  const [scale, setScale] = useState(user?.preferences?.aqi_scale ?? "us");
  const { data: reading, loading, error, refresh } = useAirQuality(coords);
  const { data: forecast, loading: forecastLoading } = useForecast(coords, 48);
  const { stations, active, setActive, loading: stationsLoading, error: stationsError } = useNearbyStations(coords);
  const [metric, setMetric] = useState("aqi");

  const announcement = loading
    ? "Loading air quality data."
    : error
      ? `Air quality unavailable: ${error}`
      : stationsError
        ? stationsError
        : reading
          ? "Air quality data updated."
          : "";
  const value = scale === "india" ? reading?.aqi_india : reading?.aqi;
  const category = classifyAqi(value, scale);

  return (
    <div className="space-y-5">
      <LiveAnnouncer message={announcement} />
      <PageHeader
        eyebrow="Module 01"
        title="Air quality explorer"
        description={`Readings for ${reading?.location?.name || user?.location?.city || "your location"} with the reporting scale, source and observation time always visible.`}
        actions={
          <>
            <Segmented value={scale} onChange={setScale} ariaLabel="AQI scale" options={SCALES} size="sm" />
            <Button variant="secondary" size="sm" onClick={() => refresh()} aria-label="Refresh air quality data">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} aria-hidden="true" />
              Refresh
            </Button>
          </>
        }
      />
      {error ? (
        <div role="alert" className="rounded-xl border border-verypoor/25 bg-verypoor/[0.06] p-3 text-[12.5px] text-verypoor/90">
          {error}
        </div>
      ) : null}
      {stationsError ? (
        <div role="alert" className="rounded-xl border border-moderate/25 bg-moderate/[0.06] p-3 text-[12.5px] text-moderate/90">
          {stationsError}
        </div>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <MapCard
          coords={coords}
          stations={stations}
          activeId={active?.id}
          onSelect={setActive}
          scale={scale}
          reading={reading}
          stationLoading={stationsLoading}
        />
        <div className="space-y-3">
          <PollutantBreakdownCard reading={reading} scale={scale} stationLoading={stationsLoading} />
          <StationList stations={stations} activeId={active?.id} onSelect={setActive} scale={scale} loading={stationsLoading} />
        </div>
      </div>
      <ForecastChart
        forecast={forecast}
        metric={metric}
        onMetricChange={setMetric}
        scale={scale}
        categoryColor={category.style.hex}
        readingMissing={value == null}
        loading={forecastLoading}
        source={forecast?.source}
      />
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <DailyOutlookCard forecast={forecast} scale={scale} />
        <DataProvenance reading={reading} scale={scale} />
      </div>
      <p className="flex items-start gap-2 px-1 text-[11px] leading-relaxed text-slate-300">
        <Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
        Health categories follow published AQI breakpoints ({aqiScaleLabel(scale)}) for awareness only. For symptoms,
        follow guidance from a qualified health professional.
      </p>
    </div>
  );
}
