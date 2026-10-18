import { ReportText } from "@/components/hs/ReportText";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Download,
  FileText,
  Image as ImageIcon,
  Newspaper,
  Satellite,
  Share2,
  Users,
  Video,
  Building2,
  Radio,
} from "lucide-react";
import { toast } from "sonner";
import { decisionsQuery, eventQuery, eventReportsQuery, eventsQuery } from "@/hooks/useWeather";
import { PENDING } from "@/services/api";
import { DecisionActions } from "@/features/verification/DecisionActions";
import { DuplicateTable, buildPairs } from "@/features/verification/DuplicatesPage";
import {
  DemoTag,
  EmptyState,
  Panel,
  SeverityBadge,
  VERIFICATION_LABEL,
  VerificationBadge,
} from "@/components/hs/primitives";
import { DataTable, Tabs } from "@/components/hs/data";
import { EVENT_ICON } from "@/components/hs/cards";
import { EVENT_TYPE_LABEL } from "@/data/mockEvents";
import { MapLibreEventMap } from "@/features/map/MapLibreEventMap";
import { minutesAgo, pct } from "@/utils/format";
import { cn } from "@/lib/utils";
import type { Report, SourceKind, SourceType, WeatherEvent } from "@/types";
import { KIND_SOURCE } from "@/data/mockSources";

const TYPE_CLS: Record<SourceType, string> = {
  official: "text-sev-low",
  scientific: "text-info",
  citizen: "text-primary",
  external: "text-sev-medium",
};
import { EventLifecycle, EventStreamRow } from "./components";
import {
  AIEvidence,
  CitizenEvidence,
  ExternalEvidence,
  HumanDecisionSummary,
  OfficialEvidence,
} from "./EvidencePanels";
import img1 from "@/assets/demo-flood-1.jpg";
import img2 from "@/assets/demo-flood-2.jpg";
import img3 from "@/assets/demo-flood-3.jpg";

const TABS = [
  "Overview",
  "AI Analysis",
  "Sources & Evidence",
  "Duplicates",
  "Timeline",
  "Map",
  "Related",
];
const IMAGES = [img1, img2, img3];

const clamp = (v: number) => Math.max(0, Math.min(0.99, v));
export function verificationScore(e: WeatherEvent) {
  const parts = [
    { label: "Source Reliability", weight: 0.25, score: clamp(e.confidence + 0.04) },
    { label: "Cross-source Corroboration", weight: 0.25, score: clamp(e.confidence + 0.02) },
    { label: "Spatial Consistency", weight: 0.2, score: clamp(e.confidence - 0.03) },
    { label: "Temporal Consistency", weight: 0.15, score: clamp(e.confidence - 0.02) },
    { label: "Media Authenticity", weight: 0.15, score: clamp(e.confidence - 0.04) },
  ];
  return { parts, overall: parts.reduce((s, p) => s + p.weight * p.score, 0) };
}

const SOURCE_META: Record<
  SourceKind,
  {
    icon: typeof Users;
    type: string;
    reliability: "High" | "Medium" | "Low";
    contribution: "Strong" | "Moderate" | "Weak";
    detail: (e: WeatherEvent) => string;
  }
> = {
  IMD: {
    icon: Building2,
    type: "Official Observation",
    reliability: "High",
    contribution: "Strong",
    detail: () => "AWS + radar observation within 10 km",
  },
  Citizen: {
    icon: Users,
    type: "Crowd reports",
    reliability: "Medium",
    contribution: "Strong",
    detail: (e) => `${e.reports} reports · ${e.images} images`,
  },
  "News/RSS": {
    icon: Newspaper,
    type: "Media",
    reliability: "Medium",
    contribution: "Moderate",
    detail: (e) => `${Math.max(2, Math.round(e.reports / 4))} articles`,
  },
  Satellite: {
    icon: Satellite,
    type: "Remote sensing",
    reliability: "High",
    contribution: "Moderate",
    detail: () => "Latest observation · INSAT-3DR (demo)",
  },
  Social: {
    icon: Radio,
    type: "Social media",
    reliability: "Low",
    contribution: "Weak",
    detail: (e) => `${Math.round(e.reports * 1.5)} public posts`,
  },
  Sensor: {
    icon: Radio,
    type: "IoT / municipal sensors",
    reliability: "High",
    contribution: "Moderate",
    detail: () => "Water-level / rain gauge telemetry",
  },
};
const relCls = {
  High: "text-sev-low",
  Medium: "text-sev-medium",
  Low: "text-sev-high",
  Strong: "text-sev-low",
  Moderate: "text-sev-medium",
  Weak: "text-sev-high",
};

function Meter({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn(
          "h-full",
          value >= 0.85
            ? "bg-sev-low"
            : value >= 0.7
              ? "bg-primary"
              : value >= 0.55
                ? "bg-sev-medium"
                : "bg-sev-high",
        )}
        style={{ width: pct(value) }}
      />
    </div>
  );
}

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="min-w-0">{v}</dd>
    </>
  );
}

function ScorePanel({ e }: { e: WeatherEvent }) {
  const { parts, overall } = verificationScore(e);
  return (
    <Panel title="Demo Verification Score" actions={<DemoTag />}>
      <div className="mb-3 flex items-center gap-3">
        <div
          className="relative grid h-20 w-20 shrink-0 place-items-center rounded-full"
          style={{
            background: `conic-gradient(var(--primary) ${overall * 360}deg, var(--muted) 0)`,
          }}
        >
          <div className="grid h-16 w-16 place-items-center rounded-full bg-panel">
            <span className="font-mono text-lg font-bold">{pct(overall)}</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Overall · State
          </div>
          <div className="mt-1">
            <VerificationBadge status={e.verification} />
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Weighted composite of five signals
          </div>
        </div>
      </div>
      <div className="space-y-2">
        {parts.map((p) => (
          <div key={p.label}>
            <div className="flex justify-between text-[11px]">
              <span>
                {p.label} — {Math.round(p.weight * 100)}%
              </span>
              <span className="font-mono">
                {pct(p.score)}{" "}
                <span className="text-muted-foreground">
                  → {(p.weight * p.score * 100).toFixed(1)} pts
                </span>
              </span>
            </div>
            <Meter value={p.score} className="mt-0.5" />
          </div>
        ))}
        <div className="flex justify-between border-t border-border pt-1.5 text-[12px] font-semibold">
          <span>Total</span>
          <span className="font-mono">{(overall * 100).toFixed(1)} / 100</span>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Demo scoring model for interface purposes — not a scientifically validated production score.
      </p>
    </Panel>
  );
}

function BackendEventPanel({ event }: { event: WeatherEvent }) {
  return (
    <Panel title="Event API record">
      <dl className="grid grid-cols-[130px_1fr] gap-y-1.5 text-[12px]">
        <Field k="Classification" v={EVENT_TYPE_LABEL[event.type] ?? event.type} />
        <Field k="Event state" v={<span className="font-mono">{event.lifecycleState}</span>} />
        <Field k="Verification" v={<VerificationBadge status={event.verification} />} />
        <Field k="Confidence" v={<span className="font-mono">{pct(event.confidence)}</span>} />
        <Field k="Reports" v={event.reports} />
        <Field k="Sources" v={event.sourceKinds.join(", ") || "Not reported"} />
        <Field k="Last updated" v={new Date(event.lastUpdated).toLocaleString("en-IN")} />
        <Field k="Summary" v={event.summary || "No summary provided."} />
      </dl>
      {event.aiDisclaimer && (
        <p className="mt-3 border-t border-border pt-2 text-[10px] text-muted-foreground">
          {event.aiDisclaimer}
        </p>
      )}
    </Panel>
  );
}

function BackendReportsPanel({ reports }: { reports: Report[] }) {
  return (
    <Panel title={`Linked reports (${reports.length})`}>
      {reports.length ? (
        <ul className="space-y-2">
          {reports.map((report) => (
            <li key={report.id} className="rounded-sm border border-border bg-panel-raised/50 p-2">
              <p className="text-[12px]">{report.text}</p>
              <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
                <span>{report.sourceName}</span>
                <span>{report.status.replace(/_/g, " ")}</span>
                <span>{new Date(report.reportedAt).toLocaleString("en-IN")}</span>
                {report.duplicateStatus !== "unique" && (
                  <span>Duplicate: {report.duplicateStatus}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No linked reports"
          description="The Event API returned no reports for this event."
        />
      )}
    </Panel>
  );
}

function AIPanel({ e }: { e: WeatherEvent }) {
  const findings = [
    `${EVENT_TYPE_LABEL[e.type]} indicators detected in text and media`,
    e.type === "flood" || e.type === "heavy_rainfall"
      ? "Waterlogging indicators detected"
      : "Hazard-specific keywords consistent across reports",
    `${e.sources} independent source types detected`,
    `Spatial consistency is ${e.confidence > 0.8 ? "high" : "moderate"} (reports within ${Math.round(Math.sqrt(e.affectedAreaKm2))} km)`,
    `Temporal consistency is ${e.confidence > 0.75 ? "high" : "moderate"} (reports within 25 min)`,
  ];
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Bot className="h-3.5 w-3.5 text-primary" />
          AI Analysis — Demo
        </span>
      }
    >
      <dl className="grid grid-cols-[130px_1fr] gap-y-1.5 text-[12px]">
        <Field
          k="Event classification"
          v={<span className="font-semibold">{EVENT_TYPE_LABEL[e.type]}</span>}
        />
        <Field
          k="Classifier confidence"
          v={<span className="font-mono">{pct(e.confidence)}</span>}
        />
        <Field
          k="Location extraction"
          v={`${e.location}, ${e.state} (${pct(clamp(e.confidence + 0.02))})`}
        />
        <Field k="Severity estimate" v={<SeverityBadge severity={e.severity} />} />
      </dl>
      <div className="mt-3 text-[10px] uppercase tracking-wider text-muted-foreground">
        Findings
      </div>
      <ul className="mt-1 space-y-1 text-[12px]">
        {findings.map((f) => (
          <li key={f} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
            {f}
          </li>
        ))}
      </ul>
      <p className="mt-3 rounded-sm border border-border bg-panel-raised/50 p-2 text-[11px] text-muted-foreground">
        Model output is decision support only. It has not independently verified this event; final
        state is set by corroboration rules and analyst review.
      </p>
    </Panel>
  );
}

function SourcesPanel({ e, reports }: { e: WeatherEvent; reports: Report[] }) {
  return (
    <Panel title="Source Corroboration" actions={<DemoTag />}>
      <div className="grid gap-2 2xl:grid-cols-2">
        {e.sourceKinds.map((k, i) => {
          const m = SOURCE_META[k];
          const Icon = m.icon;
          return (
            <div key={k} className="rounded-sm border border-border bg-panel-raised/50 p-2.5">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary" />
                <span className="font-semibold">{k}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">{m.type}</span>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {reports.filter((r) => r.sourceId === KIND_SOURCE[k].id).length} linked report(s) ·{" "}
                {KIND_SOURCE[k].id}
              </div>
              <dl className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
                <div>
                  <dt className="text-muted-foreground">Reliability</dt>
                  <dd className={relCls[m.reliability]}>{m.reliability}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Contribution</dt>
                  <dd className={relCls[m.contribution]}>{m.contribution}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Timestamp</dt>
                  <dd className="font-mono">
                    {minutesAgo(
                      new Date(new Date(e.reportedAt).getTime() + i * 120000).toISOString(),
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function Media({ e }: { e: WeatherEvent }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <Panel
      title="Media"
      actions={
        <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <ImageIcon className="h-3 w-3" />
          {e.images} images
          <Video className="ml-1 h-3 w-3" />
          {e.videos} videos
        </span>
      }
    >
      <div className="grid grid-cols-4 gap-1.5">
        {Array.from({ length: 4 }, (_, i) => (
          <button
            key={i}
            onClick={() => setOpen(i)}
            className="group relative aspect-[4/3] overflow-hidden rounded-sm border border-border"
          >
            <img
              src={IMAGES[i % 3]}
              alt={`Illustrative demo image ${i + 1}`}
              loading="lazy"
              width={944}
              height={704}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
            {i === 3 && e.images > 4 && (
              <span className="absolute inset-0 grid place-items-center bg-background/70 font-mono text-sm font-bold">
                +{e.images - 3}
              </span>
            )}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        Illustrative AI-generated demo images — not real citizen submissions.
      </p>
      {open !== null && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-background/90 p-6"
          onClick={() => setOpen(null)}
        >
          <img
            src={IMAGES[open % 3]}
            alt="Illustrative demo image enlarged"
            className="max-h-[80vh] rounded-md border border-border"
          />
        </div>
      )}
    </Panel>
  );
}

export function EventDetailPage({ eventId }: { eventId: string }) {
  const { data: e } = useSuspenseQuery(eventQuery(eventId));
  const { data: all } = useSuspenseQuery(eventsQuery);
  const { data: reports } = useSuspenseQuery(eventReportsQuery(eventId));
  const { data: decisions } = useSuspenseQuery(decisionsQuery);
  const [tab, setTab] = useState(TABS[0]!);

  if (!e) {
    return (
      <div className="space-y-3">
        <Link to="/events" className="text-[12px] text-primary">
          ← Back to Live Events
        </Link>
        <EmptyState
          title="Event not found"
          description={`No event with ID ${eventId} was returned by the HIKARI SENSE API.`}
        />
      </div>
    );
  }
  const Icon = EVENT_ICON[e.type];
  const related = all
    .filter((x) => x.id !== e.id && (x.state === e.state || x.type === e.type))
    .slice(0, 6);
  const mapReports = reports.filter((r) => r.sourceType === "citizen");
  const dupPairs = buildPairs(reports);
  const evDecisions = decisions.filter((d) => d.eventId === e.id);
  const backendEvent = e.origin === "backend";
  const alertIds = e.alertIds ?? [];

  return (
    <div className="space-y-3">
      <Link
        to="/events"
        className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-3 w-3" />
        Live Events
      </Link>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-md border border-border bg-panel p-3">
        <div className="flex min-w-0 gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-sm border border-primary/40 bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-semibold tracking-wide">
              {EVENT_TYPE_LABEL[e.type]} — {e.location}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="font-mono text-primary">{e.id}</span>
              <SeverityBadge severity={e.severity} />
              <VerificationBadge status={e.verification} />
              <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono">
                Confidence {pct(e.confidence)}
              </span>
              {!backendEvent && <DemoTag />}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href);
              toast.success("Event link copied to clipboard");
            }}
            className="flex h-8 items-center gap-1.5 rounded-sm border border-border px-3 text-[12px] font-medium hover:bg-accent"
          >
            <Share2 className="h-3.5 w-3.5" />
            Share
          </button>
          <button
            onClick={() => {
              toast.info("Opening print dialog — choose “Save as PDF”");
              setTimeout(() => window.print(), 300);
            }}
            className="flex h-8 items-center gap-1.5 rounded-sm bg-primary px-3 text-[12px] font-semibold text-primary-foreground hover:opacity-90"
          >
            <Download className="h-3.5 w-3.5" />
            Export PDF
          </button>
        </div>
      </div>

      {(alertIds.length > 0 ||
        (!backendEvent && PENDING.includes(e.verification)) ||
        e.mergedInto) && (
        <div className="flex flex-wrap items-center gap-2">
          {alertIds.map((id) => (
            <Link
              key={id}
              to="/alerts/$alertId"
              params={{ alertId: id }}
              className="flex items-center gap-2 rounded-sm border border-sev-high/40 bg-sev-high/10 px-2.5 py-1.5 text-[11px] text-sev-high hover:bg-sev-high/20"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="font-semibold">ACTIVE ALERT</span>
              <span className="font-mono">{id}</span>
              <span>View Alert →</span>
            </Link>
          ))}
          {e.mergedInto && (
            <Link
              to="/events/$eventId"
              params={{ eventId: e.mergedInto }}
              className="rounded-sm border border-border px-2.5 py-1.5 text-[11px] hover:bg-accent"
            >
              Merged into <span className="font-mono text-primary">{e.mergedInto}</span> →
            </Link>
          )}
          {!backendEvent && PENDING.includes(e.verification) && (
            <div className="ml-auto flex items-center gap-2 rounded-sm border border-sev-medium/40 bg-sev-medium/5 px-2.5 py-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-sev-medium">
                Human decision
              </span>
              <DecisionActions event={e} size="full" />
            </div>
          )}
        </div>
      )}

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === "Overview" && (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
          <div className="space-y-3">
            {!backendEvent && <Media e={e} />}
            <Panel title="Event Information">
              <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-[12px]">
                <Field k="Event type" v={EVENT_TYPE_LABEL[e.type]} />
                <Field
                  k="Location"
                  v={[e.location, e.district, e.state]
                    .filter((part): part is string => Boolean(part))
                    .join(", ")}
                />
                <Field
                  k="Coordinates"
                  v={
                    <span className="font-mono">
                      {e.lat !== null && e.lng !== null
                        ? `${e.lat.toFixed(4)}, ${e.lng.toFixed(4)}`
                        : "Not provided"}
                    </span>
                  }
                />
                <Field
                  k="Time"
                  v={`${new Date(e.reportedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST (${minutesAgo(e.reportedAt)})`}
                />
                <Field k="Severity" v={<SeverityBadge severity={e.severity} />} />
                <Field
                  k="Lifecycle state"
                  v={<span className="font-mono">{e.lifecycleState}</span>}
                />
                <Field
                  k="Reports"
                  v={`${e.reports} independent${e.duplicateCount ? ` · ${e.duplicateCount} suspected duplicate(s)` : ""}`}
                />
                <Field k="Sources" v={`${e.sources} — ${e.sourceIds.join(", ")}`} />
                <Field k="Last updated" v={minutesAgo(e.lastUpdated)} />
                <Field k="Affected area" v={`~${e.affectedAreaKm2.toLocaleString("en-IN")} km²`} />
                <Field k="Summary" v={e.summary} />
              </dl>
            </Panel>
          </div>
          <div className="space-y-3">
            {backendEvent ? <BackendEventPanel event={e} /> : <AIPanel e={e} />}
            {backendEvent ? (
              <BackendReportsPanel reports={reports} />
            ) : (
              <SourcesPanel e={e} reports={reports} />
            )}
          </div>
          <div className="space-y-3">
            {!backendEvent && <ScorePanel e={e} />}
            <Panel title="Event lifecycle">
              <EventLifecycle event={e} compact />
            </Panel>
          </div>
        </div>
      )}
      {tab === "AI Analysis" &&
        (backendEvent ? (
          <BackendEventPanel event={e} />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            <AIPanel e={e} />
            <ScorePanel e={e} />
          </div>
        ))}
      {tab === "Sources & Evidence" &&
        (backendEvent ? (
          <div className="space-y-3">
            <BackendEventPanel event={e} />
            <BackendReportsPanel reports={reports} />
          </div>
        ) : (
          <div className="space-y-3">
            <HumanDecisionSummary e={e} reports={reports} decisions={evDecisions} />
            <div className="grid gap-3 xl:grid-cols-2">
              <AIEvidence e={e} reports={reports} />
              <ScorePanel e={e} />
              <OfficialEvidence e={e} />
              <ExternalEvidence e={e} />
            </div>
            <CitizenEvidence reports={reports} />
          </div>
        ))}
      {tab === "Duplicates" && (
        <Panel
          title={`Near-duplicate reports in ${e.id} (${dupPairs.length})`}
          actions={
            <Link to="/duplicates" className="text-[11px] text-primary">
              All duplicates →
            </Link>
          }
          bodyClassName="p-1"
        >
          <DuplicateTable pairs={dupPairs} showEvent={false} />
        </Panel>
      )}
      {tab === "Timeline" && (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Panel
            title={backendEvent ? "Event state" : "Event lifecycle (12 stages)"}
            actions={backendEvent ? undefined : <DemoTag />}
          >
            <EventLifecycle event={e} />
          </Panel>
          <Panel title="Human decisions" bodyClassName="p-1">
            {backendEvent ? (
              <div className="p-3">
                <EmptyState
                  title="No decision history available"
                  description="The Event API does not return human decision records."
                />
              </div>
            ) : evDecisions.length ? (
              <DataTable
                rows={evDecisions}
                rowKey={(d) => d.id}
                columns={[
                  {
                    key: "id",
                    header: "Decision",
                    render: (d) => <span className="font-mono text-[11px]">{d.id}</span>,
                  },
                  {
                    key: "a",
                    header: "Action",
                    render: (d) => <span className="font-semibold uppercase">{d.action}</span>,
                  },
                  {
                    key: "s",
                    header: "Transition",
                    className: "font-mono text-[10px]",
                    render: (d) => `${d.fromState} → ${d.toState}`,
                  },
                  { key: "r", header: "Reason", render: (d) => d.reason },
                  { key: "b", header: "By", render: (d) => d.decidedBy },
                ]}
              />
            ) : (
              <div className="p-3">
                <EmptyState
                  title="No human decision yet"
                  description={
                    PENDING.includes(e.verification)
                      ? "This event is waiting in the verification queue."
                      : "Verified automatically by corroboration rules."
                  }
                />
              </div>
            )}
          </Panel>
        </div>
      )}
      {tab === "Map" && (
        <Panel title="Event location" bodyClassName="p-0">
          <MapLibreEventMap
            events={[e, ...related]}
            reports={mapReports}
            selectedId={e.id}
            className="h-[520px]"
          />
        </Panel>
      )}
      {tab === "Related" && (
        <Panel title="Related events (same state or type)" bodyClassName="p-0">
          <div className="grid gap-px md:grid-cols-2">
            {related.map((r) => (
              <Link key={r.id} to="/events/$eventId" params={{ eventId: r.id }}>
                <EventStreamRow event={r} />
              </Link>
            ))}
          </div>
        </Panel>
      )}
      <p className="text-[10px] text-muted-foreground">
        {backendEvent
          ? `Verification state: ${VERIFICATION_LABEL[e.verification]}.`
          : `Verification state “${VERIFICATION_LABEL[e.verification]}” reflects simulated demo processing.`}
      </p>
    </div>
  );
}
