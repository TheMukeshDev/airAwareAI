import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "../common/Button";
import { Badge } from "../common/Badge";
import { AqiCard } from "../dashboard/AqiCard";
import { classifyAqi } from "../../lib/aqi";
import { formatNumber } from "../../lib/utils";

const PREVIEW_POLLUTANTS = [
  { label: "PM2.5", key: "pm2_5", unit: "µg/m³" },
  { label: "PM10", key: "pm10", unit: "µg/m³" },
  { label: "NO₂", key: "nitrogen_dioxide", unit: "µg/m³" },
];

export function LandingHero({ isAuthenticated, air }) {
  const { data, loading, error, refresh } = air;
  const category = data?.scale ? classifyAqi(data?.aqi, data.scale) : null;
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden="true" className="grid-noise pointer-events-none absolute inset-0" />
      <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pb-24 lg:pt-20">
        <div className="animate-rise">
          <Badge tone="aurora" dot>Environmental intelligence · not just an AQI number</Badge>
          <h1 className="mt-5 font-display text-[38px] font-semibold leading-[1.06] tracking-tight text-white sm:text-[52px]">
            Understand your pollution.
            <br />
            Change your habits.
            <br />
            <span className="text-gradient">Breathe smarter.</span>
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-slate-300">
            AirAware AI turns live air quality readings and your daily routine into one personalised plan — with honest
            estimates, practical alternatives and measurable progress you can actually follow.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button to={isAuthenticated ? "/dashboard" : "/register"} size="lg">
              {isAuthenticated ? "Open dashboard" : "Start free"}
              <ArrowRight size={16} aria-hidden="true" />
            </Button>
            <Button to="/login" size="lg" variant="secondary">I already have an account</Button>
          </div>
          <ul className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-slate-300">
            {["No invented readings", "Scale always labelled", "Estimated values marked"].map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-aurora-400" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div id="live-preview" className="animate-rise space-y-3" style={{ animationDelay: "120ms" }}>
          <div className="flex items-center justify-between rounded-xl border border-hairline bg-ink-900/70 px-3.5 py-2.5">
            <div className="flex items-center gap-2 text-[11.5px] text-slate-300">
              <span aria-hidden="true" className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-aurora-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-aurora-400" />
              </span>
              Live preview · Prayagraj, India
            </div>
            <span className="text-[11px] uppercase tracking-wider text-slate-300">Public · no sign-in</span>
          </div>
          <AqiCard reading={data} loading={loading} error={error} onRefresh={refresh} />
          <div className="grid grid-cols-3 gap-2.5">
            {PREVIEW_POLLUTANTS.map((item) => (
              <div key={item.label} className="surface px-3.5 py-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-slate-300">{item.label}</p>
                <p className="mt-1 font-display text-[17px] font-semibold text-white tabular-nums">
                  {formatNumber(data?.pollutants?.[item.key])}
                </p>
                <p className="text-[11px] text-slate-300">{item.unit}</p>
              </div>
            ))}
          </div>
          <p className="px-1 text-[11px] leading-relaxed text-slate-300">
            {data?.source ? `Source: ${data.source}` : "Air quality data is shown only when available."}
            {data?.observed_at ? ` · observed ${data.observed_at.replace("T", " ")}` : ""}
            {category?.value !== null && category?.value !== undefined ? ` · ${category.label}` : ""}
          </p>
        </div>
      </div>
    </section>
  );
}

export default LandingHero;
