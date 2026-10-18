import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ingestionQuery, rainfallQuery, sourcesQuery } from "@/hooks/useWeather";
import { DemoTag, Panel, SectionHeader, StatusBadge } from "@/components/hs/primitives";
import { ChartCard } from "@/components/hs/data";
import {
  EventFilterBar,
  KpiRow,
  OpsGrid,
  useCommandCenterData,
} from "@/features/events/CommandCenter";
import type { WeatherObservationResponse } from "@/services/api";
import { DisasterSummaryPanel } from "@/features/dashboard/DisasterSummaryPanel";

export const axis = {
  stroke: "var(--muted-foreground)",
  fontSize: 10,
  tickLine: false,
  axisLine: false,
};
export const tip = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    fontSize: 11,
    borderRadius: 4,
  },
  labelStyle: { color: "var(--foreground)" },
};

export function SourceStrip() {
  const { data: sources } = useSuspenseQuery(sourcesQuery);
  return (
    <Panel
      title="Data Connectors"
      actions={
        <>
          <DemoTag />
          <Link to="/data-sources" className="text-[11px] text-primary hover:underline">
            Manage →
          </Link>
        </>
      }
      bodyClassName="p-2"
    >
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-8">
        {sources.map((s) => (
          <div
            key={s.id}
            className="rounded-sm border border-border bg-panel-raised/50 px-2 py-1.5"
            title={s.description}
          >
            <div className="truncate text-[12px] font-semibold">{s.name}</div>
            <div className="flex items-center justify-between gap-1">
              <StatusBadge status={s.status} />
              <span className="font-mono text-[9px] text-muted-foreground">{s.lastSync}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        Connector status and runtime counters are sourced from the HIKARI SENSE backend.
      </p>
    </Panel>
  );
}

export function DashboardPage() {
  const data = useCommandCenterData();
  const { data: ingestion } = useSuspenseQuery(ingestionQuery);
  const { data: rainfall } = useSuspenseQuery(rainfallQuery);

  return (
    <div className="space-y-3">
      <SectionHeader
        eyebrow="Command Center"
        title="National Dashboard"
        description="Situational snapshot · live backend operations feed"
      />
      <KpiRow
        kpis={data.kpis}
        severity={data.filters.severity}
        onSeverity={(s) => data.setFilters({ severity: s })}
      />
      <EventFilterBar
        count={data.filtered.length}
        total={data.stream.visible.length}
        events={data.events}
        compact
      />
      <WeatherStatusStrip
        weather={data.weather}
        loading={data.weatherPending}
        error={data.weatherError}
      />
      <DisasterSummaryPanel />
      <OpsGrid data={data} />
      <div className="grid gap-3 lg:grid-cols-3">
        <ChartCard
          title="Ingestion Volume · 24h (records/min)"
          className="lg:col-span-2"
          height={200}
        >
          <ResponsiveContainer>
            <AreaChart data={ingestion} margin={{ left: -18, right: 6, top: 6 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="hour" {...axis} interval={3} />
              <YAxis {...axis} />
              <Tooltip {...tip} />
              <Area
                type="monotone"
                dataKey="citizen"
                name="Citizen"
                stroke="var(--chart-1)"
                fill="var(--chart-1)"
                fillOpacity={0.15}
                strokeWidth={1.5}
              />
              <Area
                type="monotone"
                dataKey="official"
                name="Official"
                stroke="var(--chart-3)"
                fill="var(--chart-3)"
                fillOpacity={0.12}
                strokeWidth={1.5}
              />
              <Area
                type="monotone"
                dataKey="media"
                name="Media"
                stroke="var(--chart-4)"
                fill="var(--chart-4)"
                fillOpacity={0.1}
                strokeWidth={1.5}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Seasonal Rainfall vs Normal (mm)" height={200}>
          <ResponsiveContainer>
            <BarChart data={rainfall} margin={{ left: -14, right: 6, top: 6 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="region" {...axis} />
              <YAxis {...axis} />
              <Tooltip {...tip} cursor={{ fill: "var(--accent)" }} />
              <Bar
                dataKey="normal"
                name="Normal"
                fill="var(--muted-foreground)"
                fillOpacity={0.35}
                radius={[2, 2, 0, 0]}
              />
              <Bar dataKey="actual" name="Actual" fill="var(--chart-2)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <SourceStrip />
    </div>
  );
}

function WeatherStatusStrip({
  weather,
  loading,
  error,
}: {
  weather: WeatherObservationResponse | null;
  loading: boolean;
  error: string | null;
}) {
  const current = weather?.items.find((item) => item.recordType === "current");
  const forecast =
    weather?.items
      .filter(
        (item) =>
          item.recordType === "forecast" && (!current || item.observedAt > current.observedAt),
      )
      .sort((left, right) => left.observedAt.localeCompare(right.observedAt))
      .slice(0, 3) ?? [];
  const stale = Boolean(current) && (weather?.source.status !== "CONNECTED" || Boolean(error));
  const metrics = [
    ["Temperature", current?.temperatureC != null ? `${current.temperatureC} °C` : "—"],
    ["Humidity", current?.humidityPct != null ? `${current.humidityPct}%` : "—"],
    ["Precipitation", current?.precipitationMm != null ? `${current.precipitationMm} mm` : "—"],
    ["Wind", current?.windSpeedMs != null ? `${current.windSpeedMs} m/s` : "—"],
  ];
  return (
    <section className="border-y border-border py-2" aria-label="Open-Meteo current conditions">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="font-display text-[12px] font-semibold uppercase tracking-wider">
          Open-Meteo · {current?.location ?? "Current conditions"}
        </div>
        <div className="font-mono text-[10px] text-muted-foreground">
          {loading
            ? "Loading persisted weather…"
            : !current
              ? `UNAVAILABLE · ${error ?? "No current observation persisted"}`
              : stale
                ? `STALE · last success ${weather?.source.lastSuccess ? new Date(weather.source.lastSuccess).toLocaleString() : "unknown"}${error ? ` · refresh failed: ${error}` : ""}`
                : `LIVE · last success ${weather?.source.lastSuccess ? new Date(weather.source.lastSuccess).toLocaleString() : "unknown"} · ${current.attribution}`}
        </div>
      </div>
      {error && (
        <p role="alert" className="mb-2 text-[11px] text-sev-high">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {metrics.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <div className="font-mono text-[9px] uppercase text-muted-foreground">{label}</div>
            <div className="truncate font-mono text-sm font-semibold tabular-nums">{value}</div>
          </div>
        ))}
      </div>
      {current && (
        <div className="mt-1 truncate font-mono text-[9px] text-muted-foreground">
          Observed {new Date(current.observedAt).toLocaleString()} · source record{" "}
          {current.sourceRecordId} · persisted report {current.reportId}
        </div>
      )}
      {forecast.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-2 font-mono text-[10px]">
          <span className="uppercase text-muted-foreground">Next forecast hours</span>
          {forecast.map((item) => (
            <span key={item.id} className="tabular-nums">
              {new Date(item.observedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
              {item.temperatureC !== null ? ` · ${item.temperatureC} °C` : ""}
              {item.precipitationMm !== null ? ` · ${item.precipitationMm} mm` : ""}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
