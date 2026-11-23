const STEPS = [
  {
    title: "Set your location",
    body: "City, coordinates and household profile. Every reading is tied to a real place and timestamp.",
  },
  {
    title: "Connect your habits",
    body: "A short lifestyle questionnaire establishes your baseline transport, energy and waste patterns.",
  },
  {
    title: "Get grounded guidance",
    body: "Rules engines calculate; Gemini explains. Recommendations always cite the readings behind them.",
  },
  {
    title: "Track what changes",
    body: "Log sustainable trips and completed actions to see estimated emissions avoided over time.",
  },
];

export function LandingHowItWorks() {
  return (
    <section id="how-it-works" className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-glow-300">How it works</p>
            <h2 className="mt-2 font-display text-3xl font-semibold text-white sm:text-4xl">Four steps to a cleaner routine</h2>
          </div>
          <p className="max-w-sm text-[12.5px] leading-relaxed text-slate-300">
            Onboarding takes about three minutes. You can update any habit later from Settings, and every recommendation
            will re-ground itself in the new baseline.
          </p>
        </div>
        <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="surface relative p-5">
              <span aria-hidden="true" className="font-display text-[28px] font-semibold text-white/12">
                0{index + 1}
              </span>
              <h3 className="mt-2 text-[14px] font-semibold text-white">{step.title}</h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-300">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export default LandingHowItWorks;
