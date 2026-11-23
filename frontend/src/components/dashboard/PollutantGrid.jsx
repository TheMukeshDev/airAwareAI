import { cn, formatNumber } from "../../lib/utils";
import { POLLUTANTS, pollutantTone, AQI_TONES } from "../../lib/aqi";

export function PollutantGrid({ pollutants, units = {}, className }) {
  return (
    <div className={cn("grid grid-cols-2 gap-2.5 sm:grid-cols-3", className)}>
      {POLLUTANTS.map(({ key, label, unit, note, decimals }) => {
        const value = pollutants?.[key];
        const tone = AQI_TONES[pollutantTone(value)];
        return (
          <div key={key} className="rounded-xl border border-hairline bg-ink-900/60 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-semibold tracking-wide text-slate-300">{label}</span>
              <span className={cn("h-1.5 w-1.5 rounded-full", tone?.dot ?? "bg-slate-600")} aria-hidden="true" />
            </div>
            <p className="mt-1.5 font-display text-[17px] font-semibold tabular-nums text-white">
              {value === null || value === undefined ? "—" : formatNumber(value, { maximumFractionDigits: decimals })}
              <span className="ml-1 text-[11px] font-normal text-slate-300">{units[key] ?? unit}</span>
            </p>
            <p className="mt-0.5 truncate text-[11px] text-slate-300">{note}</p>
          </div>
        );
      })}
    </div>
  );
}

export default PollutantGrid;
