import { useSyncExternalStore } from "react";
import type { EventFilters, SourceKind, WeatherEvent } from "@/types";
import { DEMO_NOW } from "@/data/mockEvents";

export const DEFAULT_FILTERS: EventFilters = {
  q: "",
  type: "all",
  severity: "all",
  verification: "all",
  state: "all",
  source: "all",
  minConfidence: 0,
  withinMinutes: 0,
  datePreset: "all",
  dateFrom: "",
  dateTo: "",
  timeFrom: "",
  timeTo: "",
  district: "all",
  city: "all",
  gpsLat: "",
  gpsLng: "",
  gpsRadiusKm: "",
  sourceCategory: "all",
  media: "all",
};

// ---------- PS 26069 helpers (pure; map 1:1 to future backend query params) ----------
const IST_MS = 5.5 * 3600000;
/** IST calendar date (YYYY-MM-DD) and time (HH:MM) of an ISO timestamp. */
export function istParts(iso: string) {
  const s = new Date(new Date(iso).getTime() + IST_MS).toISOString();
  return { date: s.slice(0, 10), time: s.slice(11, 16) };
}
const shiftDay = (date: string, days: number) =>
  new Date(new Date(date + "T00:00:00Z").getTime() + days * 86400000).toISOString().slice(0, 10);
/** "Today" is the demo clock's date, not the browser's. */
export const DEMO_TODAY = istParts(DEMO_NOW).date;

export function dateWindow(
  f: EventFilters,
  today = DEMO_TODAY,
): { from: string; to: string } | null {
  switch (f.datePreset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = shiftDay(today, -1);
      return { from: y, to: y };
    }
    case "7d":
      return { from: shiftDay(today, -6), to: today };
    case "30d":
      return { from: shiftDay(today, -29), to: today };
    case "custom":
      return f.dateFrom || f.dateTo
        ? { from: f.dateFrom || "0000-01-01", to: f.dateTo || "9999-12-31" }
        : null;
    default:
      return null;
  }
}

/** PS 26069 source categories → demo source kinds. */
export const SOURCE_CATEGORY: Record<
  Exclude<EventFilters["sourceCategory"], "all">,
  { label: string; kinds: SourceKind[] }
> = {
  social: { label: "Social Media", kinds: ["Social"] },
  dataset: { label: "Public Dataset", kinds: ["IMD", "Satellite"] },
  website: { label: "Website", kinds: ["News/RSS"] },
  api: { label: "API", kinds: ["Sensor"] },
  citizen: { label: "Citizen Report", kinds: ["Citizen"] },
};

export function kmBetween(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(r(bLat - aLat) / 2) ** 2 +
    Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLng - aLng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Backend-ready query parameters for the active filters (not sent anywhere yet). */
export function toQueryParams(f: EventFilters) {
  const w = dateWindow(f);
  const p: Record<string, string> = {};
  if (w) {
    p["date_from"] = w.from;
    p["date_to"] = w.to;
  }
  if (f.timeFrom) p["time_from"] = f.timeFrom;
  if (f.timeTo) p["time_to"] = f.timeTo;
  if (f.type !== "all") p["event_type"] = f.type;
  if (f.state !== "all") p["state"] = f.state;
  if (f.district !== "all") p["district"] = f.district;
  if (f.city !== "all") p["city"] = f.city;
  if (f.gpsLat && f.gpsLng && f.gpsRadiusKm) {
    p["latitude"] = f.gpsLat;
    p["longitude"] = f.gpsLng;
    p["radius_km"] = f.gpsRadiusKm;
  }
  if (f.verification !== "all") p["verification_status"] = f.verification;
  if (f.sourceCategory !== "all") p["source"] = f.sourceCategory;
  if (f.media !== "all") p["media_type"] = f.media;
  return p;
}

// Tiny shared store so header search, map, stream and KPIs share one filter state.
let state: EventFilters = DEFAULT_FILTERS;
const subs = new Set<() => void>();
export const filterStore = {
  get: () => state,
  set: (patch: Partial<EventFilters>) => {
    state = { ...state, ...patch };
    subs.forEach((f) => f());
  },
  reset: () => {
    state = DEFAULT_FILTERS;
    subs.forEach((f) => f());
  },
  subscribe: (f: () => void) => {
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  },
};
export function useEventFilters() {
  const f = useSyncExternalStore(filterStore.subscribe, filterStore.get, () => DEFAULT_FILTERS);
  return [f, filterStore.set, filterStore.reset] as const;
}

export function activeFilterCount(f: EventFilters) {
  return activeChips(f).length + (f.q.trim() ? 1 : 0);
}

const fmtDay = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });

/** Human-readable active filters; `clear` is the patch that removes that one filter. */
export function activeChips(f: EventFilters, typeLabel: (t: string) => string = (t) => t) {
  const chips: { key: string; label: string; clear: Partial<EventFilters> }[] = [];
  const presetLabel = {
    today: "Today",
    yesterday: "Yesterday",
    "7d": "Last 7 days",
    "30d": "Last 30 days",
  } as const;
  if (f.datePreset !== "all") {
    const w = dateWindow(f);
    const label =
      f.datePreset === "custom"
        ? w
          ? `${f.dateFrom ? fmtDay(f.dateFrom) : "…"} – ${f.dateTo ? fmtDay(f.dateTo) : "…"}`
          : null
        : presetLabel[f.datePreset];
    if (label)
      chips.push({ key: "date", label, clear: { datePreset: "all", dateFrom: "", dateTo: "" } });
  }
  if (f.timeFrom || f.timeTo)
    chips.push({
      key: "time",
      label: `${f.timeFrom || "00:00"}–${f.timeTo || "23:59"} IST`,
      clear: { timeFrom: "", timeTo: "" },
    });
  if (f.withinMinutes)
    chips.push({
      key: "within",
      label: `Last ${f.withinMinutes} min`,
      clear: { withinMinutes: 0 },
    });
  if (f.type !== "all")
    chips.push({ key: "type", label: typeLabel(f.type), clear: { type: "all" } });
  if (f.state !== "all")
    chips.push({
      key: "state",
      label: f.state,
      clear: { state: "all", district: "all", city: "all" },
    });
  if (f.district !== "all")
    chips.push({
      key: "district",
      label: `${f.district} (district)`,
      clear: { district: "all", city: "all" },
    });
  if (f.city !== "all") chips.push({ key: "city", label: f.city, clear: { city: "all" } });
  if (f.gpsLat && f.gpsLng && f.gpsRadiusKm)
    chips.push({
      key: "gps",
      label: `${f.gpsRadiusKm} km of ${f.gpsLat}, ${f.gpsLng}`,
      clear: { gpsLat: "", gpsLng: "", gpsRadiusKm: "" },
    });
  if (f.verification !== "all")
    chips.push({
      key: "ver",
      label: f.verification.replace("_", " "),
      clear: { verification: "all" },
    });
  if (f.sourceCategory !== "all")
    chips.push({
      key: "srcc",
      label: SOURCE_CATEGORY[f.sourceCategory].label,
      clear: { sourceCategory: "all" },
    });
  if (f.source !== "all")
    chips.push({ key: "src", label: `Source: ${f.source}`, clear: { source: "all" } });
  if (f.media !== "all")
    chips.push({
      key: "media",
      label: f.media[0]!.toUpperCase() + f.media.slice(1),
      clear: { media: "all" },
    });
  if (f.severity !== "all")
    chips.push({ key: "sev", label: `Severity: ${f.severity}`, clear: { severity: "all" } });
  if (f.minConfidence)
    chips.push({
      key: "conf",
      label: `Conf ≥ ${Math.round(f.minConfidence * 100)}%`,
      clear: { minConfidence: 0 },
    });
  return chips;
}

export function applyFilters(events: WeatherEvent[], f: EventFilters) {
  const backendData = events.some((event) => event.origin === "backend");
  const now = backendData ? Date.now() : new Date(DEMO_NOW).getTime();
  const today = backendData ? istParts(new Date().toISOString()).date : DEMO_TODAY;
  const q = f.q.trim().toLowerCase();
  const win = dateWindow(f, today);
  const cat = f.sourceCategory === "all" ? null : SOURCE_CATEGORY[f.sourceCategory].kinds;
  const gLat = parseFloat(f.gpsLat);
  const gLng = parseFloat(f.gpsLng);
  const gR = parseFloat(f.gpsRadiusKm);
  const gps = Number.isFinite(gLat) && Number.isFinite(gLng) && gR > 0;
  return events.filter((e) => {
    const t = istParts(e.reportedAt);
    return (
      (!win || (t.date >= win.from && t.date <= win.to)) &&
      (!f.timeFrom || t.time >= f.timeFrom) &&
      (!f.timeTo || t.time <= f.timeTo) &&
      (f.district === "all" || e.district === f.district) &&
      (f.city === "all" || e.location === f.city) &&
      (!gps || (e.lat !== null && e.lng !== null && kmBetween(gLat, gLng, e.lat, e.lng) <= gR)) &&
      (!cat || e.sourceKinds.some((k) => cat.includes(k))) &&
      (f.media === "all" ||
        (f.media === "photo" && e.images > 0) ||
        (f.media === "video" && e.videos > 0) ||
        (f.media === "text" && e.images === 0 && e.videos === 0)) &&
      (f.type === "all" || e.type === f.type) &&
      (f.severity === "all" || e.severity === f.severity) &&
      (f.verification === "all" || e.verification === f.verification) &&
      (f.state === "all" || e.state === f.state) &&
      (f.source === "all" || e.sourceKinds.includes(f.source)) &&
      e.confidence >= f.minConfidence &&
      (f.withinMinutes === 0 ||
        now - new Date(e.reportedAt).getTime() <= f.withinMinutes * 60000) &&
      (!q ||
        [e.id, e.title, e.location, e.district ?? "", e.state ?? ""].some((s) =>
          s.toLowerCase().includes(q),
        ))
    );
  });
}

// ---------- centralized pipeline: RAW → FILTER → SORT → PAGINATE ----------
export type EventSort =
  "latest" | "oldest" | "sev_desc" | "sev_asc" | "confidence" | "reports" | "area";
export const SORT_LABEL: Record<EventSort, string> = {
  latest: "Latest",
  oldest: "Oldest",
  sev_desc: "Highest severity",
  sev_asc: "Lowest severity",
  confidence: "Highest confidence",
  reports: "Most reports",
  area: "Largest affected area",
};
const SEV_RANK = { critical: 3, high: 2, medium: 1, low: 0 } as const;

export function sortEvents(events: WeatherEvent[], sort: EventSort) {
  const byTime = (a: WeatherEvent, b: WeatherEvent) =>
    b.reportedAt.localeCompare(a.reportedAt) || a.id.localeCompare(b.id);
  const cmp: Record<EventSort, (a: WeatherEvent, b: WeatherEvent) => number> = {
    latest: byTime,
    oldest: (a, b) => -byTime(a, b),
    sev_desc: (a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || byTime(a, b),
    sev_asc: (a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || byTime(a, b),
    confidence: (a, b) => b.confidence - a.confidence || byTime(a, b),
    reports: (a, b) => b.reports - a.reports || byTime(a, b),
    area: (a, b) => b.affectedAreaKm2 - a.affectedAreaKm2 || byTime(a, b),
  };
  return [...events].sort(cmp[sort]);
}

export function eventPipeline(
  raw: WeatherEvent[],
  f: EventFilters,
  sort: EventSort,
  page: number,
  pageSize: number,
) {
  const filtered = applyFilters(raw, f);
  const sorted = sortEvents(filtered, sort);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const p = Math.min(Math.max(1, page), pages);
  return {
    filtered,
    sorted,
    page: p,
    pages,
    total: sorted.length,
    from: sorted.length ? (p - 1) * pageSize + 1 : 0,
    to: Math.min(p * pageSize, sorted.length),
    rows: sorted.slice((p - 1) * pageSize, p * pageSize),
  };
}
