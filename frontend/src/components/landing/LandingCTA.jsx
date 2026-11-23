import { Button } from "../common/Button";

export function LandingCTA({ isAuthenticated }) {
  return (
    <section className="py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-aurora-400/25 bg-gradient-to-br from-aurora-500/16 via-ink-900 to-glow-500/12 px-6 py-10 text-center sm:px-12">
          <div aria-hidden="true" className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-aurora-400/10 blur-3xl" />
          <h2 className="relative font-display text-2xl font-semibold text-white sm:text-3xl">
            Breathe smarter, starting with today's plan
          </h2>
          <p className="relative mx-auto mt-2 max-w-lg text-[13.5px] leading-relaxed text-slate-300">
            Free to start. Your data stays private; community analytics are always aggregated.
          </p>
          <div className="relative mt-6 flex flex-wrap justify-center gap-2">
            <Button to={isAuthenticated ? "/dashboard" : "/register"} size="lg">
              {isAuthenticated ? "Go to dashboard" : "Create your free account"}
            </Button>
            <Button to="/login" size="lg" variant="secondary">Sign in</Button>
          </div>
          <p className="relative mt-4 text-[12px] text-slate-300">
            Want the details?{" "}
            <a href="#live-preview" className="text-aurora-300 hover:underline">
              See the public live preview above
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}

export default LandingCTA;
