import { MapPin } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "../common/Card";
import { LabeledSelect } from "../common/Field";
import { CITIES } from "../../lib/constants";

export function LocationPreferencesCard({ form, scale, onChange, onScale }) {
  return (
    <Card>
      <CardHeader action={<MapPin size={15} className="text-aurora-300" aria-hidden="true" />}>
        <CardTitle as="h2">Location</CardTitle>
        <CardDescription>Readings use the nearest model grid cell for these coordinates.</CardDescription>
      </CardHeader>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <LabeledSelect label="City" value={form.city} onChange={(event) => onChange("city", event.target.value)} required>
          <option value="">Select a city</option>
          {CITIES.map((city) => <option key={city.name} value={city.name}>{city.name}, {city.admin1}</option>)}
        </LabeledSelect>
        <LabeledSelect label="Default AQI scale" value={scale} onChange={(event) => onScale(event.target.value)}>
          <option value="us">US AQI</option>
          <option value="india">Indian National AQI (CPCB)</option>
        </LabeledSelect>
      </div>
    </Card>
  );
}

export default LocationPreferencesCard;
