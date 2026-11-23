import { Field, Input, LabeledSelect } from "../common/Field";
import { COOKING_FUELS, HOUSEHOLDS } from "../../lib/constants";

export function HouseholdStep({ form, onChange }) {
  return (
    <>
      <LabeledSelect
        label="Household type"
        value={form.household_type}
        onChange={(event) => onChange("household_type", event.target.value)}
        required
      >
        <option value="">Select household type</option>
        {HOUSEHOLDS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </LabeledSelect>
      <Field label="People in the household" required>
        {({ id, ...props }) => (
          <Input
            id={id}
            type="number"
            min={1}
            max={20}
            value={form.household_size}
            onChange={(event) => onChange("household_size", event.target.value)}
            {...props}
          />
        )}
      </Field>
      <LabeledSelect
        label="Main cooking fuel"
        value={form.cooking_fuel}
        onChange={(event) => onChange("cooking_fuel", event.target.value)}
        hint="Fuel type changes indoor pollution guidance significantly."
        required
      >
        <option value="">Select cooking fuel</option>
        {COOKING_FUELS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </LabeledSelect>
    </>
  );
}

export default HouseholdStep;
