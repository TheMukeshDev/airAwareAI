import { Calculator } from "lucide-react";
import { PageHeader } from "../components/common/PageHeader";
import { Button } from "../components/common/Button";
import { Card, CardDescription, CardTitle } from "../components/common/Card";
import { LoadingBlock } from "../components/common/Spinner";
import { ErrorState } from "../components/common/ErrorState";
import { LifestyleCategoryForm } from "../components/lifestyle/LifestyleCategoryForm";
import { LifestyleAnalysis } from "../components/lifestyle/LifestyleAnalysis";
import { useLifestyleForm } from "../hooks/useLifestyleForm";

export default function Lifestyle() {
  const { form, update, toggleWaste, analyze, save, busy, result, profile } = useLifestyleForm();

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Module 02"
        title="Lifestyle pollution analyzer"
        description="Estimate where your household emissions come from, then see which changes give the largest reduction for the least disruption."
        actions={
          <Button variant="secondary" size="sm" onClick={save} loading={busy} type="button">
            Save profile
          </Button>
        }
      />
      <form onSubmit={analyze} className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-4">
          <LifestyleCategoryForm form={form} update={update} toggleWaste={toggleWaste} busy={busy} />
        </div>
        <div className="space-y-4">
          {profile.error ? (
            <ErrorState message={profile.error} onRetry={profile.reload} retryLabel="Retry profile" />
          ) : profile.loading ? (
            <LoadingBlock label="Loading your profile" />
          ) : result ? (
            <LifestyleAnalysis analysis={result} />
          ) : (
            <Card>
              <CardTitle as="h2">No analysis yet</CardTitle>
              <CardDescription>
                Fill in the form and run the analysis. AirAware calculates each category from documented factors — the
                assistant never invents savings.
              </CardDescription>
              <Button type="submit" size="sm" className="mt-4" loading={busy}>
                <Calculator size={14} aria-hidden="true" />
                Analyze now
              </Button>
            </Card>
          )}
        </div>
      </form>
    </div>
  );
}
