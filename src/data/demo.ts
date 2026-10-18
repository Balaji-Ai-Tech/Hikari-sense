// DEMO DATA — deterministic aggregates for KPIs and charts.
import type { Metric } from "@/types";
export { DEMO_NOW, EVENT_TYPE_LABEL } from "./mockEvents";

export const demoMetrics: Metric[] = [
  {
    label: "Total Reports",
    value: "12,842",
    delta: "+12% today",
    up: true,
    spark: [8, 9, 9, 10, 11, 10, 12, 13, 14],
  },
  {
    label: "Live Events",
    value: "3,421",
    delta: "+8%",
    up: true,
    spark: [5, 6, 6, 7, 6, 7, 8, 8, 9],
  },
  {
    label: "Verified Events",
    value: "9,321",
    delta: "+10%",
    up: true,
    spark: [6, 7, 7, 8, 8, 9, 9, 10, 10],
  },
  {
    label: "Pending Verification",
    value: "2,381",
    delta: "-4%",
    up: false,
    spark: [9, 9, 8, 8, 9, 8, 7, 7, 7],
  },
  {
    label: "High Severity",
    value: "687",
    delta: "+32%",
    up: true,
    spark: [3, 3, 4, 4, 5, 6, 6, 7, 8],
  },
  {
    label: "Active Alerts",
    value: "15",
    delta: "+3",
    up: true,
    spark: [9, 10, 10, 11, 12, 12, 13, 14, 15],
  },
];

export const demoIngestion = Array.from({ length: 24 }, (_, h) => {
  const base = 380 + Math.round(220 * Math.sin((h / 24) * Math.PI * 2 - 1.2) + 260);
  return {
    hour: `${String(h).padStart(2, "0")}:00`,
    citizen: base,
    official: Math.round(base * 0.42 + (h % 5) * 12),
    media: Math.round(base * 0.25 + (h % 3) * 9),
  };
});

export const demoRainfallByRegion = [
  { region: "NW", actual: 412, normal: 468 },
  { region: "Central", actual: 905, normal: 842 },
  { region: "South", actual: 611, normal: 598 },
  { region: "East & NE", actual: 1088, normal: 1203 },
];

export const demoEventsByType = [
  { type: "Rainfall", count: 1240 },
  { type: "Flood", count: 610 },
  { type: "Thunderstorm", count: 720 },
  { type: "Heatwave", count: 380 },
  { type: "Wind", count: 210 },
  { type: "Fog", count: 120 },
  { type: "Dust", count: 96 },
  { type: "Cyclone", count: 45 },
];

export const demoVerificationTrend = Array.from({ length: 14 }, (_, d) => ({
  day: `Sep ${String(d + 1).padStart(2, "0")}`,
  verified: 520 + d * 18 + (d % 3) * 25,
  review: 210 - d * 4 + (d % 4) * 12,
  rejected: 40 + (d % 5) * 6,
  medianMin: 22 - Math.round(d * 0.7) + (d % 3),
}));

export const demoStateIntensity = [
  { state: "Telangana", events: 214, high: 38 },
  { state: "Tamil Nadu", events: 198, high: 31 },
  { state: "Maharashtra", events: 312, high: 44 },
  { state: "Karnataka", events: 176, high: 22 },
  { state: "Odisha", events: 164, high: 41 },
  { state: "Kerala", events: 151, high: 19 },
  { state: "Rajasthan", events: 122, high: 17 },
  { state: "Uttar Pradesh", events: 208, high: 26 },
];
