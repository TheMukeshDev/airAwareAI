import { Card, CardDescription, CardHeader, CardTitle } from "../common/Card";
import { Badge } from "../common/Badge";
import { PollutantGrid } from "./PollutantGrid";

export function NearbyGridCard({ reading, cached }) {
  return (
    <Card>
      <CardHeader
        action={
          <Badge tone={cached ? "moderate" : "neutral"} dot={Boolean(cached)}>
            {cached ? "Cached" : reading?.source ? "Fresh model data" : "Unavailable"}
          </Badge>
        }
      >
        <CardTitle as="h2">Pollutants</CardTitle>
        <CardDescription>Concentrations in µg/m³ · not the same as AQI</CardDescription>
      </CardHeader>
      <div className="mt-4">
        <PollutantGrid pollutants={reading?.pollutants} units={reading?.units} />
      </div>
    </Card>
  );
}

export default NearbyGridCard;
