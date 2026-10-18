import type { ReactNode } from "react";
import { Bot, Building2, Gavel, Globe2, Users } from "lucide-react";
import { Panel, SeverityBadge, VerificationBadge } from "@/components/hs/primitives";
import { ReportText } from "@/components/hs/ReportText";
import { EVENT_TYPE_LABEL } from "@/data/mockEvents";
import { minutesAgo, pct } from "@/utils/format";
import { cn } from "@/lib/utils";
import type { Report, SourceKind, VerificationDecision, WeatherEvent } from "@/types";

const ist = (iso: string) =>
  `${new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false })} IST`;
const offset = (iso: string, min: number) =>
  new Date(new Date(iso).getTime() + min * 60000).toISOString();

/** Reusable "where did this come from" block shown on every evidence item. */
export function EvidenceProvenance({
  source,
  type,
  timestamp,
  status,
  id,
  location,
}: {
  source: string;
  type: string;
  timestamp: string;
  status: string;
  id?: string;
  location?: string;
}) {
  return (
    <dl className="grid grid-cols-[72px_1fr] gap-x-2 gap-y-0.5 rounded-sm border border-border/70 bg-background/40 p-1.5 text-[10px]">
      <dt className="text-muted-foreground">Source</dt>
      <dd className="font-semibold">{source}</dd>
      {id && (
        <>
          <dt className="text-muted-foreground">ID</dt>
          <dd className="font-mono text-primary">{id}</dd>
        </>
      )}
      <dd>{type}</dd>
      <dt className="text-muted-foreground">Timestamp</dt>
      <dd className="font-mono">{timestamp}</dd>
      {location && (
        <>
          <dt className="text-muted-foreground">Location</dt>
          <dd>{location}</dd>
        </>
      )}
      <dt className="text-muted-foreground">Status</dt>
      <dd className="font-semibold uppercase tracking-wider text-sev-medium">{status}</dd>
    </dl>
  );
}

function Section({
  icon: Icon,
  title,
  label,
  tone,
  children,
}: {
  icon: typeof Bot;
  title: string;
  label: string;
  tone: string;
  children: ReactNode;
}) {
  return (
    <Panel
      className={cn("border-l-4", tone)}
      title={
        <span className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5" />
          {title}
        </span>
      }
      actions={
        <span className="rounded-sm border border-border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      }
    >
      {children}
    </Panel>
  );
}

const OFFICIAL: { kind: SourceKind[]; name: string; obs: (e: WeatherEvent) => string }[] = [
  {
    kind: ["IMD"],
    name: "IMD",
    obs: (e) => `${EVENT_TYPE_LABEL[e.type]} conditions in AWS + radar observation within 10 km`,
  },
  { kind: ["IMD"], name: "SACHET", obs: (e) => `CAP warning for ${e.district} district` },
  {
    kind: ["Satellite"],
    name: "MOSDAC",
    obs: () => "INSAT-3DR cloud-top / rain-rate product over area",
  },
  {
    kind: ["Satellite"],
    name: "INCOIS",
    obs: (e) =>
      e.type === "strong_wind" || e.type === "thunderstorm"
        ? "Storm-surge / high-wave bulletin"
        : "No ocean-state signal for this event",
  },
  {
    kind: ["Sensor"],
    name: "Municipal sensors",
    obs: () => "Rain-gauge / water-level telemetry above threshold",
  },
];
const EXTERNAL = [
  { name: "News/RSS", kinds: ["News/RSS"] as SourceKind[], rel: "High" },
  { name: "YouTube", kinds: ["Social"] as SourceKind[], rel: "Medium" },
  {
    name: "Open-Meteo (weather API)",
    kinds: ["IMD", "Satellite", "Sensor", "Citizen", "News/RSS", "Social"] as SourceKind[],
    rel: "Medium",
  },
  { name: "Licensed external feed", kinds: ["News/RSS"] as SourceKind[], rel: "Low" },
];

export function AIEvidence({ e, reports }: { e: WeatherEvent; reports: Report[] }) {
  const dups = reports.filter((r) => r.duplicateStatus !== "unique").length;
  return (
    <Section icon={Bot} title="AI Analysis" label="AI analysis — demo" tone="border-l-primary">
      <dl className="grid grid-cols-[140px_1fr] gap-y-1.5 text-[12px]">
        <dt className="text-muted-foreground">Classification</dt>
        <dd className="font-semibold">{EVENT_TYPE_LABEL[e.type]}</dd>
        <dt className="text-muted-foreground">Confidence</dt>
        <dd className="font-mono">{pct(e.confidence)}</dd>
        <dt className="text-muted-foreground">Detected event</dt>
        <dd className="flex items-center gap-2">
          {EVENT_TYPE_LABEL[e.type]} <SeverityBadge severity={e.severity} />
        </dd>
        <dt className="text-muted-foreground">Detected location</dt>
        <dd>
          {e.location}, {e.district ?? "Unknown district"}, {e.state ?? "Unknown state"}{" "}
          {e.lat !== null && e.lng !== null && (
            <span className="font-mono text-muted-foreground">
              ({e.lat.toFixed(3)}, {e.lng.toFixed(3)})
            </span>
          )}
        </dd>
        <dt className="text-muted-foreground">NLP findings</dt>
        <dd>
          Hazard keywords consistent across{" "}
          {reports.filter((r) => r.sourceType === "citizen").length} citizen text(s);{" "}
          {new Set(reports.map((r) => r.language)).size} language(s)
        </dd>
        <dt className="text-muted-foreground">Computer vision</dt>
        <dd>
          {e.images
            ? `${e.images} image(s), ${e.videos} video(s) analysed — ${EVENT_TYPE_LABEL[e.type].toLowerCase()} indicators present`
            : "No media attached"}
        </dd>
        <dt className="text-muted-foreground">Duplicate analysis</dt>
        <dd>{dups ? `${dups} suspected near-duplicate report(s)` : "No duplicates detected"}</dd>
      </dl>
      <div className="mt-2">
        <EvidenceProvenance
          source="HIKARI AI pipeline"
          type="AI Analysis"
          timestamp={ist(e.lastUpdated)}
          status="Demo model output"
        />
      </div>
    </Section>
  );
}

export function OfficialEvidence({ e }: { e: WeatherEvent }) {
  const items = OFFICIAL.filter((o) => o.kind.some((k) => e.sourceKinds.includes(k)));
  return (
    <Section
      icon={Building2}
      title="Official Observations"
      label="Simulated / demo data"
      tone="border-l-sev-low"
    >
      {items.length ? (
        <div className="grid gap-2 md:grid-cols-2">
          {items.map((o, i) => (
            <div
              key={o.name}
              className="space-y-1.5 rounded-sm border border-border bg-panel-raised/50 p-2"
            >
              <div className="text-[12px]">
                <span className="font-semibold">{o.name}</span> — {o.obs(e)}
              </div>
              <EvidenceProvenance
                source={o.name}
                type="Official Observation"
                timestamp={ist(offset(e.reportedAt, -10 + i * 4))}
                location={`${e.district}, ${e.state}`}
                status="Simulated"
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[12px] text-muted-foreground">
          No official observation linked to this event.
        </p>
      )}
    </Section>
  );
}

export function CitizenEvidence({ reports }: { reports: Report[] }) {
  const citizen = reports.filter((r) => r.sourceType === "citizen");
  return (
    <Section icon={Users} title="Citizen Evidence" label="Citizen evidence" tone="border-l-info">
      <p className="mb-2 text-[11px] text-muted-foreground">
        Citizen submissions are not verified unless a human decision exists.
      </p>
      {citizen.length ? (
        <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
          {citizen.map((r) => (
            <div
              key={r.id}
              className="grid gap-2 rounded-sm border border-border bg-panel-raised/50 p-2 md:grid-cols-[minmax(0,1fr)_200px]"
            >
              <div className="min-w-0 space-y-1 text-[12px]">
                <ReportText report={r} />
                <div className="flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
                  <span>Media: {r.media.length || "none"}</span>
                  <span>
                    AI:{" "}
                    {r.aiClassification ? EVENT_TYPE_LABEL[r.aiClassification] : "Not classified"}{" "}
                    {r.aiConfidence !== null ? pct(r.aiConfidence) : ""}
                  </span>
                  <span className={r.duplicateStatus === "unique" ? "" : "text-sev-medium"}>
                    Duplicate: {r.duplicateStatus}
                  </span>
                  {r.status === "received" || r.status === "processing" ? (
                    <span className="uppercase">{r.status}</span>
                  ) : (
                    <VerificationBadge status={r.status} />
                  )}
                </div>
              </div>
              <EvidenceProvenance
                source="Citizen Report"
                id={r.id}
                type="Citizen Evidence"
                timestamp={ist(r.reportedAt)}
                location={r.location}
                status={r.status === "verified" ? "Verified by reviewer" : "Under review"}
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[12px] text-muted-foreground">No citizen reports linked.</p>
      )}
    </Section>
  );
}

export function ExternalEvidence({ e }: { e: WeatherEvent }) {
  const items = EXTERNAL.filter((x) => x.kinds.some((k) => e.sourceKinds.includes(k)));
  return (
    <Section
      icon={Globe2}
      title="External / Other Sources"
      label="Simulated / demo data"
      tone="border-l-sev-medium"
    >
      <div className="grid gap-2 md:grid-cols-2">
        {items.map((x, i) => (
          <div
            key={x.name}
            className="space-y-1.5 rounded-sm border border-border bg-panel-raised/50 p-2"
          >
            <div className="flex items-center text-[12px]">
              <span className="font-semibold">{x.name}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">Relevance: {x.rel}</span>
            </div>
            <EvidenceProvenance
              source={x.name}
              type="External source"
              timestamp={`Published ${ist(offset(e.reportedAt, 6 + i * 7))}`}
              {...(e.state ? { location: e.state } : {})}
              status="Simulated"
            />
          </div>
        ))}
      </div>
    </Section>
  );
}

/** Side-by-side summary keeping machine, official, crowd, external and human signals visually separate. */
export function HumanDecisionSummary({
  e,
  reports,
  decisions,
}: {
  e: WeatherEvent;
  reports: Report[];
  decisions: VerificationDecision[];
}) {
  const last = decisions.at(-1);
  const official = OFFICIAL.filter((o) => o.kind.some((k) => e.sourceKinds.includes(k))).length;
  const external = EXTERNAL.filter((x) => x.kinds.some((k) => e.sourceKinds.includes(k))).length;
  const cells = [
    { k: "AI Classification", v: pct(e.confidence), c: "border-primary/50 text-primary" },
    {
      k: "Official Evidence",
      v: official ? `Corroborating (${official})` : "None",
      c: "border-sev-low/50 text-sev-low",
    },
    {
      k: "Citizen Evidence",
      v: `${reports.filter((r) => r.sourceType === "citizen").length} reports`,
      c: "border-info/50 text-info",
    },
    { k: "External Evidence", v: `${external} sources`, c: "border-sev-medium/50 text-sev-medium" },
  ];
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Gavel className="h-3.5 w-3.5" />
          Evidence summary & Human Decision
        </span>
      }
    >
      <div className="grid gap-2 md:grid-cols-5">
        {cells.map((c) => (
          <div key={c.k} className={cn("rounded-sm border bg-panel-raised/50 p-2", c.c)}>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.k}</div>
            <div className="mt-1 font-mono text-sm font-semibold">{c.v}</div>
          </div>
        ))}
        <div className="rounded-sm border-2 border-foreground/60 bg-accent/40 p-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Human Decision
          </div>
          {last ? (
            <>
              <div className="mt-1 font-mono text-sm font-bold uppercase">
                {last.action === "approve" ? "Approved" : last.action}
              </div>
              <div className="text-[10px] text-muted-foreground">
                Reviewer: {last.decidedBy} · {minutesAgo(last.decidedAt)}
              </div>
            </>
          ) : (
            <div className="mt-1 text-[12px] font-semibold text-muted-foreground">
              No human decision yet
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
