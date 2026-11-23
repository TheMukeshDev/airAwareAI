import { LogOut, Shield } from "lucide-react";
import { Button } from "../common/Button";
import { Card, CardDescription, CardHeader, CardTitle } from "../common/Card";
import { Toggle } from "../common/Toggle";
import { DataNote } from "../common/DataNote";

export function PrivacyCard({ preferences, onPreference }) {
  return (
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
          checked={preferences.leaderboard_opt_in}
          onChange={(value) => onPreference("leaderboard_opt_in", value)}
        />
        <Toggle
          id="share_aggregate"
          label="Contribute to community totals"
          description="Include my estimates in aggregated community impact."
          checked={preferences.share_aggregate}
          onChange={(value) => onPreference("share_aggregate", value)}
        />
      </div>
      <DataNote className="mt-4">
        Deleting your account removes your profile, lifestyle data and activity records. Community totals are recalculated
        without your contributions.
      </DataNote>
    </Card>
  );
}

export function AccountCard({ onLogout }) {
  return (
    <Card>
      <CardTitle as="h2">Account</CardTitle>
      <CardDescription>Session and account management.</CardDescription>
      <div className="mt-4 space-y-2">
        <Button type="button" variant="secondary" className="w-full" onClick={onLogout}>
          <LogOut size={15} aria-hidden="true" />
          Sign out
        </Button>
      </div>
      <p className="mt-3 text-[10.5px] leading-relaxed text-slate-400">
        AirAware never publishes an individual's location, commute or household profile.
      </p>
    </Card>
  );
}

export default PrivacyCard;
