import { LabeledSelect } from "../common/Field";
import { CITIES } from "../../lib/constants";

export function LocationStep({ form, onChange }) {
  const city = CITIES.find((option) => option.name === form.city) ?? CITIES[0];
  return (
    <>
      <LabeledSelect
        label="City"
        value={form.city}
        onChange={(event) => onChange("city", event.target.value)}
        hint={form.city ? `Coordinates used: ${city.latitude}, ${city.longitude} · India` : "Select your city to ground readings."}
        required
      >
        <option value="">Select a city</option>
        {CITIES.map((option) => (
          <option key={option.name} value={option.name}>
            {option.name}, {option.admin1}
          </option>
        ))}
      </LabeledSelect>
      <div className="rounded-xl border border-hairline bg-ink-900/60 p-4">
        <p className="text-[12px] leading-relaxed text-slate-400">
          AirAware uses model output for the nearest grid cell and, where available, station data. Model data is not the
          same as a monitor in your street.
        </p>
      </div>
    </>
  );
}

export default LocationStep;
