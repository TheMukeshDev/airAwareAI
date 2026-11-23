import { Bell } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "../common/Card";
import { LabeledSelect } from "../common/Field";
import { Toggle } from "../common/Toggle";
import { GOALS, TRANSPORT_MODES } from "../../lib/constants";

export function NotificationPreferencesCard({ form, preferences, onChange, onPreference }) {
  return (
    <Card>
      <CardHeader action={<Bell size={15} className="text-aurora-300" aria-hidden="true" />}>
        <CardTitle as="h2">Preferences and notifications</CardTitle>
        <CardDescription>Alerts should be suppressed when readings are stale or unavailable.</CardDescription>
      </CardHeader>
      <div className="mt-4 space-y-3">
        <Toggle
          id="notifications"
          label="Air quality alerts"
          description="Notify me when the AQI category changes for my location."
          checked={preferences.notifications}
          onChange={(value) => onPreference("notifications", value)}
        />
        <Toggle
          id="daily_digest"
          label="Daily plan digest"
          description="One summary each morning instead of repeated reminders."
          checked={preferences.daily_digest}
          onChange={(value) => onPreference("daily_digest", value)}
        />
        <LabeledSelect label="Usual transport" value={form.transport} onChange={(event) => onChange("transport", event.target.value)}>
          <option value="">Select transport</option>
          {TRANSPORT_MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
        </LabeledSelect>
        <LabeledSelect label="Primary goal" value={form.goal} onChange={(event) => onChange("goal", event.target.value)}>
          <option value="">Select goal</option>
          {GOALS.map((goal) => <option key={goal.value} value={goal.value}>{goal.label}</option>)}
        </LabeledSelect>
      </div>
    </Card>
  );
}

export default NotificationPreferencesCard;
