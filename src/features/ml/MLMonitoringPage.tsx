import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DemoTag, MetricCard, Panel, SectionHeader } from "@/components/hs/primitives";
import { ChartCard, DataTable } from "@/components/hs/data";
import { axis, tip } from "@/features/dashboard/DashboardPage";
import { cn } from "@/lib/utils";

// DEMO ML METRICS — deterministic illustrative values, not real model measurements.
type Stage = "Production" | "Staging" | "Archived";
interface Model {
  id: string;
  name: string;
  version: string;
  stage: Stage;
  acc: number;
  prec: number;
  rec: number;
  latencyMs: number;
  drift: number;
  trained: string;
  dataset: string;
}
const MODELS: Model[] = [
  {
    id: "classifier",
    name: "Weather Event Classifier",
    version: "v3.2.1",
    stage: "Production",
    acc: 0.912,
    prec: 0.897,
    rec: 0.884,
    latencyMs: 48,
    drift: 0.04,
    trained: "2026-09-12",
    dataset: "wx-events-2026.09",
  },
  {
    id: "duplicate",
    name: "Duplicate Detection",
    version: "v2.0.4",
    stage: "Production",
    acc: 0.943,
    prec: 0.931,
    rec: 0.902,
    latencyMs: 22,
    drift: 0.02,
    trained: "2026-08-30",
    dataset: "dup-pairs-2026.08",
  },
  {
    id: "geo",
    name: "Geolocation",
    version: "v1.7.0",
    stage: "Staging",
    acc: 0.861,
    prec: 0.874,
    rec: 0.839,
    latencyMs: 65,
    drift: 0.07,
    trained: "2026-09-20",
    dataset: "geo-gazetteer-2026.09",
  },
  {
    id: "media",
    name: "Media Analysis",
    version: "v1.3.2",
    stage: "Production",
    acc: 0.874,
    prec: 0.862,
    rec: 0.851,
    latencyMs: 182,
    drift: 0.09,
    trained: "2026-08-18",
    dataset: "media-vision-2026.08",
  },
  {
    id: "verify",
    name: "Verification",
    version: "v0.9.5",
    stage: "Archived",
    acc: 0.823,
    prec: 0.81,
    rec: 0.835,
    latencyMs: 31,
    drift: 0.12,
    trained: "2026-06-05",
    dataset: "verify-labels-2026.06",
  },
];
const CLASSES = ["Rain", "Flood", "Cyclone", "Heatwave", "Other"];
const f1 = (m: Model) => (2 * m.prec * m.rec) / (m.prec + m.rec);
const STAGE_CLS: Record<Stage, string> = {
  Production: "border-sev-low/50 text-sev-low",
  Staging: "border-info/50 text-info",
  Archived: "border-border text-muted-foreground",
};

function series(m: Model, k: number) {
  return Array.from({ length: 14 }, (_, i) => ({
    d: `D-${13 - i}`,
    accuracy: +((m.acc - 0.02 + 0.015 * Math.sin(i * 0.7 + k) + i * 0.0012) * 100).toFixed(1),
    p50: Math.round(m.latencyMs * (1 + 0.1 * Math.sin(i + k))),
    p95: Math.round(m.latencyMs * (1.9 + 0.2 * Math.sin(i * 1.3 + k))),
  }));
}
function confusion(m: Model) {
  return CLASSES.map((_, r) =>
    CLASSES.map((__, c) =>
      r === c
        ? Math.round(200 * m.acc)
        : Math.round(((200 * (1 - m.acc)) / 4) * (1 + 0.5 * Math.sin(r * 3 + c))),
    ),
  );
}

export function MLMonitoringPage() {
  const [sel, setSel] = useState(MODELS[0]!.id);
  const k = MODELS.findIndex((m) => m.id === sel);
  const m = MODELS[k]!;
  const s = series(m, k);
  const cm = confusion(m);
  const max = Math.max(...cm.flat());
  const dist = CLASSES.map((c, i) => ({
    c,
    predicted: cm.reduce((a, row) => a + row[i]!, 0),
    actual: cm[i]!.reduce((a, v) => a + v, 0),
  }));
  return (
    <div className="space-y-3">
      <SectionHeader
        eyebrow="Data & System"
        title="ML Monitoring"
        description="Model versions, quality, latency and drift."
        actions={<DemoTag />}
      />
      <div className="rounded-md border border-sev-medium/40 bg-sev-medium/10 px-3 py-2 text-[11px] text-sev-medium">
        DEMO ML METRICS — illustrative values only. These are not real production model
        measurements.
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <MetricCard label="Models registered" value={String(MODELS.length)} />
        <MetricCard
          label="In production"
          value={String(MODELS.filter((x) => x.stage === "Production").length)}
          tone="low"
        />
        <MetricCard
          label="Drift alerts (>0.08)"
          value={String(MODELS.filter((x) => x.drift > 0.08).length)}
          tone="medium"
        />
        <MetricCard label="Selected F1" value={f1(m).toFixed(3)} />
      </div>
      <Panel title="Model registry" bodyClassName="p-1">
        <DataTable
          rows={MODELS}
          rowKey={(r) => r.id}
          onRowClick={(r) => setSel(r.id)}
          columns={[
            {
              key: "n",
              header: "Model",
              render: (r) => (
                <span className={cn("font-semibold", r.id === sel && "text-primary")}>
                  {r.name}
                </span>
              ),
            },
            { key: "v", header: "Version", className: "font-mono", render: (r) => r.version },
            {
              key: "s",
              header: "Status",
              render: (r) => (
                <span
                  className={cn(
                    "rounded-sm border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                    STAGE_CLS[r.stage],
                  )}
                >
                  {r.stage}
                </span>
              ),
            },
            {
              key: "a",
              header: "Accuracy",
              className: "font-mono",
              render: (r) => r.acc.toFixed(3),
            },
            {
              key: "p",
              header: "Precision",
              className: "font-mono",
              render: (r) => r.prec.toFixed(3),
            },
            { key: "r", header: "Recall", className: "font-mono", render: (r) => r.rec.toFixed(3) },
            { key: "f", header: "F1", className: "font-mono", render: (r) => f1(r).toFixed(3) },
            {
              key: "l",
              header: "Inference",
              className: "font-mono",
              render: (r) => `${r.latencyMs} ms`,
            },
            {
              key: "d",
              header: "Drift",
              className: "font-mono",
              render: (r) => (
                <span className={r.drift > 0.08 ? "text-sev-high" : ""}>{r.drift.toFixed(2)}</span>
              ),
            },
            { key: "t", header: "Trained", className: "font-mono", render: (r) => r.trained },
            {
              key: "ds",
              header: "Dataset",
              className: "font-mono text-[10px]",
              render: (r) => r.dataset,
            },
          ]}
        />
      </Panel>
      <div className="text-[11px] text-muted-foreground">
        Charts for{" "}
        <span className="font-semibold text-foreground">
          {m.name} {m.version}
        </span>{" "}
        — click a row to switch.
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Accuracy trend (%) · 14 days">
          <ResponsiveContainer>
            <LineChart data={s} margin={{ left: -14, right: 6, top: 6 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="d" {...axis} />
              <YAxis {...axis} domain={["auto", "auto"]} />
              <Tooltip {...tip} />
              <Line
                dataKey="accuracy"
                stroke="var(--chart-1)"
                dot={false}
                strokeWidth={1.5}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Inference latency (ms)">
          <ResponsiveContainer>
            <LineChart data={s} margin={{ left: -14, right: 6, top: 6 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="d" {...axis} />
              <YAxis {...axis} />
              <Tooltip {...tip} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line dataKey="p50" stroke="var(--chart-2)" dot={false} isAnimationActive={false} />
              <Line
                dataKey="p95"
                stroke="var(--sev-medium)"
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Prediction distribution">
          <ResponsiveContainer>
            <BarChart data={dist} margin={{ left: -14, right: 6, top: 6 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="c" {...axis} />
              <YAxis {...axis} />
              <Tooltip {...tip} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="predicted" fill="var(--chart-1)" isAnimationActive={false} />
              <Bar dataKey="actual" fill="var(--chart-3)" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <Panel title="Confusion matrix (rows = actual)">
          <div
            className="grid gap-px text-[10px]"
            style={{ gridTemplateColumns: `72px repeat(${CLASSES.length}, minmax(0,1fr))` }}
          >
            <div />
            {CLASSES.map((c) => (
              <div key={c} className="p-1 text-center text-muted-foreground">
                {c}
              </div>
            ))}
            {cm.map((row, r) => [
              <div key={`l${r}`} className="p-1 text-muted-foreground">
                {CLASSES[r]}
              </div>,
              ...row.map((v, c) => (
                <div
                  key={`${r}-${c}`}
                  className="grid h-9 place-items-center rounded-sm font-mono"
                  style={{
                    background: `color-mix(in oklab, var(--primary) ${Math.round((v / max) * 80)}%, transparent)`,
                  }}
                >
                  {v}
                </div>
              )),
            ])}
          </div>
        </Panel>
      </div>
    </div>
  );
}
