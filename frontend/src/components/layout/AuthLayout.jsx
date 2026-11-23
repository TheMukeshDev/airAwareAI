import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck, Sparkles, Wind } from "lucide-react";
import { Logo } from "./Logo";

export function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <main id="main-content" tabIndex={-1} className="app-bg min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink-800 focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>
      <div className="mx-auto grid min-h-screen max-w-6xl lg:grid-cols-[0.95fr_1.05fr]">
        <div className="relative hidden flex-col justify-between overflow-hidden border-r border-hairline px-10 py-10 lg:flex">
          <div className="grid-noise pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="relative">
            <Logo to="/" />
          </div>
          <div className="relative">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-aurora-400">
              Environmental intelligence
            </p>
            <h2 className="mt-3 max-w-sm font-display text-[30px] font-semibold leading-tight text-white">
              Your city&apos;s air, your habits, one honest plan.
            </h2>
            <div className="mt-8 space-y-3">
              {[
                { icon: Wind, text: "Live readings with source and timestamp on every card." },
                { icon: Sparkles, text: "Gemini explains guidance; calculations come from documented factors and the backend." },
                { icon: ShieldCheck, text: "Private by default; community views are aggregated." },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-start gap-3 rounded-xl border border-hairline bg-ink-900/50 px-4 py-3">
                  <Icon size={15} className="mt-0.5 shrink-0 text-aurora-400" aria-hidden="true" />
                  <p className="text-[12.5px] leading-relaxed text-slate-400">{text}</p>
                </div>
              ))}
            </div>
          </div>
          <p className="relative text-[11px] leading-relaxed text-slate-400">
            AirAware AI is an awareness tool. It does not provide medical advice, and estimates are not regulatory
            measurements.
          </p>
        </div>

        <div className="flex flex-col px-4 py-6 sm:px-8 lg:px-14">
          <div className="flex items-center justify-between lg:hidden">
            <Logo to="/" />
          </div>
          <div className="flex flex-1 items-center justify-center">
            <div className="w-full max-w-[400px] py-10">
              <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-[12px] text-slate-400 hover:text-slate-200">
                <ArrowLeft size={13} aria-hidden="true" />
                Back to home
              </Link>
              <h1 className="font-display text-[26px] font-semibold text-white">{title}</h1>
              {subtitle ? <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">{subtitle}</p> : null}
              <div className="mt-7">{children}</div>
              {footer ? <div className="mt-6 text-[12.5px] text-slate-400">{footer}</div> : null}
            </div>
          </div>
          <p className="text-center text-[11px] leading-relaxed text-slate-400 lg:text-right">
            By continuing you accept our terms and privacy notice.
          </p>
        </div>
      </div>
    </main>
  );
}

export default AuthLayout;
