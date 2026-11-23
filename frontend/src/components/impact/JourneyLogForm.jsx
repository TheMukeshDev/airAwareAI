import { useState } from "react";
import toast from "react-hot-toast";
import { Plus } from "lucide-react";
import { Button } from "../common/Button";
import { Card, CardDescription, CardHeader, CardTitle } from "../common/Card";
import { Field, Input, LabeledSelect, Textarea } from "../common/Field";
import { Badge } from "../common/Badge";
import { impactApi, apiError } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { TRANSPORT_MODES } from "../../lib/constants";
import { formatNumber } from "../../lib/utils";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function JourneyLogForm({ onLogged }) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    date: today(),
    distance_km: "",
    baseline_mode: user?.lifestyle?.primary_mode ?? "",
    actual_mode: "",
    passengers: "1",
    note: "",
  });
  const [busy, setBusy] = useState(false);
  const update = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    const distance = Number(form.distance_km);
    if (!distance || distance <= 0) {
      toast.error("Enter a distance greater than zero.");
      return;
    }
    if (!form.baseline_mode || !form.actual_mode) {
      toast.error("Select both baseline and actual mode.");
      return;
    }
    setBusy(true);
    try {
      const response = await impactApi.log({
        date: form.date,
        distance_km: distance,
        baseline_mode: form.baseline_mode,
        actual_mode: form.actual_mode,
        passengers: Number(form.passengers) || 1,
        note: form.note || undefined,
      });
      toast.success(
        response?.record?.avoided_kg > 0
          ? `Logged. ≈${formatNumber(response.record.avoided_kg, { maximumFractionDigits: 2 })} kg CO₂e avoided.`
          : "Activity logged.",
      );
      setForm((previous) => ({ ...previous, note: "", distance_km: "" }));
      onLogged?.();
    } catch (error) {
      toast.error(apiError(error, "Could not log this activity."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader action={<Badge tone="aurora">New entry</Badge>}>
        <CardTitle as="h2">Log a journey</CardTitle>
        <CardDescription>Compare what you did with what you would normally have done.</CardDescription>
      </CardHeader>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date" required>
            {({ id, ...props }) => <Input id={id} type="date" value={form.date} max={today()} onChange={(event) => update("date", event.target.value)} {...props} />}
          </Field>
          <Field label="Distance (km)" required>
            {({ id, ...props }) => <Input id={id} type="number" min={0.1} step="0.1" value={form.distance_km} onChange={(event) => update("distance_km", event.target.value)} {...props} />}
          </Field>
          <LabeledSelect label="Baseline mode" value={form.baseline_mode} onChange={(event) => update("baseline_mode", event.target.value)} hint="What you would have done" required>
            <option value="">Select baseline mode</option>
            {TRANSPORT_MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
          </LabeledSelect>
          <LabeledSelect label="Actual mode" value={form.actual_mode} onChange={(event) => update("actual_mode", event.target.value)} hint="What you did" required>
            <option value="">Select actual mode</option>
            {TRANSPORT_MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
          </LabeledSelect>
        </div>
        <Field label="Passengers" hint="Shared journeys split emissions per person.">
          {({ id, ...props }) => <Input id={id} type="number" min={1} max={8} value={form.passengers} onChange={(event) => update("passengers", event.target.value)} {...props} />}
        </Field>
        <Field label="Note (optional)">
          {({ id, ...props }) => <Textarea id={id} rows={2} placeholder="Office commute, replaced bike with metro" value={form.note} onChange={(event) => update("note", event.target.value)} {...props} />}
        </Field>
        <Button type="submit" loading={busy} className="w-full">
          <Plus size={15} aria-hidden="true" />
          Log activity
        </Button>
      </form>
    </Card>
  );
}

export default JourneyLogForm;
