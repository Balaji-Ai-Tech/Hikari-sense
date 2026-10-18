export type MapLayerId =
  | "events"
  | "weather"
  | "officialAlerts"
  | "satellite"
  | "citizen"
  | "official"
  | "rainfall"
  | "flood"
  | "heat"
  | "wind"
  | "cyclone"
  | "evidence";

export const MAP_LAYERS: { id: MapLayerId; label: string; swatch: string }[] = [
  { id: "events", label: "Weather Events", swatch: "bg-primary" },
  { id: "weather", label: "Open-Meteo Conditions", swatch: "bg-cyan-400" },
  { id: "officialAlerts", label: "Official CAP Alerts", swatch: "bg-sev-critical" },
  { id: "satellite", label: "NASA FIRMS Detections", swatch: "bg-orange-400" },
  { id: "citizen", label: "Citizen Reports", swatch: "bg-chart-3" },
  { id: "official", label: "Official Observations", swatch: "bg-info" },
  { id: "rainfall", label: "Rainfall", swatch: "bg-chart-2" },
  { id: "flood", label: "Flood / Inundation", swatch: "bg-chart-1" },
  { id: "heat", label: "Heat", swatch: "bg-sev-high" },
  { id: "wind", label: "Wind", swatch: "bg-muted-foreground" },
  { id: "cyclone", label: "Cyclone Tracks", swatch: "bg-sev-critical" },
  { id: "evidence", label: "Review Evidence", swatch: "bg-primary" },
];

export const DEFAULT_LAYERS: Record<MapLayerId, boolean> = {
  events: true,
  weather: true,
  officialAlerts: true,
  satellite: true,
  citizen: false,
  official: false,
  rainfall: false,
  flood: false,
  heat: false,
  wind: false,
  cyclone: false,
  evidence: false,
};

// Map-canvas palette mirrors the design tokens with concrete colors.
export const MAP_COLORS = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#22c55e",
  primary: "#38bdf8",
  info: "#60a5fa",
  citizen: "#4ade80",
  rain: "#3b82f6",
  flood: "#22d3ee",
  heat: "#f97316",
  wind: "#cbd5e1",
};
