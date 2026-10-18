import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Filter, MapPin, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  EventFilters,
  EventType,
  SourceKind,
  VerificationStatus,
  WeatherEvent,
} from "@/types";
import { EVENT_TYPE_LABEL, LOCATION_TREE } from "@/data/mockEvents";
import { VERIFICATION_LABEL } from "@/components/hs/primitives";
import { StateScreen } from "@/components/hs/states";
import {
  DEFAULT_FILTERS,
  DEMO_TODAY,
  istParts,
  SOURCE_CATEGORY,
  activeChips,
  activeFilterCount,
  filterStore,
  useEventFilters,
} from "./filters";

/** PS 26069 event categories first, in the order the problem statement lists them. */
const PS_TYPES: EventType[] = [
  "heavy_rainfall",
  "thunderstorm",
  "flood",
  "heatwave",
  "fog",
  "dust_storm",
  "strong_wind",
];
const PS_TYPE_LABEL: Partial<Record<EventType, string>> = {
  heavy_rainfall: "Rainfall",
  thunderstorm: "Thunderstorm",
  flood: "Flooding",
  heatwave: "Heatwave",
  fog: "Fog",
  dust_storm: "Dust Storm",
  strong_wind: "Strong Wind",
};
export const typeLabel = (t: string) =>
  PS_TYPE_LABEL[t as EventType] ?? EVENT_TYPE_LABEL[t as EventType] ?? t;

const DATE_OPTS = [
  { value: "all", label: "Any date" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "custom", label: "Custom range" },
];

function Sel<T extends string>({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-sm border border-border bg-panel-raised/60 pl-2 text-[11px]",
        disabled && "opacity-50",
      )}
    >
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className={cn(
          "h-full max-w-[150px] cursor-pointer bg-transparent pr-1 outline-hidden",
          value !== "all" && value !== "0" ? "text-primary" : "text-foreground",
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-popover">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex h-7 items-center gap-1.5 rounded-sm border border-border bg-panel-raised/60 px-2 text-[11px]">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
const inputCls = "h-full bg-transparent text-[11px] outline-hidden [color-scheme:dark]";

/**
 * PS 26069 filter bar. Search applies instantly; the structured filters are staged
 * and committed with Apply so the map, stream, table and KPIs update together.
 */
export function EventFilterBar({
  count,
  total,
  compact,
  events,
}: {
  count: number;
  total: number;
  compact?: boolean;
  events: WeatherEvent[];
}) {
  const [f, set] = useEventFilters();
  const [draft, setDraft] = useState<EventFilters>(f);
  const [more, setMore] = useState(false);
  useEffect(() => setDraft(f), [f]);
  const d = (patch: Partial<EventFilters>) => setDraft((x) => ({ ...x, ...patch }));
  const dirty = useMemo(
    () => (Object.keys(f) as (keyof EventFilters)[]).some((k) => k !== "q" && f[k] !== draft[k]),
    [f, draft],
  );
  const chips = activeChips(f, typeLabel);

  const uniq = (values: string[]) => Array.from(new Set(values.filter(Boolean))).sort();
  const states = uniq([...Object.keys(LOCATION_TREE), ...events.map((event) => event.state ?? "")]);
  const districts =
    draft.state === "all"
      ? [
          ...Object.values(LOCATION_TREE).flatMap((x) => Object.keys(x)),
          ...events.map((event) => event.district ?? ""),
        ]
      : [
          ...Object.keys(LOCATION_TREE[draft.state] ?? {}),
          ...events
            .filter((event) => event.state === draft.state)
            .map((event) => event.district ?? ""),
        ];
  const cities =
    draft.state === "all"
      ? [
          ...Object.values(LOCATION_TREE).flatMap((x) => Object.values(x).flat()),
          ...events.map((event) => event.location),
        ]
      : draft.district === "all"
        ? [
            ...Object.values(LOCATION_TREE[draft.state] ?? {}).flat(),
            ...events.filter((event) => event.state === draft.state).map((event) => event.location),
          ]
        : [
            ...(LOCATION_TREE[draft.state]?.[draft.district] ?? []),
            ...events
              .filter((event) => event.state === draft.state && event.district === draft.district)
              .map((event) => event.location),
          ];
  const eventTypes = uniq(events.map((event) => event.type));
  const today = events.some((event) => event.origin === "backend")
    ? istParts(new Date().toISOString()).date
    : DEMO_TODAY;

  const apply = () => set({ ...draft, q: f.q });
  const reset = () => filterStore.reset();

  return (
    <div className="space-y-1.5 rounded-md border border-border bg-panel px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <label className="flex h-7 min-w-[180px] flex-1 items-center gap-2 rounded-sm border border-border bg-panel-raised/60 px-2 sm:max-w-xs">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={f.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Search events, ID, city, district…"
            className="w-full bg-transparent text-[12px] outline-hidden placeholder:text-muted-foreground"
          />
        </label>
        <Sel
          label="Date"
          value={draft.datePreset}
          onChange={(v) => d({ datePreset: v })}
          options={DATE_OPTS}
        />
        {draft.datePreset === "custom" && (
          <>
            <Field label="From">
              <input
                type="date"
                aria-label="Start date"
                value={draft.dateFrom}
                max={draft.dateTo || today}
                onChange={(e) => d({ dateFrom: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                aria-label="End date"
                value={draft.dateTo}
                min={draft.dateFrom || undefined}
                onChange={(e) => d({ dateTo: e.target.value })}
                className={inputCls}
              />
            </Field>
          </>
        )}
        <Sel
          label="Event"
          value={draft.type}
          onChange={(v) => d({ type: v })}
          options={[
            { value: "all", label: "All events" },
            ...PS_TYPES.map((t) => ({ value: t, label: typeLabel(t) })),
            { value: "cyclone", label: "Cyclone (other)" },
            ...eventTypes
              .filter((type) => !PS_TYPES.includes(type as EventType) && type !== "cyclone")
              .map((type) => ({ value: type, label: typeLabel(type) })),
          ]}
        />
        <Sel
          label="State"
          value={draft.state}
          onChange={(v) => d({ state: v, district: "all", city: "all" })}
          options={[
            { value: "all", label: "All India" },
            ...states.map((s) => ({ value: s, label: s })),
          ]}
        />
        {!compact && (
          <Sel
            label="District"
            value={draft.district}
            onChange={(v) => d({ district: v, city: "all" })}
            options={[
              { value: "all", label: "All" },
              ...uniq(districts).map((s) => ({ value: s, label: s })),
            ]}
          />
        )}
        <Sel
          label="City"
          value={draft.city}
          onChange={(v) => d({ city: v })}
          options={[
            { value: "all", label: "All" },
            ...uniq(cities).map((s) => ({ value: s, label: s })),
          ]}
        />
        <Sel
          label="Verification"
          value={draft.verification}
          onChange={(v) => d({ verification: v })}
          options={[
            { value: "all", label: "All" },
            ...(Object.entries(VERIFICATION_LABEL) as [VerificationStatus, string][]).map(
              ([value, label]) => ({ value, label }),
            ),
          ]}
        />
        <button
          onClick={() => setMore((m) => !m)}
          aria-expanded={more}
          className={cn(
            "flex h-7 items-center gap-1 rounded-sm border border-border px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground",
            more && "bg-accent text-foreground",
          )}
        >
          <SlidersHorizontal className="h-3 w-3" /> More filters
        </button>
        <button
          onClick={apply}
          disabled={!dirty}
          className="flex h-7 items-center gap-1 rounded-sm bg-primary px-2.5 text-[11px] font-medium text-primary-foreground disabled:opacity-40"
        >
          <Check className="h-3 w-3" /> Apply filters
        </button>
        <button
          onClick={reset}
          className="flex h-7 items-center gap-1 rounded-sm px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" /> Reset filters
        </button>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {count}/{total} events · LIVE API
        </span>
      </div>

      {more && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Additional filters
          </span>
          <Field label="Time (IST)">
            <input
              type="time"
              aria-label="Time from"
              value={draft.timeFrom}
              onChange={(e) => d({ timeFrom: e.target.value })}
              className={inputCls}
            />
            <span className="text-muted-foreground">–</span>
            <input
              type="time"
              aria-label="Time to"
              value={draft.timeTo}
              onChange={(e) => d({ timeTo: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="GPS">
            <MapPin className="h-3 w-3 text-muted-foreground" />
            <input
              inputMode="decimal"
              aria-label="Latitude"
              placeholder="Lat"
              value={draft.gpsLat}
              onChange={(e) => d({ gpsLat: e.target.value })}
              className={cn(inputCls, "w-14")}
            />
            <input
              inputMode="decimal"
              aria-label="Longitude"
              placeholder="Lng"
              value={draft.gpsLng}
              onChange={(e) => d({ gpsLng: e.target.value })}
              className={cn(inputCls, "w-14")}
            />
            <select
              aria-label="Radius"
              value={draft.gpsRadiusKm}
              onChange={(e) => d({ gpsRadiusKm: e.target.value })}
              className="h-full bg-transparent outline-hidden"
            >
              <option value="" className="bg-popover">
                Radius
              </option>
              {["25", "50", "100", "250", "500"].map((r) => (
                <option key={r} value={r} className="bg-popover">
                  {r} km
                </option>
              ))}
            </select>
          </Field>
          <Sel
            label="Source"
            value={draft.sourceCategory}
            onChange={(v) => d({ sourceCategory: v })}
            options={[
              { value: "all", label: "All sources" },
              ...Object.entries(SOURCE_CATEGORY).map(([value, c]) => ({ value, label: c.label })),
            ]}
          />
          <Sel
            label="Media"
            value={draft.media}
            onChange={(v) => d({ media: v })}
            options={[
              { value: "all", label: "All" },
              { value: "text", label: "Text" },
              { value: "photo", label: "Photo" },
              { value: "video", label: "Video" },
            ]}
          />
          <Sel
            label="Feed"
            value={draft.source}
            onChange={(v) => d({ source: v })}
            options={[
              { value: "all", label: "All" },
              ...(
                ["IMD", "Citizen", "News/RSS", "Satellite", "Social", "Sensor"] as SourceKind[]
              ).map((s) => ({ value: s, label: s })),
            ]}
          />
          <Sel
            label="Severity"
            value={draft.severity}
            onChange={(v) => d({ severity: v })}
            options={[
              { value: "all", label: "All" },
              ...["critical", "high", "medium", "low"].map((s) => ({
                value: s,
                label: s[0]!.toUpperCase() + s.slice(1),
              })),
            ]}
          />
          <Sel
            label="Confidence"
            value={String(draft.minConfidence)}
            onChange={(v) => d({ minConfidence: Number(v) })}
            options={[
              { value: "0", label: "Any" },
              { value: "0.6", label: "≥ 60%" },
              { value: "0.75", label: "≥ 75%" },
              { value: "0.85", label: "≥ 85%" },
              { value: "0.9", label: "≥ 90%" },
            ]}
          />
          <span className="text-[10px] text-muted-foreground">
            Source and media are extra filters from the PS data description · “Today” = demo clock{" "}
            {DEMO_TODAY}
          </span>
        </div>
      )}

      {chips.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-1 border-t border-border pt-1.5"
          aria-label="Active filters"
        >
          <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Filter className="h-3 w-3" /> Filtered results
          </span>
          {chips.map((c) => (
            <button
              key={c.key}
              onClick={() => set(c.clear)}
              aria-label={`Remove filter ${c.label}`}
              className="flex h-6 items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 px-2 text-[11px] capitalize text-primary hover:bg-primary/20"
            >
              {c.label} <X className="h-3 w-3" />
            </button>
          ))}
          <button
            onClick={() => set({ ...DEFAULT_FILTERS, q: f.q })}
            className="h-6 px-2 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

/** Shown wherever filtered results are empty. */
export function NoFilterResults({ compact }: { compact?: boolean }) {
  const [f] = useEventFilters();
  if (activeFilterCount(f) === 0) return null;
  return (
    <StateScreen
      kind="noResults"
      compact={!!compact}
      title="No weather events match the selected filters."
      description="Try a wider date range, another location or a different verification status."
      actions={[{ label: "Clear filters", onClick: () => filterStore.reset() }]}
    />
  );
}
