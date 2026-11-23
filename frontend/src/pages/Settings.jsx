import { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { PageHeader } from "../components/common/PageHeader";
import { Button } from "../components/common/Button";
import { Badge } from "../components/common/Badge";
import { ErrorState } from "../components/common/ErrorState";
import { useAuth } from "../context/AuthContext";
import { profileApi, apiError } from "../services/api";
import { CITIES } from "../lib/constants";
import { PersonalInfoCard } from "../components/settings/PersonalInfoCard";
import { LocationPreferencesCard } from "../components/settings/LocationPreferencesCard";
import { NotificationPreferencesCard } from "../components/settings/NotificationPreferencesCard";
import { PrivacyCard, AccountCard } from "../components/settings/PrivacyCard";

export default function Settings() {
  const { user, updateUser, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: user?.name ?? "",
    city: user?.location?.city ?? "",
    transport: user?.preferences?.transport ?? user?.lifestyle?.primary_mode ?? "",
    goal: user?.preferences?.goal ?? "",
  });
  const [preferences, setPreferences] = useState({
    notifications: user?.preferences?.notifications ?? true,
    daily_digest: user?.preferences?.daily_digest ?? true,
    leaderboard_opt_in: user?.preferences?.leaderboard_opt_in ?? false,
    share_aggregate: user?.preferences?.share_aggregate ?? true,
  });
  const [scale, setScale] = useState(user?.preferences?.aqi_scale ?? "us");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const update = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));
  const updatePreference = (key, value) => setPreferences((previous) => ({ ...previous, [key]: value }));

  const refresh = async () => {
    try {
      await refreshUser();
      setError(null);
      toast.success("Profile refreshed.");
    } catch (failure) {
      setError(apiError(failure, "Could not refresh your profile."));
    }
  };

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
    const city = CITIES.find((item) => item.name === form.city);
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
          ...preferences,
          transport: form.transport || undefined,
          goal: form.goal || undefined,
          aqi_scale: scale,
        },
      };
      const response = await profileApi.update(payload);
      updateUser(response.user ?? { ...user, ...payload });
      try {
        await refreshUser();
        setError(null);
      } catch (failure) {
        const message = apiError(failure, "Settings saved, but your profile could not be refreshed.");
        setError(message);
        toast.error(message);
      }
      toast.success("Settings saved.");
    } catch (failure) {
      const message = apiError(failure, "Could not save settings.");
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
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
      {error ? <ErrorState message={error} onRetry={refresh} /> : null}
      <form onSubmit={save} className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4">
          <PersonalInfoCard form={form} email={user?.email} onChange={update} />
          <LocationPreferencesCard form={form} scale={scale} onChange={update} onScale={setScale} />
          <NotificationPreferencesCard form={form} preferences={preferences} onChange={update} onPreference={updatePreference} />
        </div>
        <div className="space-y-4">
          <PrivacyCard preferences={preferences} onPreference={updatePreference} />
          <AccountCard onLogout={() => { logout(); navigate("/login", { replace: true }); }} />
          <Button type="submit" loading={saving} className="w-full">Save changes</Button>
        </div>
      </form>
    </div>
  );
}
