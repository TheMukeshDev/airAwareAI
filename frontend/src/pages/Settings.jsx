import { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Bell, LogOut, MapPin, Shield, User as UserIcon } from "lucide-react";
import { PageHeader } from "../components/common/PageHeader";
import { Button } from "../components/common/Button";
import { Card, CardDescription, CardHeader, CardTitle } from "../components/common/Card";
import { Field, Input, LabeledSelect } from "../components/common/Field";
import { Toggle } from "../components/common/Toggle";
import { Badge } from "../components/common/Badge";
import { DataNote } from "../components/common/DataNote";
import { ErrorState } from "../components/common/ErrorState";
import { useAuth } from "../context/AuthContext";
import { profileApi, apiError } from "../services/api";
import { CITIES, GOALS, TRANSPORT_MODES } from "../lib/constants";

export function Settings() {
  const { user, updateUser, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: user?.name ?? "",
    city: user?.location?.city ?? "",
    transport: user?.preferences?.transport ?? user?.lifestyle?.primary_mode ?? "",
    goal: user?.preferences?.goal ?? "",
  });
  const [prefs, setPrefs] = useState({
    notifications: user?.preferences?.notifications ?? true,
    daily_digest: user?.preferences?.daily_digest ?? true,
    leaderboard_opt_in: user?.preferences?.leaderboard_opt_in ?? false,
    share_aggregate: user?.preferences?.share_aggregate ?? true,
  });
  const [scale, setScale] = useState(user?.preferences?.aqi_scale ?? "us");
  const [saving, setSaving] = useState(false);
  const [refreshError, setRefreshError] = useState(null);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const setPref = (key, value) => setPrefs((current) => ({ ...current, [key]: value }));

  const save = async (event) => {
    event?.preventDefault();
    if (!form.name.trim()) {
      toast.error("Name cannot be empty.");
      return;
    }
    if (!form.city) {
      toast.error("Select a city.");
      return;
    }
    const city = CITIES.find((entry) => entry.name === form.city);
    if (!city) {
      toast.error("Select a valid city.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        location: {
          city: city.name,
          state: city.admin1,
          country: "India",
          latitude: city.latitude,
          longitude: city.longitude,
        },
        preferences: {
          ...prefs,
          transport: form.transport || undefined,
          goal: form.goal || undefined,
          aqi_scale: scale,
        },
      };
      const data = await profileApi.update(payload);
      const nextUser = data.user ?? { ...user, ...payload };
      updateUser(nextUser);
      try {
        await refreshUser();
        setRefreshError(null);
      } catch (error) {
        const message = apiError(error, "Settings saved, but your profile could not be refreshed.");
        setRefreshError(message);
        toast.error(message);
      }
      toast.success("Settings saved.");
    } catch (error) {
      toast.error(apiError(error, "Could not save settings."));
    } finally {
      setSaving(false);
    }
  };

  const retryRefresh = async () => {
    try {
      await refreshUser();
      setRefreshError(null);
      toast.success("Profile refreshed.");
    } catch (error) {
      setRefreshError(apiError(error, "Could not refresh your profile."));
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Account"
        title="Profile and settings"
        description="Your location powers every reading. Your preferences shape the planner and what the community hub may aggregate."
        actions={user?.email ? <Badge tone="neutral">{user.email}</Badge> : null}
      />

      {refreshError ? <ErrorState message={refreshError} onRetry={retryRefresh} /> : null}

      <form onSubmit={save} className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader action={<UserIcon size={15} className="text-aurora-300" aria-hidden="true" />}>
              <CardTitle as="h2">Personal information</CardTitle>
              <CardDescription>Shown in the app and on leaderboards when you opt in.</CardDescription>
            </CardHeader>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Full name" required>
                {({ id, ...fieldProps }) => <Input id={id} value={form.name} onChange={(event) => set("name", event.target.value)} {...fieldProps} />}
              </Field>
              <Field label="Email" hint="Contact support to change your email.">
                {({ id }) => <Input id={id} value={user?.email ?? ""} disabled />}
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader action={<MapPin size={15} className="text-aurora-300" aria-hidden="true" />}>
              <CardTitle as="h2">Location</CardTitle>
              <CardDescription>Readings use the nearest model grid cell for these coordinates.</CardDescription>
            </CardHeader>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <LabeledSelect label="City" value={form.city} onChange={(event) => set("city", event.target.value)} required>
                <option value="">Select a city</option>
                {CITIES.map((city) => (
                  <option key={city.name} value={city.name}>
                    {city.name}, {city.admin1}
                  </option>
                ))}
              </LabeledSelect>
              <LabeledSelect label="Default AQI scale" value={scale} onChange={(event) => setScale(event.target.value)}>
                <option value="us">US AQI</option>
                <option value="india">Indian National AQI (CPCB)</option>
              </LabeledSelect>
            </div>
          </Card>

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
                checked={prefs.notifications}
                onChange={(value) => setPref("notifications", value)}
              />
              <Toggle
                id="daily_digest"
                label="Daily plan digest"
                description="One summary each morning instead of repeated reminders."
                checked={prefs.daily_digest}
                onChange={(value) => setPref("daily_digest", value)}
              />
              <LabeledSelect label="Usual transport" value={form.transport} onChange={(event) => set("transport", event.target.value)}>
                <option value="">Select transport</option>
                {TRANSPORT_MODES.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </LabeledSelect>
              <LabeledSelect label="Primary goal" value={form.goal} onChange={(event) => set("goal", event.target.value)}>
                <option value="">Select goal</option>
                {GOALS.map((goal) => (
                  <option key={goal.value} value={goal.value}>
                    {goal.label}
                  </option>
                ))}
              </LabeledSelect>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader action={<Shield size={15} className="text-aurora-300" aria-hidden="true" />}>
              <CardTitle as="h2">Privacy controls</CardTitle>
              <CardDescription>You decide what can be aggregated.</CardDescription>
            </CardHeader>
            <div className="mt-4 space-y-3">
              <Toggle
                id="leaderboard_opt_in"
                label="Show me on the leaderboard"
                description="Display name and avoided kg only. Never your location or habits."
                checked={prefs.leaderboard_opt_in}
                onChange={(value) => setPref("leaderboard_opt_in", value)}
              />
              <Toggle
                id="share_aggregate"
                label="Contribute to community totals"
                description="Include my estimates in aggregated community impact."
                checked={prefs.share_aggregate}
                onChange={(value) => setPref("share_aggregate", value)}
              />
            </div>
            <DataNote className="mt-4">
              Deleting your account removes your profile, lifestyle data and activity records. Community totals are
              recalculated without your contributions.
            </DataNote>
          </Card>

          <Card>
            <CardTitle as="h2">Account</CardTitle>
            <CardDescription>Session and account management.</CardDescription>
            <div className="mt-4 space-y-2">
              <Button type="button" variant="secondary" className="w-full" onClick={() => { logout(); navigate("/login", { replace: true }); }}>
                <LogOut size={15} aria-hidden="true" />
                Sign out
              </Button>
            </div>
            <p className="mt-3 text-[10.5px] leading-relaxed text-slate-400">
              AirAware never publishes an individual&apos;s location, commute or household profile.
            </p>
          </Card>

          <Button type="submit" loading={saving} className="w-full">
            Save changes
          </Button>
        </div>
      </form>
    </div>
  );
}

export default Settings;
