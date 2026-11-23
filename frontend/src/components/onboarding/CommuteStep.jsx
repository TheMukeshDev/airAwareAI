import { Field, Input, LabeledSelect } from "../common/Field";
import { TRANSPORT_MODES } from "../../lib/constants";

export function CommuteStep({ form, onChange }) {
  return (
    <>
      <LabeledSelect
        label="Usual commute mode"
        value={form.primary_mode}
        onChange={(event) => onChange("primary_mode", event.target.value)}
        required
      >
        <option value="">Select commute mode</option>
        {TRANSPORT_MODES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </LabeledSelect>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="One-way distance (km)">
          {({ id, ...props }) => (
            <Input
              id={id}
              type="number"
              min={0}
              max={200}
              step="0.5"
              value={form.commute_distance_km}
              onChange={(event) => onChange("commute_distance_km", event.target.value)}
              {...props}
            />
          )}
        </Field>
        <Field label="Commute days per week">
          {({ id, ...props }) => (
            <Input
              id={id}
              type="number"
              min={0}
              max={7}
              value={form.commute_days_per_week}
              onChange={(event) => onChange("commute_days_per_week", event.target.value)}
              {...props}
            />
          )}
        </Field>
      </div>
      <p className="text-[12px] text-slate-400">
        Leave distance or days blank if unknown; you can update later.
      </p>
    </>
  );
}

export default CommuteStep;
