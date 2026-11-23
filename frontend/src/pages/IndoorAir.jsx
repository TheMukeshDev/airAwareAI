import { useState } from "react";
import toast from "react-hot-toast";
import { Sparkles } from "lucide-react";
import { PageHeader } from "../components/common/PageHeader";
import { Button } from "../components/common/Button";
import { Badge } from "../components/common/Badge";
import { DataNote } from "../components/common/DataNote";
import { useAuth } from "../context/AuthContext";
import { useAirQuality, useUserCoords } from "../hooks/useAirQuality";
import { indoorApi, apiError } from "../services/api";
import { classifyAqi } from "../lib/aqi";
import { IndoorSourcesCard } from "../components/indoor/IndoorSourcesCard";
import { IndoorVentilationCard } from "../components/indoor/IndoorVentilationCard";
import { OutdoorContextCard } from "../components/indoor/OutdoorContextCard";
import { IndoorAssessment } from "../components/indoor/IndoorAssessment";

function toggleItem(items, key) {
  return items.includes(key) ? items.filter((item) => item !== key) : [...items, key];
}

export default function IndoorAir() {
  const { user } = useAuth();
  const coords = useUserCoords(user);
  const { data: reading } = useAirQuality(coords);
  const [sources, setSources] = useState([]);
  const [ventilation, setVentilation] = useState([]);
  const [fuel, setFuel] = useState("");
  const [state, setState] = useState({ data: null, loading: false });
  const category = reading?.scale ? classifyAqi(reading?.aqi, reading.scale) : null;

  const assess = async () => {
    if (!sources.length && !ventilation.length && !fuel) {
      toast.error("Select at least one source, ventilation option, or cooking fuel.");
      return;
    }
    setState({ data: null, loading: true });
    try {
      const response = await indoorApi.create({ sources, ventilation, cooking_fuel: fuel || null });
      setState({ data: response.assessment ?? response, loading: false });
      toast.success("Indoor assessment ready.");
    } catch (error) {
      toast.error(apiError(error, "Could not run the indoor assessment."));
      setState({ data: null, loading: false });
    }
  };

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
          <IndoorSourcesCard selected={sources} onToggle={(items, key) => setSources(toggleItem(items, key))} />
          <IndoorVentilationCard
            selected={ventilation}
            fuel={fuel}
            onToggle={(items, key) => setVentilation(toggleItem(items, key))}
            onFuel={setFuel}
          />
          <Button onClick={assess} loading={state.loading} className="w-full sm:w-auto">
            <Sparkles size={15} aria-hidden="true" />
            Build my indoor plan
          </Button>
        </div>
        <div className="space-y-4">
          <OutdoorContextCard reading={reading} category={category} />
          <IndoorAssessment assessment={state.data} loading={state.loading} />
          <DataNote tone="warning">
            Guidance is general and does not diagnose illness. If someone in the home has asthma or another respiratory
            condition, follow their clinician's advice.
          </DataNote>
        </div>
      </div>
    </div>
  );
}
