import { Droplets, Thermometer, Wind, Eye, CloudSun } from "lucide-react";
import { cn, formatNumber } from "../../lib/utils";

const items = [
  { key: "temperature_c", label: "Temperature", unit: "°C", icon: Thermometer },
  { key: "relative_humidity", label: "Humidity", unit: "%", icon: Droplets },
  { key: "wind_speed_kmh", label: "Wind", unit: "km/h", icon: Wind },
  { key: "visibility_m", label: "Visibility", unit: "m", icon: Eye, transform: (v) => (v > 1000 ? `${formatNumber(v / 1000, { maximumFractionDigits: 1 })} km` : `${formatNumber(v, { maximumFractionDigits: 0 })} m`) },
  { key: "cloud_cover", label: "Cloud", unit: "%", icon: CloudSun },
];

export function WeatherStrip({ weather, className }) {
  if (!weather) {
    return (
      <div role="status" className={cn("surface-muted px-4 py-3 text-[12px] text-slate-400", className)}>
        Weather data unavailable.
      </div>
    );
  }

  return (
    <div className={cn("surface flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3.5", className)}>
      <div className="mr-1 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-aurora-400" aria-hidden="true" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Weather</span>
      </div>
      {items.map(({ key, label, unit, icon: Icon, transform }) => {
        const value = weather[key];
        if (value === null || value === undefined) return null;
        return (
          <div key={key} className="flex items-center gap-2">
            <Icon size={14} className="text-slate-400" aria-hidden="true" />
            <span className="text-[12.5px] text-slate-400">{label}</span>
            <span className="text-[12.5px] font-medium text-slate-100 tabular-nums">
              {transform ? transform(value) : `${formatNumber(value, { maximumFractionDigits: 0 })}${unit}`}
            </span>
          </div>
        );
      })}
      {weather.wind_direction !== undefined && weather.wind_direction !== null ? (
        <div className="flex items-center gap-1.5 text-[12px] text-slate-400">
          <span>{formatNumber(weather.wind_direction, { maximumFractionDigits: 0 })}°</span>
          <span>{compass(weather.wind_direction)}</span>
        </div>
      ) : null}
    </div>
  );
}

function compass(deg) {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return directions[Math.round(Number(deg) / 45) % 8];
}

export default WeatherStrip;
