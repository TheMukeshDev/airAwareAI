import { ExternalLink } from "lucide-react";
import { Card } from "../common/Card";
import { DataNote } from "../common/DataNote";
import { aqiScaleLabel } from "../../lib/aqi";
import { formatDateTime, safeExternalUrl } from "../../lib/utils";

export function DataProvenance({ reading, scale }) {
  const docsUrl = safeExternalUrl(reading?.source_url);
  return (
    <div className="space-y-3">
      <DataNote tone="info">
        <strong className="block text-slate-300">What this data is</strong>
        Open-Meteo serves CAMS model output for the grid cell nearest your coordinates. A model value is not a
        measurement from a physical monitor on your street.
      </DataNote>
      <DataNote tone="warning">
        <strong className="block text-moderate">Two AQI scales, never mixed</strong>
        US AQI and Indian National AQI (CPCB) use different breakpoints. AirAware labels the scale on every screen and
        never averages the two.
      </DataNote>
      <Card className="p-4">
        <p className="text-[11px] uppercase tracking-[0.14em] text-slate-300">Provenance</p>
        <div className="mt-2 space-y-2 text-[11.5px] text-slate-300">
          <p className="flex items-center justify-between gap-3">
            <span className="text-slate-300">Source</span>
            <span className="text-right text-slate-200">{reading?.source ?? "—"}</span>
          </p>
          <p className="flex items-center justify-between gap-3">
            <span className="text-slate-400">Fetched</span>
            <span>{reading?.fetched_at ? formatDateTime(reading.fetched_at) : "—"}</span>
          </p>
          <p className="flex items-center justify-between gap-3">
            <span className="text-slate-400">Scale</span>
            <span>{aqiScaleLabel(scale)}</span>
          </p>
        </div>
        {docsUrl ? (
          <a
            href={docsUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] text-aurora-300 hover:underline"
          >
            Data documentation (opens in new tab)
            <ExternalLink size={11} aria-hidden="true" />
          </a>
        ) : null}
      </Card>
    </div>
  );
}

export default DataProvenance;
