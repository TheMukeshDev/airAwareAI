import {
  ArrowRight,
  Bike,
  CalendarCheck,
  CheckCircle2,
  Home,
  Leaf,
  MapPin,
  ShieldCheck,
  Sparkles,
  Users,
  Wind,
} from "lucide-react";
import { Button } from "../components/common/Button";
import { Badge } from "../components/common/Badge";
import { AqiCard } from "../components/dashboard/AqiCard";
import { useAirQuality } from "../hooks/useAirQuality";
import { useAuth } from "../context/AuthContext";
import { classifyAqi } from "../lib/aqi";
import { DEFAULT_COORDS } from "../lib/constants";
import { formatNumber } from "../lib/utils";

const features = [
  {
    icon: Wind,
    title: "Smart air quality intelligence",
    body: "Live AQI, pollutant concentrations and hourly forecasts for your exact location, with the reporting scale always labelled.",
  },
  {
    icon: Bike,
    title: "Lifestyle pollution analyzer",
    body: "Turn commuting, cooking, electricity and waste habits into a clear picture of where your personal emissions come from.",
  },
  {
    icon: CalendarCheck,
    title: "AI daily action planner",
    body: "Gemini builds a pollution-aware plan around your routine, explains every recommendation and tracks what you complete.",
  },
  {
    icon: Home,
    title: "Indoor air coach",
    body: "Practical ventilation, cooking and filtration guidance that accounts for both outdoor smog and indoor sources.",
  },
  {
    icon: Leaf,
    title: "My environmental impact",
    body: "Versioned emission factors, baseline comparisons and monthly progress — estimated values clearly separated from verified readings.",
  },
  {
    icon: Sparkles,
    title: "Ask AirAware AI",
    body: "A contextual assistant that answers using your location, readings and habits — never invented numbers.",
  },
  {
    icon: Users,
    title: "Community green challenge",
    body: "Join neighbourhood challenges, watch collective avoided emissions grow and compare progress on a privacy-safe leaderboard.",
  },
];

const steps = [
  { title: "Set your location", body: "City, coordinates and household profile. Every reading is tied to a real place and timestamp." },
  { title: "Connect your habits", body: "A short lifestyle questionnaire establishes your baseline transport, energy and waste patterns." },
  { title: "Get grounded guidance", body: "Rules engines calculate; Gemini explains. Recommendations always cite the readings behind them." },
  { title: "Track what changes", body: "Log sustainable trips and completed actions to see estimated emissions avoided over time." },
];

export function Landing() {
  const { isAuthenticated } = useAuth();
  const { data, loading, error, refresh } = useAirQuality(DEFAULT_COORDS);
  const category = data?.scale ? classifyAqi(data?.aqi, data.scale) : null;

  return (
    <div>
      <section className="relative overflow-hidden">
        <div className="grid-noise pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pb-24 lg:pt-20">
          <div className="animate-rise">
            <Badge tone="aurora" dot>
              Environmental intelligence · not just an AQI number
            </Badge>
            <h1 className="mt-5 font-display text-[38px] font-semibold leading-[1.06] tracking-tight text-white sm:text-[52px]">
              Understand your pollution.
              <br />
              Change your habits.
              <br />
              <span className="text-gradient">Breathe smarter.</span>
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-slate-300">
              AirAware AI turns live air quality readings and your daily routine into one personalised plan — with
              honest estimates, practical alternatives and measurable progress you can actually follow.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button to={isAuthenticated ? "/dashboard" : "/register"} size="lg">
                {isAuthenticated ? "Open dashboard" : "Start free"}
                <ArrowRight size={16} aria-hidden="true" />
              </Button>
              <Button to="/login" size="lg" variant="secondary">
                I already have an account
              </Button>
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
                <span className="relative flex h-2 w-2" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-aurora-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-aurora-400" />
                </span>
                Live preview · Prayagraj, India
              </div>
              <span className="text-[11px] uppercase tracking-wider text-slate-300">Public · no sign-in</span>
            </div>
            <AqiCard reading={data} loading={loading} error={error} onRefresh={refresh} />
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { label: "PM2.5", value: data?.pollutants?.pm2_5, unit: "µg/m³" },
                { label: "PM10", value: data?.pollutants?.pm10, unit: "µg/m³" },
                { label: "NO₂", value: data?.pollutants?.nitrogen_dioxide, unit: "µg/m³" },
              ].map((item) => (
                <div key={item.label} className="surface px-3.5 py-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-slate-300">{item.label}</p>
                  <p className="mt-1 font-display text-[17px] font-semibold text-white tabular-nums">
                    {formatNumber(item.value)}
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

      <section id="features" className="border-t border-hairline bg-ink-950/40 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-aurora-400">Seven connected modules</p>
            <h2 className="mt-2 font-display text-3xl font-semibold text-white sm:text-4xl">
              One vertical flow, not seven demo pages
            </h2>
            <p className="mt-3 text-[14px] leading-relaxed text-slate-300">
              Profile → air quality → lifestyle analysis → AI recommendation → action completion → impact tracking.
              Every module shares the same data model and timestamps.
            </p>
          </div>
          <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, body }, index) => (
              <article
                key={title}
                className="group surface p-5 transition-colors hover:border-aurora-400/25"
                style={{ animationDelay: `${index * 40}ms` }}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-aurora-400/20 bg-aurora-400/8 text-aurora-300" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <h3 className="mt-4 text-[14.5px] font-semibold text-white">{title}</h3>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-300">{body}</p>
              </article>
            ))}
            <article className="flex flex-col justify-between rounded-2xl border border-aurora-400/25 bg-gradient-to-br from-aurora-500/14 via-ink-900/60 to-glow-500/10 p-5">
              <div>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-aurora-400/15 text-aurora-300" aria-hidden="true">
                  <ShieldCheck size={18} />
                </span>
                <h3 className="mt-4 text-[14.5px] font-semibold text-white">Built to be trusted</h3>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-200/80">
                  Gemini explains — it never supplies readings or savings. Every number comes from a data source or a
                  versioned calculation.
                </p>
              </div>
              <Button to="/register" variant="outline" size="sm" className="mt-5 self-start">
                Create your profile
                <ArrowRight size={14} aria-hidden="true" />
              </Button>
            </article>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-glow-300">How it works</p>
              <h2 className="mt-2 font-display text-3xl font-semibold text-white sm:text-4xl">Four steps to a cleaner routine</h2>
            </div>
            <p className="max-w-sm text-[12.5px] leading-relaxed text-slate-300">
              Onboarding takes about three minutes. You can update any habit later from Settings, and every
              recommendation will re-ground itself in the new baseline.
            </p>
          </div>
          <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <li key={step.title} className="surface relative p-5">
                <span className="font-display text-[28px] font-semibold text-white/12" aria-hidden="true">0{index + 1}</span>
                <h3 className="mt-2 text-[14px] font-semibold text-white">{step.title}</h3>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-300">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="impact" className="border-t border-hairline bg-ink-950/40 py-16 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-aurora-400">Environmental impact</p>
            <h2 className="mt-2 font-display text-3xl font-semibold text-white sm:text-4xl">
              Estimates you can audit
            </h2>
            <p className="mt-3 text-[14px] leading-relaxed text-slate-300">
              We separate four ideas that dashboards usually blur together: personal emissions, avoided emissions, air
              pollution exposure and community impact. Each calculation stores its factors, assumptions and version.
            </p>
            <div className="mt-6 space-y-3">
              {[
                ["Personal emissions", "Activities you actually performed, estimated with documented emission factors."],
                ["Avoided emissions", "Baseline mode minus the alternative you chose — never a claim about ambient AQI."],
                ["Exposure", "Your potential contact with pollutants, based on readings and time outdoors."],
                ["Community impact", "Aggregated avoided emissions across participants, double-counting removed."],
              ].map(([title, body]) => (
                <div key={title} className="flex gap-3">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-aurora-400" aria-hidden="true" />
                  <p className="text-[12.5px] leading-relaxed text-slate-300">
                    <span className="font-medium text-slate-100">{title}: </span>
                    {body}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-7 flex flex-wrap gap-2">
              <Badge tone="neutral">E = D × EF</Badge>
              <Badge tone="neutral">Avoided = baseline − alternative</Badge>
              <Badge tone="neutral">Versioned factor sets</Badge>
            </div>
          </div>
          <div className="surface p-6">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-slate-300">
              <MapPin size={12} className="text-aurora-400" aria-hidden="true" />
              Designed for Indian cities
            </div>
            <div className="mt-4 space-y-3">
              {[
                { label: "Indian National AQI (CPCB)", note: "Reported alongside US AQI, never merged" },
                { label: "PM2.5 as a concentration", note: "Not presented as a complete AQI value" },
                { label: "Winter smog awareness", note: "Outdoor-exertion guidance follows public health thresholds" },
                { label: "Household reality", note: "Cooking, ventilation and filtration guidance by fuel type" },
              ].map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-4 rounded-xl border border-hairline bg-ink-900/50 px-4 py-3">
                  <div>
                    <p className="text-[13px] font-medium text-slate-100">{row.label}</p>
                    <p className="mt-0.5 text-[11.5px] text-slate-300">{row.note}</p>
                  </div>
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-aurora-400" aria-hidden="true" />
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-xl border border-hairline bg-ink-950/40 p-4">
              <p className="text-[12px] leading-relaxed text-slate-300">
                &ldquo;The air is not just a number. It is what your commute, your kitchen and your city do to your
                lungs — and what you can still change today.&rdquo;
              </p>
              <p className="mt-2 text-[11px] text-slate-300">AirAware AI product principle</p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl border border-aurora-400/25 bg-gradient-to-br from-aurora-500/16 via-ink-900 to-glow-500/12 px-6 py-10 text-center sm:px-12">
            <div className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-aurora-400/10 blur-3xl" aria-hidden="true" />
            <h2 className="relative font-display text-2xl font-semibold text-white sm:text-3xl">
              Breathe smarter, starting with today&apos;s plan
            </h2>
            <p className="relative mx-auto mt-2 max-w-lg text-[13.5px] leading-relaxed text-slate-300">
              Free to start. Your data stays private; community analytics are always aggregated.
            </p>
            <div className="relative mt-6 flex flex-wrap justify-center gap-2">
              <Button to={isAuthenticated ? "/dashboard" : "/register"} size="lg">
                {isAuthenticated ? "Go to dashboard" : "Create your free account"}
              </Button>
              <Button to="/login" size="lg" variant="secondary">
                Sign in
              </Button>
            </div>
            <p className="relative mt-4 text-[12px] text-slate-300">
              Want the details? <a href="#live-preview" className="text-aurora-300 hover:underline">See the public live preview above</a>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Landing;
