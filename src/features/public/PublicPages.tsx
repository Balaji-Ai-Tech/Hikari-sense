import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  alertsQuery,
  officialAlertsQuery,
  publicEventsQuery,
  satelliteObservationsQuery,
  weatherObservationsQuery,
} from "@/hooks/useWeather";
import { DemoTag, Panel, SectionHeader } from "@/components/hs/primitives";
import { MapLibreEventMap } from "@/features/map/MapLibreEventMap";
import { LiveWeatherPicker } from "@/features/map/LiveWeatherPicker";
import { EventDrawer } from "@/features/events/components";
import { MapSkeleton, PanelSkeleton, StateScreen } from "@/components/hs/states";
import { useT } from "@/i18n";
import type { LiveWeatherLocation, Severity } from "@/types";
import type { WeatherEvent } from "@/types";
import { cn } from "@/lib/utils";

/** Citizens see only verified/corroborated events — never review queues, private reports or internal scores. */
function usePublicEvents() {
  const q = useQuery(publicEventsQuery);
  return {
    ...q,
    data: (q.data ?? []).filter((e) => e.origin !== "demo" && e.verification === "verified"),
    fallbackEvent: (q.data ?? []).find((e) => e.origin === "demo"),
  };
}

const SEV_CLS: Record<Severity, string> = {
  critical: "border-sev-critical/50 bg-sev-critical/10 text-sev-critical",
  high: "border-sev-high/50 bg-sev-high/10 text-sev-high",
  medium: "border-sev-medium/50 bg-sev-medium/10 text-sev-medium",
  low: "border-sev-low/50 bg-sev-low/10 text-sev-low",
};
export function PublicSeverity({ severity }: { severity: Severity }) {
  const t = useT();
  return (
    <span
      className={cn(
        "rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase",
        SEV_CLS[severity],
      )}
    >
      {t(`severity.${severity}`)}
    </span>
  );
}

export function PublicMapPage() {
  const t = useT();
  const { data: events, isPending, isError, refetch, fallbackEvent } = usePublicEvents();
  const weatherQuery = useQuery(weatherObservationsQuery);
  const officialAlertQuery = useQuery(officialAlertsQuery);
  const satelliteQuery = useQuery(satelliteObservationsQuery);
  const weather = weatherQuery.data?.items ?? [];
  const officialAlerts = officialAlertQuery.data?.items ?? [];
  const [selectedEvent, setSelectedEvent] = useState<WeatherEvent | null>(null);
  const [selectedWeatherLocation, setSelectedWeatherLocation] =
    useState<LiveWeatherLocation | null>(null);
  return (
    <div className="space-y-3">
      <SectionHeader
        eyebrow="HIKARI SENSE"
        title={t("map.title")}
        description={t("map.desc")}
        actions={
          fallbackEvent ? (
            <DemoTag label="DEMO / FALLBACK DATA" />
          ) : (
            <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase text-muted-foreground">
              BACKEND DATA
            </span>
          )
        }
      />
      {fallbackEvent && (
        <div
          role="status"
          className="rounded-md border border-sev-medium/50 bg-sev-medium/10 px-3 py-2 text-[11px] text-sev-medium"
        >
          DEMO / FALLBACK DATA. Live event request failed: {fallbackEvent.originError}
        </div>
      )}
      {weatherQuery.isError && (
        <div role="status" className="border-y border-sev-high/40 py-2 text-[11px] text-sev-high">
          Open-Meteo conditions unavailable: {weatherQuery.error.message}
        </div>
      )}
      {officialAlertQuery.isError && (
        <div role="status" className="border-y border-sev-high/40 py-2 text-[11px] text-sev-high">
          SACHET official alerts unavailable: {officialAlertQuery.error.message}
        </div>
      )}
      {!weatherQuery.isError && weatherQuery.data?.source.status === "STALE" && (
        <div
          role="status"
          className="border-y border-sev-medium/40 py-2 text-[11px] text-sev-medium"
        >
          Open-Meteo data is stale. Last successful fetch:{" "}
          {weatherQuery.data.source.lastSuccess ?? "unknown"}.
        </div>
      )}
      {isError ? (
        <StateScreen
          kind="dataUnavailable"
          title={t("error.data")}
          description={t("error.dataD")}
          actions={[{ label: t("common.retry"), onClick: () => refetch(), primary: true }]}
        />
      ) : isPending ? (
        <MapSkeleton className="h-[520px]" />
      ) : (
        <Panel title={`${events.length} ${t("map.verified")}`}>
          <LiveWeatherPicker
            selected={selectedWeatherLocation}
            onSelect={setSelectedWeatherLocation}
          />
          <MapLibreEventMap
            events={events}
            weatherObservations={weather}
            officialAlerts={officialAlerts}
            satelliteObservations={satelliteQuery.data?.items ?? []}
            selectedWeatherLocation={selectedWeatherLocation}
            onLocationSelect={setSelectedWeatherLocation}
            overlayLabel={fallbackEvent ? "DEMO / FALLBACK DATA" : "BACKEND DATA"}
            showLayerControl={false}
            onViewEvent={setSelectedEvent}
            className="h-[520px]"
          />
        </Panel>
      )}
      <EventDrawer
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onViewOnMap={() => setSelectedEvent(null)}
        showFullEventLink={false}
      />
    </div>
  );
}

export function NewsWeatherPage() {
  const t = useT();
  const { data, isPending } = usePublicEvents();
  const events = data.slice(0, 12);
  return (
    <div className="space-y-3">
      <SectionHeader
        eyebrow="HIKARI SENSE"
        title={t("news.title")}
        description={t("news.desc")}
        actions={<DemoTag />}
      />
      {isPending ? (
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <PanelSkeleton key={i} />
          ))}
        </div>
      ) : events.length === 0 ? (
        <StateScreen
          kind="noEvents"
          title={t("empty.events")}
          actions={[{ label: t("common.goMap"), to: "/public-map" }]}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {events.map((e) => (
            <Panel key={e.id} title={e.title} actions={<PublicSeverity severity={e.severity} />}>
              <p className="text-[12px] text-muted-foreground">{e.summary}</p>
              <div className="mt-2 font-mono text-[10px] text-muted-foreground">
                {e.district}, {e.state}
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}

/** Public alert view: no internal recipients, channels or configuration. */
export function PublicAlertsPage() {
  const t = useT();
  const { data = [], isPending } = useQuery(alertsQuery);
  const active = data.filter((a) => a.status === "active");
  return (
    <div className="space-y-3">
      <SectionHeader
        eyebrow="HIKARI SENSE"
        title={t("alerts.title")}
        description={t("alerts.desc")}
        actions={<DemoTag />}
      />
      {isPending ? (
        <PanelSkeleton lines={6} />
      ) : active.length === 0 ? (
        <StateScreen
          kind="noAlerts"
          title={t("empty.alerts")}
          actions={[{ label: t("common.goMap"), to: "/public-map" }]}
        />
      ) : (
        active.map((a) => (
          <Panel
            key={a.id}
            title={`${a.title} · ${a.region}`}
            actions={<PublicSeverity severity={a.severity} />}
          >
            <p className="text-[12px]">{a.message}</p>
            <div className="mt-2 text-[11px] font-semibold">{t("alerts.guidance")}</div>
            <ul className="list-disc pl-5 text-[12px] text-muted-foreground">
              {a.instructions.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
            <div className="mt-2 font-mono text-[10px] text-muted-foreground">
              {a.affectedArea} · {t("alerts.issued")} {a.issuedAt} · {t("alerts.until")}{" "}
              {a.expiresAt} · {t("alerts.source")}: {a.issuer} ({t("common.demo")})
            </div>
          </Panel>
        ))
      )}
    </div>
  );
}
