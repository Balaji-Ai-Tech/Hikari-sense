// DEMO DATA — every value is simulated and deterministic (no Math.random). No external API is connected.
export type HealthStatus = "SIMULATED" | "DEMO CONNECTOR" | "NOT CONNECTED" | "CONFIGURED";
export interface SourceHealth {
  id: string;
  name: string;
  category: string;
  connector: string;
  status: HealthStatus;
  lastUpdate: string;
  records: number;
  perMin: number;
  latencySec: number;
  errorRate: number;
  coverage: string;
}

export const SOURCE_HEALTH: SourceHealth[] = [
  {
    id: "SRC-IMD",
    name: "IMD",
    category: "Official observations",
    connector: "Demo feed (REST poll)",
    status: "SIMULATED",
    lastUpdate: "14:29",
    records: 60480,
    perMin: 42,
    latencySec: 1.2,
    errorRate: 0.004,
    coverage: "All India · AWS + radar",
  },
  {
    id: "SRC-SACHET",
    name: "SACHET",
    category: "Official alerts (CAP)",
    connector: "Demo CAP parser",
    status: "SIMULATED",
    lastUpdate: "14:28",
    records: 1728,
    perMin: 1.2,
    latencySec: 2.4,
    errorRate: 0.002,
    coverage: "All states",
  },
  {
    id: "SRC-MOSDAC",
    name: "MOSDAC",
    category: "Satellite",
    connector: "Demo product fetch",
    status: "DEMO CONNECTOR",
    lastUpdate: "14:25",
    records: 6912,
    perMin: 4.8,
    latencySec: 8.5,
    errorRate: 0.011,
    coverage: "Indian subcontinent",
  },
  {
    id: "SRC-INCOIS",
    name: "INCOIS",
    category: "Ocean services",
    connector: "Demo bulletin feed",
    status: "SIMULATED",
    lastUpdate: "14:15",
    records: 864,
    perMin: 0.6,
    latencySec: 3.1,
    errorRate: 0.006,
    coverage: "Coastal states",
  },
  {
    id: "SRC-FIRMS",
    name: "NASA FIRMS",
    category: "Satellite (thermal)",
    connector: "Demo API client",
    status: "DEMO CONNECTOR",
    lastUpdate: "14:20",
    records: 4320,
    perMin: 3,
    latencySec: 6.2,
    errorRate: 0.009,
    coverage: "All India",
  },
  {
    id: "SRC-GPM",
    name: "GPM IMERG",
    category: "Satellite precipitation",
    connector: "Not configured",
    status: "NOT CONNECTED",
    lastUpdate: "—",
    records: 0,
    perMin: 0,
    latencySec: 0,
    errorRate: 0,
    coverage: "—",
  },
  {
    id: "SRC-OPENMETEO",
    name: "Open-Meteo",
    category: "Weather API (forecast)",
    connector: "Credentials placeholder",
    status: "CONFIGURED",
    lastUpdate: "14:29",
    records: 31680,
    perMin: 22,
    latencySec: 0.8,
    errorRate: 0.003,
    coverage: "0.1° grid",
  },
  {
    id: "SRC-CITIZEN",
    name: "Citizen Reports",
    category: "Crowd",
    connector: "In-app demo submissions",
    status: "SIMULATED",
    lastUpdate: "14:30",
    records: 12960,
    perMin: 9,
    latencySec: 0.4,
    errorRate: 0.015,
    coverage: "Where users report",
  },
  {
    id: "SRC-NEWS",
    name: "News/RSS",
    category: "Media",
    connector: "Demo RSS reader",
    status: "SIMULATED",
    lastUpdate: "14:29",
    records: 8640,
    perMin: 6,
    latencySec: 4.6,
    errorRate: 0.021,
    coverage: "Regional outlets",
  },
  {
    id: "SRC-YOUTUBE",
    name: "YouTube",
    category: "Social video",
    connector: "Demo search client",
    status: "DEMO CONNECTOR",
    lastUpdate: "14:12",
    records: 2160,
    perMin: 1.5,
    latencySec: 9.8,
    errorRate: 0.064,
    coverage: "Public videos",
  },
];

export type Range = "1h" | "6h" | "24h";
const POINTS: Record<Range, { n: number; stepMin: number }> = {
  "1h": { n: 12, stepMin: 5 },
  "6h": { n: 24, stepMin: 15 },
  "24h": { n: 24, stepMin: 60 },
};

/** Stable pseudo-wave in [−1, 1] from integer inputs — same output every render. */
const wave = (i: number, seed: number) =>
  Math.sin(i * 0.9 + seed) * 0.6 + Math.sin(i * 2.3 + seed * 1.7) * 0.4;

export function healthHistory(range: Range, sources = SOURCE_HEALTH.filter((s) => s.perMin > 0)) {
  const { n, stepMin } = POINTS[range];
  const end = 14 * 60 + 30;
  return Array.from({ length: n }, (_, i) => {
    const m = (((end - (n - 1 - i) * stepMin) % 1440) + 1440) % 1440;
    const row: Record<string, number | string> = {
      t: `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
    };
    let thr = 0,
      err = 0;
    sources.forEach((s, k) => {
      row[s.name] = +(s.latencySec * (1 + 0.15 * wave(i, k + 1))).toFixed(2);
      thr += s.perMin * (1 + 0.2 * wave(i, k + 3));
      err += s.errorRate * (1 + 0.5 * wave(i, k + 5));
    });
    row["throughput"] = Math.round(thr);
    row["errors"] = +((err / sources.length) * 100).toFixed(2);
    return row;
  });
}

export const PIPELINE = [
  { stage: "Source", records: 130_000, latencyMs: 0 },
  { stage: "Connector", records: 129_400, latencyMs: 420 },
  { stage: "Ingestion", records: 129_100, latencyMs: 180 },
  { stage: "Kafka", records: 129_100, latencyMs: 35 },
  { stage: "Flink", records: 128_700, latencyMs: 260 },
  { stage: "AI Processing", records: 41_200, latencyMs: 940 },
  { stage: "Event Correlation", records: 3_421, latencyMs: 310 },
  { stage: "Verification", records: 3_421, latencyMs: 0 },
];
