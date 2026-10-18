import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  alertsQuery,
  eventsQuery,
  officialAlertsQuery,
  reportsQuery,
  satelliteObservationsQuery,
  weatherObservationsQuery,
} from "@/hooks/useWeather";
import {
  deriveKpis,
  eventService,
  type OfficialAlertsResponse,
  type SatelliteObservationsResponse,
  type WeatherObservationResponse,
} from "@/services/api";
import { MetricCard, Panel } from "@/components/hs/primitives";
import type { LiveWeatherLocation, Severity, WeatherAlert, WeatherEvent } from "@/types";
import { MapLibreEventMap } from "@/features/map/MapLibreEventMap";
import { LiveWeatherPicker } from "@/features/map/LiveWeatherPicker";
import { activeFilterCount, applyFilters, useEventFilters } from "./filters";
import { useDemoStream } from "./useDemoStream";
import { AlertModal, AlertRow, EventDrawer, EventFilterBar, StreamList } from "./components";

const tones: Array<"primary" | Severity> = [
  "primary",
  "primary",
  "low",
  "medium",
  "critical",
  "high",
];

export function useCommandCenterData() {
  const queryClient = useQueryClient();
  const { data: events } = useSuspenseQuery(eventsQuery);
  const { data: alerts } = useSuspenseQuery(alertsQuery);
  const { data: reports } = useSuspenseQuery(reportsQuery);
  const weatherQuery = useQuery(weatherObservationsQuery);
  const officialAlertsResult = useQuery(officialAlertsQuery);
  const satelliteQuery = useQuery(satelliteObservationsQuery);
  const [filters, setFilters] = useEventFilters();
  useEffect(
    () =>
      eventService.subscribe((message) => {
        if (!message.type.startsWith("EVENT_") && message.type !== "REPORT_STATUS_CHANGED") return;
        void queryClient.invalidateQueries({ queryKey: ["events"] });
        if (message.event_id) {
          void queryClient.invalidateQueries({ queryKey: ["event", message.event_id] });
        }
        if (message.type === "REPORT_STATUS_CHANGED") {
          void queryClient.invalidateQueries({ queryKey: ["reports"] });
        }
      }),
    [queryClient],
  );
  const stream = useDemoStream(events);
  const filtered = useMemo(() => applyFilters(stream.visible, filters), [stream.visible, filters]);
  const filtering = activeFilterCount(filters) > 0;
  // KPIs always derive from the same events the map and stream show.
  const kpis = useMemo(
    () =>
      deriveKpis(filtered, alerts).map((m, i) => ({
        ...m,
        hint: filtering ? "filtered" : i === 5 ? "demo alerts" : "API derived",
      })),
    [filtered, alerts, filtering],
  );
  const activeAlerts = useMemo(() => alerts.filter((a) => a.status === "active"), [alerts]);
  const visibleIds = useMemo(() => new Set(filtered.map((e) => e.id)), [filtered]);
  const mapReports = useMemo(
    () =>
      reports.filter(
        (r) => r.sourceType === "citizen" && r.eventId !== null && visibleIds.has(r.eventId),
      ),
    [reports, visibleIds],
  );

  return {
    events,
    filtered,
    alerts: activeAlerts,
    reports: mapReports,
    weather: weatherQuery.data ?? null,
    weatherError: weatherQuery.error instanceof Error ? weatherQuery.error.message : null,
    weatherPending: weatherQuery.isPending,
    officialAlerts: officialAlertsResult.data ?? null,
    officialAlertsError:
      officialAlertsResult.error instanceof Error ? officialAlertsResult.error.message : null,
    officialAlertsPending: officialAlertsResult.isPending,
    satelliteObservations: satelliteQuery.data ?? null,
    satelliteError: satelliteQuery.error instanceof Error ? satelliteQuery.error.message : null,
    satellitePending: satelliteQuery.isPending,
    kpis,
    stream,
    filters,
    setFilters,
    filtering,
  };
}

export function KpiRow({
  kpis,
  onSeverity,
  severity,
}: {
  kpis: ReturnType<typeof useCommandCenterData>["kpis"];
  onSeverity?: (s: "high" | "all") => void;
  severity?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      {kpis.map((m, i) => (
        <MetricCard
          key={m.label}
          {...m}
          tone={tones[i] ?? "primary"}
          {...(i === 4 && onSeverity
            ? {
                onClick: () => onSeverity(severity === "high" ? "all" : "high"),
                active: severity === "high",
              }
            : {})}
        />
      ))}
    </div>
  );
}

export function OpsGrid({
  data,
  mapHeight = "h-[520px]",
}: {
  data: ReturnType<typeof useCommandCenterData>;
  mapHeight?: string;
}) {
  const [drawer, setDrawer] = useState<WeatherEvent | null>(null);
  const [focusId, setFocusId] = useState<string | undefined>();
  const [selectedWeatherLocation, setSelectedWeatherLocation] =
    useState<LiveWeatherLocation | null>(null);
  const [alert, setAlert] = useState<WeatherAlert | null>(null);
  const select = (e: WeatherEvent) => {
    setFocusId(e.id);
    setDrawer(e);
  };

  return (
    <>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px_300px] lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel
          title="National Event Map"
          actions={
            <span className="font-mono text-[10px] text-muted-foreground">
              {data.filtered.length} incidents · {data.weather?.items.length ?? 0} weather records
              {` · ${data.satelliteObservations?.total ?? 0} satellite observations`}
            </span>
          }
          bodyClassName="p-0"
        >
          <LiveWeatherPicker
            selected={selectedWeatherLocation}
            onSelect={setSelectedWeatherLocation}
          />
          <MapLibreEventMap
            events={data.filtered}
            weatherObservations={data.weather?.items ?? []}
            officialAlerts={data.officialAlerts?.items ?? []}
            satelliteObservations={data.satelliteObservations?.items ?? []}
            reports={data.reports}
            selectedId={focusId}
            selectedWeatherLocation={selectedWeatherLocation}
            onLocationSelect={setSelectedWeatherLocation}
            onSelect={(e) => setFocusId(e.id)}
            className={mapHeight}
          />
        </Panel>
        <Panel
          title={
            <span className="flex items-center gap-2">
              Live Event Stream{" "}
              <span className="flex items-center gap-1 font-mono text-[9px] text-sev-low">
                <span className="h-1.5 w-1.5 rounded-full bg-sev-low" />
                REST API
              </span>
            </span>
          }
          actions={
            data.stream.pending > 0 ? (
              <span className="font-mono text-[9px] text-muted-foreground">
                {data.stream.pending} incoming
              </span>
            ) : undefined
          }
          bodyClassName="p-0"
        >
          <div className={`${mapHeight} overflow-y-auto`}>
            <StreamList
              events={data.filtered}
              latestId={data.stream.latestId}
              selectedId={focusId}
              onSelect={select}
            />
          </div>
        </Panel>
        <Panel
          title="Weather Alerts · Demo"
          actions={
            <span className="font-mono text-[10px] text-muted-foreground">
              {data.alerts.length} active
            </span>
          }
          className="lg:col-span-2 xl:col-span-1"
          bodyClassName="p-0"
        >
          <div className="max-h-[320px] space-y-px overflow-y-auto xl:max-h-none xl:h-[520px]">
            {data.alerts.map((a) => (
              <AlertRow key={a.id} alert={a} onClick={() => setAlert(a)} />
            ))}
          </div>
        </Panel>
      </div>
      <OfficialAlertsPanel
        response={data.officialAlerts}
        loading={data.officialAlertsPending}
        error={data.officialAlertsError}
      />
      <SatelliteObservationsPanel
        response={data.satelliteObservations}
        loading={data.satellitePending}
        error={data.satelliteError}
      />
      <EventDrawer
        event={drawer}
        onClose={() => setDrawer(null)}
        onViewOnMap={(e) => {
          setFocusId(e.id);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
      <AlertModal alert={alert} onClose={() => setAlert(null)} />
    </>
  );
}

function SatelliteObservationsPanel({
  response,
  loading,
  error,
}: {
  response: SatelliteObservationsResponse | null;
  loading: boolean;
  error: string | null;
}) {
  const status = response?.source.status ?? (loading ? "LOADING" : "UNKNOWN");
  return (
    <Panel
      title="Satellite Observations · NASA FIRMS"
      actions={
        <span className="font-mono text-[10px] text-muted-foreground">
          {response?.total ?? 0} detections · {status}
        </span>
      }
      bodyClassName="p-0"
    >
      {error ? (
        <div role="alert" className="px-3 py-2 text-[11px] text-sev-high">
          NASA FIRMS observations unavailable: {error}
        </div>
      ) : loading ? (
        <div className="px-3 py-2 text-[11px] text-muted-foreground">
          Loading persisted satellite observations…
        </div>
      ) : !response?.items.length ? (
        <div className="px-3 py-2 text-[11px] text-muted-foreground">
          {status === "NOT_CONFIGURED"
            ? "NASA FIRMS is not configured. Set FIRMS_MAP_KEY on the backend to enable ingestion."
            : "No persisted satellite detections are available."}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {response.items.slice(0, 6).map((item) => (
            <article
              key={item.id}
              className="grid gap-1 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <div className="min-w-0">
                <div className="truncate text-[11px] font-semibold">
                  {item.sourceAccount} · {item.sourceRecordId}
                </div>
                <div className="truncate text-[10px] text-muted-foreground">{item.summary}</div>
              </div>
              <span className="font-mono text-[9px] text-muted-foreground">
                {new Date(item.observedAt).toLocaleString()}
              </span>
            </article>
          ))}
        </div>
      )}
      {response && (
        <div className="border-t border-border px-3 py-1 font-mono text-[9px] text-muted-foreground">
          Received {response.source.recordsReceived} · processed {response.source.recordsProcessed}{" "}
          · persisted {response.source.recordsPersisted} · last fetch{" "}
          {response.source.lastSuccess
            ? new Date(response.source.lastSuccess).toLocaleString()
            : "never"}
          {response.source.lastError ? ` · ${response.source.lastError}` : ""}
        </div>
      )}
    </Panel>
  );
}

function OfficialAlertsPanel({
  response,
  loading,
  error,
}: {
  response: OfficialAlertsResponse | null;
  loading: boolean;
  error: string | null;
}) {
  return (
    <Panel
      title="Official Alerts · SACHET / NDMA CAP"
      actions={
        <span className="font-mono text-[10px] text-muted-foreground">
          {response?.total ?? 0} active ·{" "}
          {response?.source.status ?? (loading ? "loading" : "unknown")}
        </span>
      }
      bodyClassName="p-0"
    >
      {error ? (
        <div role="alert" className="px-3 py-2 text-[11px] text-sev-high">
          Official alert feed unavailable: {error}
        </div>
      ) : loading ? (
        <div className="px-3 py-2 text-[11px] text-muted-foreground">Loading official alerts…</div>
      ) : !response?.items.length ? (
        <div className="px-3 py-2 text-[11px] text-muted-foreground">
          No unexpired official alerts returned by SACHET.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {response.items.slice(0, 8).map((alert) => (
            <article
              key={alert.id}
              className="grid gap-1 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <div className="min-w-0">
                <div className="truncate text-[12px] font-semibold">
                  {alert.headline || alert.event || "Official CAP alert"}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {alert.areas.join("; ") || alert.location || "Area not specified"}
                </div>
                <div className="mt-0.5 font-mono text-[9px] text-muted-foreground">
                  {alert.issuer} · CAP {alert.sourceRecordId} · issued{" "}
                  {new Date(alert.issuedAt).toLocaleString()}
                  {alert.expiresAt
                    ? ` · expires ${new Date(alert.expiresAt).toLocaleString()}`
                    : ""}
                </div>
              </div>
              <span className="font-mono text-[10px] font-semibold uppercase text-sev-high">
                {alert.urgency} · {alert.severity}
              </span>
            </article>
          ))}
        </div>
      )}
      {response && (
        <div className="border-t border-border px-3 py-1 font-mono text-[9px] text-muted-foreground">
          Received {response.source.recordsReceived} · persisted {response.source.recordsPersisted}{" "}
          · last fetch{" "}
          {response.source.lastSuccess
            ? new Date(response.source.lastSuccess).toLocaleString()
            : "never"}
          {response.source.lastError ? ` · ${response.source.lastError}` : ""}
        </div>
      )}
    </Panel>
  );
}

export { EventFilterBar };
