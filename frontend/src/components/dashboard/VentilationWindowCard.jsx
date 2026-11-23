import { TrendingDown } from "lucide-react";
import { Button } from "../common/Button";
import { Card, CardDescription, CardTitle } from "../common/Card";

export function VentilationWindowCard({ reading }) {
  return (
    <Card className="bg-gradient-to-br from-aurora-500/10 via-transparent to-glow-500/8">
      <div className="flex items-start justify-between">
        <div>
          <CardTitle as="h2">Indoor air today</CardTitle>
          <CardDescription>Ventilation window vs. outdoor reading</CardDescription>
        </div>
        <TrendingDown size={16} className="text-aurora-300" aria-hidden="true" />
      </div>
      <p className="mt-3 text-[12.5px] leading-relaxed text-slate-300">
        {reading?.indoor_hint ??
          "Open windows when outdoor PM2.5 is lowest — usually early morning — and cook with ventilation running."}
      </p>
      <Button to="/indoor-air" variant="outline" size="sm" className="mt-4">
        Open indoor coach
      </Button>
    </Card>
  );
}

export default VentilationWindowCard;
