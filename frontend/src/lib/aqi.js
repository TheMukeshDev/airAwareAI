/**
 * AQI classification helpers.
 *
 * AirAware reports pollutant concentrations and AQI side by side, and always
 * labels which scale is being shown. Indian National AQI (CPCB) and US AQI are
 * different scales and must never be merged into a single unlabelled number.
 */

const US_AQI_BANDS = [
  { max: 50, label: "Good", tone: "good", health: "Air quality is satisfactory." },
  { max: 100, label: "Moderate", tone: "moderate", health: "Acceptable; sensitive groups may notice effects." },
  { max: 150, label: "Unhealthy for sensitive groups", tone: "poor", health: "Sensitive groups should limit prolonged outdoor exertion." },
  { max: 200, label: "Unhealthy", tone: "verypoor", health: "Everyone may begin to experience health effects." },
  { max: 300, label: "Very unhealthy", tone: "severe", health: "Health alert: avoid outdoor exertion." },
  { max: Infinity, label: "Hazardous", tone: "severe", health: "Emergency conditions: stay indoors where possible." },
];

const INDIA_AQI_BANDS = [
  { max: 50, label: "Good", tone: "good", health: "Minimal impact." },
  { max: 100, label: "Satisfactory", tone: "good", health: "Minor breathing discomfort for sensitive people." },
  { max: 200, label: "Moderate", tone: "moderate", health: "Breathing discomfort for people with lung or heart disease." },
  { max: 300, label: "Poor", tone: "poor", health: "Breathing discomfort on prolonged exposure." },
  { max: 400, label: "Very Poor", tone: "verypoor", health: "Respiratory illness on prolonged exposure." },
  { max: Infinity, label: "Severe", tone: "severe", health: "Affects healthy people; serious impact for sensitive groups." },
];

const TONE_STYLES = {
  good: {
    text: "text-good",
    bg: "bg-good/12",
    border: "border-good/35",
    dot: "bg-good",
    hex: "#34d399",
  },
  moderate: {
    text: "text-moderate",
    bg: "bg-moderate/12",
    border: "border-moderate/35",
    dot: "bg-moderate",
    hex: "#f5c542",
  },
  poor: {
    text: "text-poor",
    bg: "bg-poor/12",
    border: "border-poor/35",
    dot: "bg-poor",
    hex: "#fb923c",
  },
  verypoor: {
    text: "text-verypoor",
    bg: "bg-verypoor/12",
    border: "border-verypoor/35",
    dot: "bg-verypoor",
    hex: "#f87171",
  },
  severe: {
    text: "text-severe",
    bg: "bg-severe/12",
    border: "border-severe/35",
    dot: "bg-severe",
    hex: "#c084fc",
  },
};

export const AQI_TONES = TONE_STYLES;

export function classifyAqi(value, scale = "us") {
  const numeric = Number(value);
  if (value === null || value === undefined || Number.isNaN(numeric)) {
    return {
      value: null,
      label: "Unavailable",
      tone: "muted",
      health: "No reading available for this station right now.",
      scale,
      style: {
        text: "text-slate-400",
        bg: "bg-white/5",
        border: "border-white/10",
        dot: "bg-slate-500",
        hex: "#7f93a6",
      },
    };
  }
  const bands = scale === "india" ? INDIA_AQI_BANDS : US_AQI_BANDS;
  const band = bands.find((entry) => numeric <= entry.max) ?? bands[bands.length - 1];
  return { value: numeric, scale, ...band, style: TONE_STYLES[band.tone] };
}



export const POLLUTANTS = [
  { key: "pm2_5", label: "PM2.5", unit: "µg/m³", decimals: 1, note: "Fine particles" },
  { key: "pm10", label: "PM10", unit: "µg/m³", decimals: 0, note: "Coarse particles" },
  { key: "nitrogen_dioxide", label: "NO₂", unit: "µg/m³", decimals: 1, note: "Traffic & combustion" },
  { key: "ozone", label: "O₃", unit: "µg/m³", decimals: 1, note: "Photochemical smog" },
  { key: "sulphur_dioxide", label: "SO₂", unit: "µg/m³", decimals: 1, note: "Fuel burning" },
  { key: "carbon_monoxide", label: "CO", unit: "µg/m³", decimals: 0, note: "Incomplete combustion" },
];

export function pollutantTone(value) {
  if (value === null || value === undefined) return "muted";
  const numeric = Number(value);
  if (numeric <= 12) return "good";
  if (numeric <= 35) return "moderate";
  if (numeric <= 55) return "poor";
  if (numeric <= 150) return "verypoor";
  return "severe";
}

export function aqiScaleLabel(scale = "us") {
  return scale === "india" ? "Indian National AQI (CPCB)" : "US AQI";
}
