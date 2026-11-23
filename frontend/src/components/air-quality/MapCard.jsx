import { MapPinned } from "lucide-react";
import { Badge } from "../common/Badge";
import { Card, CardDescription, CardHeader, CardTitle } from "../common/Card";
import { StationMap } from "../map/StationMap";
import { aqiScaleLabel } from "../../lib/aqi";

export function MapCard({ coords, stations, activeId, onSelect, scale, reading, stationLoading }) {
  const value = scale === "india" ? reading?.aqi_india : reading?.aqi;
  return (
    <Card className="p-4 sm:p-5">
      <CardHeader
        action={
          <Badge tone="neutral">
            {value === null || value === undefined ? "No reading" : `${aqiScaleLabel(scale)} · ${Math.round(value)}`}
          </Badge>
        }
      >
        <CardTitle as="h2">Map</CardTitle>
        <CardDescription>
          Your selected location plus nearby model grid points. Use the station list for detailed values.
        </CardDescription>
      </CardHeader>
      <div className="mt-4">
        <StationMap
          center={coords}
          stations={stations}
          activeId={activeId}
          onSelect={onSelect}
          height={400}
          label="Nearby air quality reference points map"
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300">
        <span className="inline-flex items-center gap-1.5">
          <MapPinned size={11} aria-hidden="true" />
          {coords.latitude.toFixed(4)}, {coords.longitude.toFixed(4)}
        </span>
        <span role="status" aria-live="polite">
          {stationLoading
            ? "Loading reference points…"
            : stations.length
              ? "Model grid points are not physical monitors."
              : "No reference points available."}
        </span>
      </div>
    </Card>
  );
}

export default MapCard;
