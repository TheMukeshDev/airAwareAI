import { Card, CardDescription, CardHeader, CardTitle } from "../common/Card";
import { Badge } from "../common/Badge";
import { Toggle } from "../common/Toggle";
import { cn } from "../../lib/utils";
import { COOKING_FUELS } from "../../lib/constants";

export const VENTILATION_OPTIONS = [
  { value: "windows_often", label: "Windows open most of the day" },
  { value: "windows_sometimes", label: "Windows open at set times" },
  { value: "windows_rarely", label: "Windows rarely opened" },
  { value: "exhaust_fan", label: "Kitchen exhaust fan or chimney" },
  { value: "air_purifier", label: "Air purifier with HEPA filter" },
];

export function IndoorVentilationCard({ selected, fuel, onToggle, onFuel }) {
  return (
    <Card>
      <CardHeader action={<Badge tone="neutral">Step 2</Badge>}>
        <CardTitle as="h2">Ventilation and kitchen</CardTitle>
        <CardDescription>Ventilation advice depends on both indoor sources and outdoor readings.</CardDescription>
      </CardHeader>
      <div className="mt-4 space-y-2">
        {VENTILATION_OPTIONS.map((option) => (
          <Toggle
            key={option.value}
            id={`vent-${option.value}`}
            label={option.label}
            checked={selected.includes(option.value)}
            onChange={() => onToggle(selected, option.value)}
          />
        ))}
        <div className="mt-3 border-t border-hairline pt-3">
          <p id="cooking-fuel-label" className="mb-2 text-[12px] font-medium text-slate-300">
            Cooking fuel
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="cooking-fuel-label">
            {COOKING_FUELS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onFuel(option.value)}
                aria-pressed={fuel === option.value}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-[11.5px] transition-colors",
                  fuel === option.value
                    ? "border-aurora-400/45 bg-aurora-400/10 text-aurora-200"
                    : "border-hairline text-slate-300 hover:border-white/15",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default IndoorVentilationCard;
