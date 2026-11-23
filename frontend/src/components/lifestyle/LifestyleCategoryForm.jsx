import { Field, Input, LabeledSelect } from "../common/Field";
import { Badge } from "../common/Badge";
import { Button } from "../common/Button";
import { Card, CardDescription, CardHeader, CardTitle } from "../common/Card";
import { Calculator } from "lucide-react";
import { COOKING_FUELS, TRANSPORT_MODES } from "../../lib/constants";

const DIETS = [
  { value: "vegetarian", label: "Vegetarian" },
  { value: "mixed", label: "Mixed" },
  { value: "high_meat", label: "High meat" },
];

const WASTE_PRACTICES = [
  { value: "segregates_waste", label: "I segregate dry and wet waste" },
  { value: "composts", label: "I compost kitchen waste" },
  { value: "avoids_single_use", label: "I avoid single-use plastic" },
];

function NumberField({ label, value, onChange, min, max, step, hint, disabled }) {
  return (
    <Field label={label} hint={hint}>
      {({ id, ...props }) => (
        <Input
          id={id}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          {...props}
        />
      )}
    </Field>
  );
}

function CategoryCard({ badge, title, description, children }) {
  return (
    <Card>
      <CardHeader action={<Badge tone="neutral">{badge}</Badge>}>
        <CardTitle as="h2">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {children}
    </Card>
  );
}

export function LifestyleCategoryForm({ form, update, toggleWaste, busy }) {
  return (
    <>
      <CategoryCard badge="Transport" title="How you get around" description="Distance is one-way. Occupancy assumptions are applied for shared modes.">
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <LabeledSelect label="Primary mode" value={form.primary_mode} onChange={(event) => update("primary_mode", event.target.value)}>
            <option value="">Select mode</option>
            {TRANSPORT_MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
          </LabeledSelect>
          <NumberField label="Commute distance (one-way, km)" min={0} max={200} step="0.5" value={form.commute_distance_km} onChange={(value) => update("commute_distance_km", value)} />
          <NumberField label="Commute days / week" min={0} max={7} value={form.commute_days_per_week} onChange={(value) => update("commute_days_per_week", value)} />
          <NumberField label="Other travel (km / week)" min={0} max={1000} value={form.weekly_other_km} onChange={(value) => update("weekly_other_km", value)} />
          <NumberField label="Flights per year" min={0} max={60} value={form.flights_per_year} onChange={(value) => update("flights_per_year", value)} />
        </div>
      </CategoryCard>
      <CategoryCard badge="Home" title="Energy and cooking" description="Grid electricity uses an Indian grid-average factor in the current factor set.">
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <NumberField label="Electricity (kWh / month)" min={0} max={5000} value={form.electricity_kwh_month} onChange={(value) => update("electricity_kwh_month", value)} />
          <NumberField label="People in household" min={1} max={20} value={form.household_size} onChange={(value) => update("household_size", value)} />
          <LabeledSelect label="Cooking fuel" value={form.cooking_fuel} onChange={(event) => update("cooking_fuel", event.target.value)}>
            <option value="">Select fuel</option>
            {COOKING_FUELS.map((fuel) => <option key={fuel.value} value={fuel.value}>{fuel.label}</option>)}
          </LabeledSelect>
          <NumberField label="Cylinders / month" hint="Only applies to LPG." min={0} max={12} step="0.5" value={form.lpg_cylinders_month} disabled={form.cooking_fuel !== "lpg"} onChange={(value) => update("lpg_cylinders_month", value)} />
        </div>
      </CategoryCard>
      <CategoryCard badge="Food & waste" title="Consumption habits" description="Select every practice that applies to your household.">
        <div className="mt-4 space-y-3">
          <LabeledSelect label="Diet pattern" value={form.diet} onChange={(event) => update("diet", event.target.value)}>
            <option value="">Select diet</option>
            {DIETS.map((diet) => <option key={diet.value} value={diet.value}>{diet.label}</option>)}
          </LabeledSelect>
          <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Waste practices">
            {WASTE_PRACTICES.map((practice) => (
              <button
                key={practice.value}
                type="button"
                onClick={() => toggleWaste(practice.value)}
                aria-pressed={form.waste.includes(practice.value)}
                className={`rounded-xl border px-3 py-2.5 text-left text-[11.5px] leading-snug transition-colors ${
                  form.waste.includes(practice.value)
                    ? "border-aurora-400/45 bg-aurora-400/10 text-aurora-200"
                    : "border-hairline bg-ink-900/50 text-slate-300 hover:border-white/15"
                }`}
              >
                {practice.label}
              </button>
            ))}
          </div>
        </div>
      </CategoryCard>
      <Button type="submit" loading={busy} className="w-full sm:w-auto">
        <Calculator size={15} aria-hidden="true" />
        Analyze my lifestyle
      </Button>
    </>
  );
}

export default LifestyleCategoryForm;
