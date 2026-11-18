import { useState } from "react";
import toast from "react-hot-toast";
import { Home, Lamp, ShieldCheck, Sparkles, ThermometerSun, Wrench } from "lucide-react";
import { PageHeader } from "../components/common/PageHeader";
import { Button } from "../components/common/Button";
import { Card, CardDescription, CardHeader, CardTitle } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { Toggle } from "../components/common/Toggle";
import { DataNote } from "../components/common/DataNote";
import { LoadingBlock } from "../components/common/Spinner";
import { useAirQuality, useUserCoords } from "../hooks/useAirQuality";
import { useAuth } from "../context/AuthContext";
import { indoorApi, apiError } from "../services/api";
import { classifyAqi } from "../lib/aqi";
import { cn, formatNumber } from "../lib/utils";
import { COOKING_FUELS } from "../lib/constants";

const SOURCES = [
  { key: "incense", label: "Incense, dhoop or candles" },
  { key: "smoking", label: "Indoor smoking" },
  { key: "biomass", label: "Wood, coal or biomass cooking" },
  { key: "frying", label: "Frequent high-heat frying" },
  { key: "pets", label: "Pets in living areas" },
  { key: "damp", label: "Damp walls or visible mould" },
  { key: "road_facing", label: "Home faces a busy road" },
  { key: "construction", label: "Construction or dust nearby" },
];

const VENTILATION = [
  { value: "windows_often", label: "Windows open most of the day" },
  { value: "windows_sometimes", label: "Windows open at set times" },
  { value: "windows_rarely", label: "Windows rarely opened" },
  { value: "exhaust_fan", label: "Kitchen exhaust fan or chimney" },
  { value: "air_purifier", label: "Air purifier with HEPA filter" },
];

const ICONS = { ventilation: ThermometerSun, cooking: Home, filtration: ShieldCheck, maintenance: Wrench, general: Lamp };

export function IndoorAir() {
  const { user } = useAuth();
  const coords = useUserCoords(user);
  const { data: reading } = useAirQuality(coords);
  const [sources, setSources] = useState([]);
  const [ventilation, setVentilation] = useState([]);
  const [cookingFuel, setCookingFuel] = useState("");
  const [state, setState] = useState({ data: null, loading: false });

  const toggle = (list, setList, value) =>
    setList(list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]);

  const run = async () => {
    if (!sources.length && !ventilation.length && !cookingFuel) {
      toast.error("Select at least one source, ventilation option, or cooking fuel.");
      return;
    }
    setState({ data: null, loading: true });
    try {
      const payload = { sources, ventilation, cooking_fuel: cookingFuel || null };
      const data = await indoorApi.create(payload);
      setState({ data: data.assessment ?? data, loading: false });
      toast.success("Indoor assessment ready.");
    } catch (error) {
      toast.error(apiError(error, "Could not run the indoor assessment."));
      setState({ data: null, loading: false });
    }
  };

  const result = state.data;
  const groups = result?.recommendations ?? [];
  const category = reading?.scale ? classifyAqi(reading?.aqi, reading.scale) : null;
  const outdoorHint = reading?.indoor_hint;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Module 04"
        title="Indoor air coach"
        description="Indoor air is not outdoor air. Tell us what happens inside your home and we will tailor ventilation, cooking and filtration guidance to it."
        actions={
          category ? <Badge tone={category.tone} dot>Outdoor {category.label}</Badge> : <Badge tone="neutral">Outdoor AQI unavailable</Badge>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader action={<Badge tone="neutral">Step 1</Badge>}>
              <CardTitle as="h2">Indoor pollution sources</CardTitle>
              <CardDescription>Select everything that applies. These matter more than outdoor AQI for many homes.</CardDescription>
            </CardHeader>
            <div className="mt-4 grid gap-2 sm:grid-cols-2" role="group" aria-label="Indoor pollution sources">
              {SOURCES.map((source) => {
                const active = sources.includes(source.key);
                return (
                  <button
                    key={source.key}
                    type="button"
                    onClick={() => toggle(sources, setSources, source.key)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-xl border px-3 py-2.5 text-left text-[12px] transition-colors",
                      active
                        ? "border-aurora-400/45 bg-aurora-400/10 text-aurora-200"
                        : "border-hairline bg-ink-900/50 text-slate-300 hover:border-white/15",
                    )}
                  >
                    {source.label}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card>
            <CardHeader action={<Badge tone="neutral">Step 2</Badge>}>
              <CardTitle as="h2">Ventilation and kitchen</CardTitle>
              <CardDescription>Ventilation advice depends on both indoor sources and outdoor readings.</CardDescription>
            </CardHeader>
            <div className="mt-4 space-y-2">
              {VENTILATION.map((option) => (
                <Toggle
                  key={option.value}
                  id={`vent-${option.value}`}
                  label={option.label}
                  checked={ventilation.includes(option.value)}
                  onChange={() => toggle(ventilation, setVentilation, option.value)}
                />
              ))}
              <div className="mt-3 border-t border-hairline pt-3">
                <p className="mb-2 text-[12px] font-medium text-slate-300" id="cooking-fuel-label">Cooking fuel</p>
                <div className="flex flex-wrap gap-2" role="group" aria-labelledby="cooking-fuel-label">
                  {COOKING_FUELS.map((fuel) => (
                    <button
                      key={fuel.value}
                      type="button"
                      onClick={() => setCookingFuel(fuel.value)}
                      aria-pressed={cookingFuel === fuel.value}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-[11.5px] transition-colors",
                        cookingFuel === fuel.value
                          ? "border-aurora-400/45 bg-aurora-400/10 text-aurora-200"
                          : "border-hairline text-slate-300 hover:border-white/15",
                      )}
                    >
                      {fuel.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Button onClick={run} loading={state.loading} className="w-full sm:w-auto">
            <Sparkles size={15} aria-hidden="true" />
            Build my indoor plan
          </Button>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader action={<Badge tone="neutral">Outdoor context</Badge>}>
              <CardTitle as="h2">Ventilation window</CardTitle>
              <CardDescription>
                {reading?.location?.name ? `${reading.location.name}${reading.source ? ` · ${reading.source}` : ""}` : "No outdoor reading available"}
              </CardDescription>
            </CardHeader>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-hairline bg-ink-900/60 p-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">Outdoor AQI</p>
                <p className={cn("mt-1 font-display text-[20px] font-semibold tabular-nums", category?.style?.text ?? "text-slate-300")}>
                  {reading?.aqi !== undefined && reading?.aqi !== null ? Math.round(reading.aqi) : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-hairline bg-ink-900/60 p-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">PM2.5</p>
                <p className="mt-1 font-display text-[20px] font-semibold tabular-nums text-white">
                  {formatNumber(reading?.pollutants?.pm2_5)}
                </p>
              </div>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-slate-300">
              {outdoorHint ||
                "When outdoor PM2.5 is high, keep windows closed during peak traffic hours and ventilate briefly when readings drop."}
            </p>
          </Card>

          {state.loading ? (
            <LoadingBlock label="Assessing your home" />
          ) : result ? (
            <>
              <Card>
                <CardHeader action={<Badge tone="aurora">{result.score ?? "—"}/100</Badge>}>
                  <CardTitle as="h2">Indoor air score</CardTitle>
                  <CardDescription>{result.summary}</CardDescription>
                </CardHeader>
                {result.immediate ? (
                  <div className="mt-3 rounded-xl border border-moderate/25 bg-moderate/[0.07] p-3 text-[11.5px] leading-relaxed text-moderate/90" role="status">
                    {result.immediate}
                  </div>
                ) : null}
              </Card>

              {groups.map((group) => {
                const Icon = ICONS[group.key] ?? ICONS.general;
                return (
                  <Card key={group.key}>
                    <CardHeader action={<Icon size={15} className="text-aurora-300" aria-hidden="true" />}>
                      <CardTitle as="h2">{group.label}</CardTitle>
                    </CardHeader>
                    <ul className="mt-3 space-y-2.5">
                      {(group.items ?? []).map((item) => (
                        <li key={item.title} className="rounded-xl border border-hairline bg-ink-900/50 p-3.5">
                          <p className="text-[12.5px] font-medium text-slate-100">{item.title}</p>
                          <p className="mt-1 text-[11.5px] leading-relaxed text-slate-300">{item.detail}</p>
                          {item.cost ? (
                            <p className="mt-1.5 text-[10.5px] uppercase tracking-wider text-slate-400">{item.cost}</p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </Card>
                );
              })}
            </>
          ) : (
            <Card>
              <CardTitle as="h2">No assessment yet</CardTitle>
              <CardDescription>
                Complete the two steps and AirAware will prioritise actions for your home — starting with the cheapest
                and most effective.
              </CardDescription>
            </Card>
          )}

          <DataNote tone="warning">
            Guidance is general and does not diagnose illness. If someone in the home has asthma or another respiratory
            condition, follow their clinician&apos;s advice.
          </DataNote>
        </div>
      </div>
    </div>
  );
}

export default IndoorAir;
