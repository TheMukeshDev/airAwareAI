import { Card, CardDescription, CardHeader, CardTitle } from "../common/Card";
import { classifyAqi } from "../../lib/aqi";
import { cn, formatNumber } from "../../lib/utils";

export function DailyOutlookCard({ forecast, scale }) {
  const days = forecast?.daily ?? [];
  return (
    <Card className="p-4 sm:p-5">
      <CardHeader>
        <CardTitle as="h2">Daily outlook</CardTitle>
        <CardDescription>Maximum AQI and average PM2.5 per day</CardDescription>
      </CardHeader>
      <div className="mt-3 overflow-x-auto">
        {days.length ? (
          <table className="w-full min-w-[420px] text-left text-[12px]">
            <caption className="sr-only">Daily air quality outlook</caption>
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.12em] text-slate-300">
                <th scope="col" className="pb-2 font-medium">Day</th>
                <th scope="col" className="pb-2 font-medium">Max AQI</th>
                <th scope="col" className="pb-2 font-medium">Avg PM2.5</th>
                <th scope="col" className="pb-2 font-medium">Category</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {days.map((day) => {
                const value = scale === "india" ? day.india_aqi_max : day.us_aqi_max;
                const category = classifyAqi(value, scale);
                return (
                  <tr key={day.date}>
                    <td className="py-2.5 text-slate-300">
                      {new Date(day.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                    </td>
                    <td className="py-2.5 font-medium tabular-nums text-slate-100">{value ?? "—"}</td>
                    <td className="py-2.5 tabular-nums text-slate-400">
                      {formatNumber(day.pm2_5_mean)} <span className="text-[11px] text-slate-300">µg/m³</span>
                    </td>
                    <td className={cn("py-2.5", category.style.text)}>{category.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p role="status" aria-live="polite" className="text-[12px] text-slate-300">
            Daily forecast unavailable.
          </p>
        )}
      </div>
    </Card>
  );
}

export default DailyOutlookCard;
