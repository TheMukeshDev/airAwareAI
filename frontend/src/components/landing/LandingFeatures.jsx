import { Bike, CalendarCheck, Home, Leaf, ShieldCheck, Sparkles, Users, Wind } from "lucide-react";
import { Button } from "../common/Button";

const FEATURES = [
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

export function LandingFeatures() {
  return (
    <section id="features" className="border-t border-hairline bg-ink-950/40 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-aurora-400">Seven connected modules</p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-white sm:text-4xl">One vertical flow, not seven demo pages</h2>
          <p className="mt-3 text-[14px] leading-relaxed text-slate-300">
            Profile → air quality → lifestyle analysis → AI recommendation → action completion → impact tracking. Every
            module shares the same data model and timestamps.
          </p>
        </div>
        <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }, index) => (
            <article
              key={title}
              className="group surface p-5 transition-colors hover:border-aurora-400/25"
              style={{ animationDelay: `${index * 40}ms` }}
            >
              <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-xl border border-aurora-400/20 bg-aurora-400/8 text-aurora-300">
                <Icon size={18} />
              </span>
              <h3 className="mt-4 text-[14.5px] font-semibold text-white">{title}</h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-300">{body}</p>
            </article>
          ))}
          <article className="flex flex-col justify-between rounded-2xl border border-aurora-400/25 bg-gradient-to-br from-aurora-500/14 via-ink-900/60 to-glow-500/10 p-5">
            <div>
              <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-xl bg-aurora-400/15 text-aurora-300">
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
            </Button>
          </article>
        </div>
      </div>
    </section>
  );
}

export default LandingFeatures;
