import { useMemo, useState } from "react";
import { ArrowDown, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
  AreaChart,
} from "recharts";
import { DemoTag, FilterChip, MetricCard, Panel, SectionHeader } from "@/components/hs/primitives";
import { ChartCard, DataTable } from "@/components/hs/data";
import { axis, tip } from "@/features/dashboard/DashboardPage";
import {
  PIPELINE,
  SOURCE_HEALTH,
  healthHistory,
  type HealthStatus,
  type Range,
} from "@/data/sourceHealth";
import { sourceService } from "@/services/api";
import type { ConnectorStatus, DataSource } from "@/types";
import { cn } from "@/lib/utils";

type DisplayHealthStatus = HealthStatus | "CONNECTED" | "DEGRADED";

const ST_CLS: Record<DisplayHealthStatus, string> = {
  CONNECTED: "border-sev-low/50 text-sev-low",
  DEGRADED: "border-sev-medium/50 text-sev-medium",
  SIMULATED: "border-sev-medium/50 text-sev-medium",
  "DEMO CONNECTOR": "border-info/50 text-info",
  "NOT CONNECTED": "border-sev-high/50 text-sev-high",
  CONFIGURED: "border-primary/50 text-primary",
};
const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--info)",
  "var(--sev-medium)",
  "var(--sev-high)",
  "var(--muted-foreground)",
];

const SOURCE_STATUS_MAP: Record<ConnectorStatus | HealthStatus, DisplayHealthStatus> = {
  connected: "CONNECTED",
  receiving: "SIMULATED",
  degraded: "DEGRADED",
  offline: "NOT CONNECTED",
  SIMULATED: "SIMULATED",
  "DEMO CONNECTOR": "DEMO CONNECTOR",
  "NOT CONNECTED": "NOT CONNECTED",
  CONFIGURED: "CONFIGURED",
};

export function HealthBadge({ s }: { s: ConnectorStatus | HealthStatus }) {
  const mapped = SOURCE_STATUS_MAP[s];
  return (
    <span
      className={cn(
        "whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-[9px] font-semibold tracking-wider",
        ST_CLS[mapped],
      )}
    >
      {mapped}
    </span>
  );
}

export function PipelinePanel() {
  return (
    <Panel
      title="Ingestion pipeline"
      actions={
        <span className="rounded-sm border border-sev-medium/50 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-sev-medium">
          DEMO PIPELINE
        </span>
      }
    >
      <p className="mb-2 text-[11px] text-muted-foreground">
        Stage figures are illustrative; live connector counters are shown in the registry above.
      </p>
      <ol className="space-y-0.5">
        {PIPELINE.map((p, i) => (
          <li key={p.stage}>
            <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 rounded-sm border border-border bg-panel-raised/50 px-2.5 py-1.5 text-[12px]">
              <span className="font-semibold uppercase tracking-wider">{p.stage}</span>
              <span className="text-[10px] font-semibold text-sev-medium">SIMULATED</span>
              <span className="font-mono text-[11px]">{p.records.toLocaleString("en-IN")} rec</span>
              <span className="w-16 text-right font-mono text-[11px] text-muted-foreground">
                {p.latencyMs ? `${p.latencyMs} ms` : "—"}
              </span>
            </div>
            {i < PIPELINE.length - 1 && (
              <ArrowDown className="mx-auto h-3 w-3 text-muted-foreground" />
            )}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

export function DataSourcesPage() {
  const [range, setRange] = useState<Range>("6h");
  const { data, isLoading, isFetching, isError, error, dataUpdatedAt, refetch } = useQuery({
    queryKey: ["sources"],
    queryFn: sourceService.list,
    refetchInterval: 30_000,
  });
  const {
    data: runtimeHealth,
    isError: healthError,
    error: healthQueryError,
    isFetching: healthFetching,
    refetch: refetchHealth,
  } = useQuery({
    queryKey: ["source-runtime-health"],
    queryFn: sourceService.health,
    refetchInterval: 30_000,
  });
  const fallbackSources: DataSource[] = SOURCE_HEALTH.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.category,
    status: "receiving" as ConnectorStatus,
    reliability: 1 - s.errorRate,
    throughput: `${s.perMin}/min`,
    lastSync: s.lastUpdate,
    description: `${s.connector} · ${s.coverage}`,
  }));
  const usingFallback = data === undefined;
  const dataRows: DataSource[] = data ?? fallbackSources;
  const hist = useMemo(
    () =>
      healthHistory(
        range,
        fallbackSources.map((s) => ({
          ...SOURCE_HEALTH.find((entry) => entry.id === s.id)!,
          perMin: Math.max(0, Number(s.throughput.replace(/[^\d.]/g, "")) || 0),
        })),
      ),
    [fallbackSources, range],
  );
  const latencyNames = dataRows.map((s) => s.name);
  const connectedCount = usingFallback
    ? 0
    : dataRows.filter((s) => s.status === "connected").length;
  const healthByCode = new Map((runtimeHealth ?? []).map((source) => [source.code, source]));
  const healthTotals = (runtimeHealth ?? []).reduce(
    (totals, source) => ({
      received: totals.received + source.records_received,
      processed: totals.processed + source.records_processed,
      errors: totals.errors + source.error_count,
      live: totals.live + Number(source.is_live),
    }),
    { received: 0, processed: 0, errors: 0, live: 0 },
  );
  const latestSourceSuccess = (runtimeHealth ?? [])
    .map((source) => source.last_success)
    .filter((lastSuccess): lastSuccess is string => lastSuccess !== null)
    .map((lastSuccess) => Date.parse(lastSuccess))
    .filter(Number.isFinite)
    .reduce((latest, lastSuccess) => Math.max(latest, lastSuccess), 0);

  if (isLoading) {
    return (
      <div className="rounded-md border border-border bg-panel px-4 py-6 text-sm text-muted-foreground">
        Loading source health…
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <SectionHeader
        eyebrow="Data & System"
        title="Data Sources"
        description="Registered connectors with real backend health and current runtime status."
      />
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-[11px]",
          usingFallback
            ? "border-sev-medium/50 bg-sev-medium/10 text-sev-medium"
            : isError
              ? "border-sev-high/50 bg-sev-high/10 text-sev-high"
              : "border-primary/40 bg-primary/10 text-primary",
        )}
      >
        <span>
          <strong>
            {usingFallback
              ? "DEMO / FALLBACK DATA"
              : isError
                ? "Registry refresh failed"
                : "Live registry status"}
          </strong>{" "}
          {usingFallback
            ? `Backend registry unavailable; showing simulated values. ${error instanceof Error ? error.message : "Unknown API error"}`
            : isError
              ? `Showing the last successful registry response from ${new Date(dataUpdatedAt).toLocaleTimeString()}. ${error instanceof Error ? error.message : "Refresh failed"}`
              : "Source status and counters come from the backend. History charts and pipeline stages below are illustrative demo data."}
        </span>
        <button
          type="button"
          onClick={() => void Promise.all([refetch(), refetchHealth()])}
          disabled={isFetching || healthFetching}
          className="flex items-center gap-1 rounded-sm border border-current px-2 py-1 disabled:opacity-50"
        >
          <RefreshCw className="h-3 w-3" /> Retry
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <MetricCard label="Registered sources" value={String(dataRows.length)} />
        <MetricCard label="Connected" value={String(connectedCount)} tone="medium" />
        <MetricCard
          label="Not connected or demo"
          value={String(dataRows.length - connectedCount)}
          tone="high"
        />
        <MetricCard
          label="Latest source success"
          value={latestSourceSuccess ? new Date(latestSourceSuccess).toLocaleTimeString() : "Never"}
        />
      </div>
      {healthError ? (
        <div className="rounded-md border border-sev-high/50 bg-sev-high/10 px-3 py-2 text-[11px] text-sev-high">
          Runtime counters are unavailable from the backend:{" "}
          {healthQueryError instanceof Error ? healthQueryError.message : "Unknown API error"}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <MetricCard
            label="Runtime sources live"
            value={String(healthTotals.live)}
            tone="medium"
          />
          <MetricCard label="Records received" value={String(healthTotals.received)} />
          <MetricCard label="Records processed" value={String(healthTotals.processed)} />
          <MetricCard
            label="Connector errors"
            value={String(healthTotals.errors)}
            {...(healthTotals.errors ? { tone: "high" as const } : {})}
          />
        </div>
      )}
      <Panel title="Connector registry" bodyClassName="p-1">
        <DataTable
          rows={dataRows}
          rowKey={(r) => r.id}
          columns={[
            {
              key: "n",
              header: "Name",
              render: (r) => <span className="font-semibold">{r.name}</span>,
            },
            { key: "c", header: "Category", render: (r) => r.kind },
            {
              key: "k",
              header: "Connector",
              render: (r) => (
                <span className="text-[11px] text-muted-foreground">{r.description}</span>
              ),
            },
            { key: "s", header: "Status", render: (r) => <HealthBadge s={r.status} /> },
            {
              key: "runtime",
              header: "Runtime",
              render: (r) => {
                const health = healthByCode.get(r.id);
                return health ? (
                  <span className="font-mono text-[10px]">
                    {health.records_received}/{health.records_processed} in/processed ·{" "}
                    {health.error_count} errors
                  </span>
                ) : (
                  <span className="text-muted-foreground">No runtime record</span>
                );
              },
            },
            {
              key: "u",
              header: "Last update",
              className: "font-mono",
              render: (r) => r.lastSync || "—",
            },
            {
              key: "r",
              header: "Throughput",
              className: "font-mono",
              render: (r) => r.throughput,
            },
            {
              key: "l",
              header: "Reliability",
              className: "font-mono",
              render: (r) => `${(r.reliability * 100).toFixed(0)}%`,
            },
            {
              key: "a",
              header: "",
              render: () => (
                <button
                  onClick={() => void Promise.all([refetch(), refetchHealth()])}
                  disabled={isFetching || healthFetching}
                  className="flex items-center gap-1 rounded-sm border border-border px-2 py-0.5 text-[11px] hover:bg-accent"
                >
                  <RefreshCw className="h-3 w-3" />
                  Refresh
                </button>
              ),
            },
          ]}
        />
      </Panel>
      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-muted-foreground">Health history</span>
        {(["1h", "6h", "24h"] as Range[]).map((r) => (
          <FilterChip key={r} active={range === r} onClick={() => setRange(r)}>
            {r}
          </FilterChip>
        ))}
        <DemoTag />
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        <ChartCard title="Latency by source (s)">
          <ResponsiveContainer>
            <LineChart data={hist} margin={{ left: -14, right: 6, top: 6 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="t" {...axis} />
              <YAxis {...axis} />
              <Tooltip {...tip} />
              <Legend wrapperStyle={{ fontSize: 9 }} />
              {latencyNames.map((n, i) => (
                <Line
                  key={n}
                  dataKey={n}
                  stroke={COLORS[i % COLORS.length]}
                  dot={false}
                  strokeWidth={1.5}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Throughput (records/min)">
          <ResponsiveContainer>
            <AreaChart data={hist} margin={{ left: -14, right: 6, top: 6 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="t" {...axis} />
              <YAxis {...axis} />
              <Tooltip {...tip} />
              <Area
                dataKey="throughput"
                stroke="var(--chart-1)"
                fill="var(--chart-1)"
                fillOpacity={0.2}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Error rate (%)">
          <ResponsiveContainer>
            <LineChart data={hist} margin={{ left: -14, right: 6, top: 6 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="t" {...axis} />
              <YAxis {...axis} />
              <Tooltip {...tip} />
              <Line
                dataKey="errors"
                stroke="var(--sev-high)"
                dot={false}
                strokeWidth={1.5}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <PipelinePanel />
    </div>
  );
}
