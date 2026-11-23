import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "../common/Button";
import { Progress } from "../common/Progress";
import { LiveAnnouncer } from "../common/LiveAnnouncer";
import { ErrorState } from "../common/ErrorState";
import { Logo } from "../layout/Logo";

export function OnboardingShell({
  step,
  totalSteps,
  announcement,
  headingRef,
  current,
  StepIcon,
  refreshError,
  saving,
  canContinue,
  children,
  onSkip,
  onRefresh,
  onBack,
  onContinue,
  onFinish,
}) {
  return (
    <main id="main-content" tabIndex={-1} className="app-bg min-h-screen">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink-800 focus:px-4 focus:py-2 focus:text-white">
        Skip to main content
      </a>
      <LiveAnnouncer message={announcement} />
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-6 sm:px-6">
        <div className="flex items-center justify-between">
          <Logo to="/dashboard" />
          <button type="button" onClick={onSkip} disabled={saving} className="text-[12px] text-slate-400 hover:text-slate-200">
            Skip for now
          </button>
        </div>
        <div className="mt-8">
          <Progress value={((step + 1) / totalSteps) * 100} label={`Step ${step + 1} of ${totalSteps}`} />
        </div>
        <div className="surface mt-6 flex-1 p-6 sm:p-8">
          <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-xl border border-aurora-400/20 bg-aurora-400/8 text-aurora-300">
            <StepIcon size={19} />
          </span>
          <h1 ref={headingRef} tabIndex={-1} className="mt-4 font-display text-[24px] font-semibold text-white">
            {current.title}
          </h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">{current.description}</p>
          {refreshError ? (
            <ErrorState message={refreshError} onRetry={onRefresh} retryLabel="Refresh profile" />
          ) : null}
          <div className="mt-7 space-y-4">{children}</div>
          <div className="mt-8 flex items-center justify-between gap-3 border-t border-hairline pt-5">
            <Button variant="ghost" type="button" onClick={onBack}>
              <ArrowLeft size={15} aria-hidden="true" />
              {step === 0 ? "Cancel" : "Back"}
            </Button>
            {step < totalSteps - 1 ? (
              <Button type="button" onClick={onContinue} disabled={!canContinue}>
                Continue
                <ArrowRight size={15} aria-hidden="true" />
              </Button>
            ) : (
              <Button type="button" onClick={onFinish} loading={saving} disabled={!canContinue}>
                Finish setup
                <Check size={15} aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

export default OnboardingShell;
