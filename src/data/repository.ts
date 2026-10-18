// Central DEMO DATA repository. One connected, deterministic dataset:
// Event → Reports → Source/Media; Alert → Event; Decision → Event/Report.
// Session-only mutations (verification decisions, duplicate merges). Swap for a real API later.
import type {
  EventState,
  LifecycleStage,
  Report,
  SourceKind,
  VerificationDecision,
  VerificationStatus,
  WeatherAlert,
  WeatherEvent,
  DecisionAction,
} from "@/types";
import { DEMO_NOW, EVENT_TYPE_LABEL, eventSeeds, type EventSeed } from "./mockEvents";
import { KIND_SOURCE, mockSources } from "./mockSources";
import { mockAlerts } from "./mockAlerts";
import { getActor } from "@/lib/actor";
import type { AuditEntry, CitizenSubmission, AlertInput } from "@/types";

const NOW = new Date(DEMO_NOW).getTime();
const iso = (ms: number) => new Date(ms).toISOString();

const TEXTS: Record<string, [string, string][]> = {
  citizen: [
    ["Heavy rain near RTC bus stand. Roads are completely flooded.", "Telugu"],
    ["Water entered ground floor shops, knee-deep on main road.", "English"],
    ["Underpass closed, buses diverted.", "Tamil"],
    ["Strong winds, a tree has fallen on the road.", "Kannada"],
    ["Very hot since morning, people fainting at the market.", "Hindi"],
    ["Lightning strikes and heavy downpour for 30 minutes.", "Bengali"],
    ["Drains overflowing in our colony.", "Malayalam"],
  ],
  official: [["Observation exceeds warning threshold at nearest station.", "English"]],
  scientific: [
    ["Satellite-derived product shows signal consistent with reported hazard.", "English"],
  ],
  external: [
    ["Local media report disruption consistent with the hazard.", "English"],
    ["Public video shows conditions at the location.", "Hindi"],
  ],
};

/** Original-language text for demo citizen reports; the English line is the DEMO AI translation. */
const ORIGINAL: Record<string, string> = {
  "Heavy rain near RTC bus stand. Roads are completely flooded.":
    "ఆర్టీసీ బస్టాండ్ దగ్గర భారీ వర్షం. రోడ్లు పూర్తిగా నీట మునిగాయి.",
  "Underpass closed, buses diverted.": "சுரங்கப்பாதை மூடப்பட்டது, பேருந்துகள் திருப்பி விடப்பட்டன.",
  "Strong winds, a tree has fallen on the road.": "ಬಲವಾದ ಗಾಳಿ, ರಸ್ತೆಯ ಮೇಲೆ ಮರ ಬಿದ್ದಿದೆ.",
  "Very hot since morning, people fainting at the market.":
    "सुबह से बहुत गर्मी है, बाज़ार में लोग बेहोश हो रहे हैं।",
  "Lightning strikes and heavy downpour for 30 minutes.": "৩০ মিনিট ধরে বজ্রপাত ও প্রবল বৃষ্টি।",
  "Drains overflowing in our colony.": "ഞങ്ങളുടെ കോളനിയിൽ ഓടകൾ നിറഞ്ഞൊഴുകുന്നു.",
  "Public video shows conditions at the location.":
    "सार्वजनिक वीडियो में स्थान की स्थिति दिख रही है।",
};

const off = (i: number, k: number) => (((i * 9301 + k * 49297) % 233280) / 233280 - 0.5) * 0.18;

function initialState(v: VerificationStatus): EventState {
  return v === "verified"
    ? "VERIFIED"
    : v === "corroborated"
      ? "CORROBORATED"
      : v === "needs_review"
        ? "NEEDS_REVIEW"
        : "ANALYZED";
}

interface EventRow {
  seed: EventSeed;
  id: string;
  verification: VerificationStatus;
  state: EventState;
  mergedInto?: string;
  reportIds: string[];
}

// ---------- seed ----------
let seq = 9821;
const reports = new Map<string, Report>();
const events = new Map<string, EventRow>();

for (const [ei, seed] of eventSeeds.entries()) {
  const id = `EV-2026-00${seed.n}`;
  const start = NOW - seed.minsAgo * 60000 - 6 * 60000;
  const ids: string[] = [];
  // Citizen-heavy mix: every channel contributes at least once, remaining reports cycle with citizen bias.
  const order: SourceKind[] = [...seed.kinds];
  while (order.length < seed.reports) {
    const k = order.length;
    order.push(
      seed.kinds.includes("Citizen") && k % 2 === 0
        ? "Citizen"
        : seed.kinds[k % seed.kinds.length]!,
    );
  }
  order.forEach((kind, j) => {
    const rid = `RP-2026-${String(seq++).padStart(6, "0")}`;
    const src = KIND_SOURCE[kind];
    const pool = TEXTS[src.type]!;
    const [text, language] = pool[(ei + j) % pool.length]!;
    const i = ei * 31 + j;
    const posted = start + j * 50000;
    const prev = ids[ids.length - 1];
    const dup =
      src.type === "citizen" && j % 4 === 3 && prev && reports.get(prev)?.sourceType === "citizen";
    const mediaN = src.type === "citizen" ? i % 3 : src.type === "external" ? 1 : 0;
    reports.set(rid, {
      id: rid,
      eventId: id,
      sourceId: src.id,
      sourceName: mockSources.find((s) => s.id === src.id)!.name,
      sourceType: src.type,
      sourceAccount: src.type === "citizen" ? `citizen-${String(4100 + i).slice(-4)}` : src.account,
      text: dup ? reports.get(prev)!.text : (ORIGINAL[text] ?? text),
      language: dup ? reports.get(prev)!.language : language,
      ...(ORIGINAL[text] && !dup
        ? { translation: text }
        : dup && reports.get(prev)!.translation
          ? { translation: reports.get(prev)!.translation! }
          : {}),
      location: `${seed.location}, ${seed.state}`,
      lat: seed.lat + off(i, 1),
      lng: seed.lng + off(i, 2),
      reportedAt: iso(posted),
      receivedAt: iso(posted + 20000),
      media: Array.from({ length: mediaN }, (_, m) => ({
        id: `MD-${rid.slice(8)}-${m + 1}`,
        kind: m === 1 ? "video" : "image",
      })),
      hasMedia: mediaN > 0,
      aiClassification: seed.type,
      aiConfidence: Math.min(0.99, seed.confidence + ((j % 5) - 2) * 0.02),
      duplicateStatus: dup ? "suspected" : "unique",
      ...(dup ? { duplicateOf: prev, similarity: 0.86 + (j % 5) * 0.025 } : {}),
      status:
        j === 0
          ? seed.verification
          : seed.verification === "verified"
            ? "verified"
            : "needs_review",
    });
    ids.push(rid);
  });
  events.set(id, {
    seed,
    id,
    verification: seed.verification,
    state: initialState(seed.verification),
    reportIds: ids,
  });
}

const alerts: WeatherAlert[] = mockAlerts.map((a) => ({ ...a }));

const decisions: VerificationDecision[] = [
  {
    id: "VER-2026-00318",
    eventId: "EV-2026-001243",
    action: "approve",
    reason: "IMD radar and AWS confirm convective cell.",
    decidedAt: iso(NOW - 12 * 60000),
    decidedBy: "R. Iyer (Verifier)",
    fromState: "CORROBORATED",
    toState: "VERIFIED",
  },
  {
    id: "VER-2026-00319",
    eventId: "EV-2026-001244",
    action: "approve",
    reason: "Station Tmax 45.1°C, three consecutive days.",
    decidedAt: iso(NOW - 20 * 60000),
    decidedBy: "R. Iyer (Verifier)",
    fromState: "CORROBORATED",
    toState: "VERIFIED",
  },
  {
    id: "VER-2026-00320",
    eventId: "EV-2026-001247",
    action: "approve",
    reason: "Rain gauges and citizen media consistent.",
    decidedAt: iso(NOW - 30 * 60000),
    decidedBy: "S. Menon (Verifier)",
    fromState: "CORROBORATED",
    toState: "VERIFIED",
  },
];
let decisionSeq = 321;

// ---------- audit (every session mutation writes here) ----------
let auditSeq = 1;
const audit: AuditEntry[] = [];
function record(
  e: Omit<AuditEntry, "id" | "at" | "actor" | "role" | "session"> & {
    at?: string;
    actor?: string;
    role?: string;
  },
) {
  const a = getActor();
  audit.push({
    id: `AUD-${String(auditSeq++).padStart(5, "0")}`,
    at: e.at ?? new Date().toISOString(),
    actor: e.actor ?? a.name,
    role: e.role ?? a.role,
    session: a.session,
    ...e,
  });
}
decisions.forEach((d) =>
  record({
    at: d.decidedAt,
    actor: d.decidedBy.replace(/ \(Verifier\)/, ""),
    role: "Verifier",
    action: "APPROVED EVENT",
    entity: "Event",
    entityId: d.eventId ?? d.reportId ?? d.id,
    result: "Success",
    reason: d.reason,
    from: d.fromState ?? "UNKNOWN",
    to: d.toState ?? "UNKNOWN",
    related: d.id,
  }),
);

// ---------- citizen submissions ----------
let subSeq = 51;
const submissions: CitizenSubmission[] = [];
let alertSeq = 90;

// ---------- change notification ----------
let version = 0;
const subs = new Set<() => void>();
const bump = () => {
  version++;
  subs.forEach((f) => f());
};
export const repoEvents = {
  subscribe: (f: () => void) => {
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  },
  version: () => version,
};

// ---------- derived views ----------
function fmt(at: number) {
  return iso(at);
}

function lifecycle(
  row: EventRow,
  linked: Report[],
  alertIds: string[],
  evDecisions: VerificationDecision[],
): LifecycleStage[] {
  const t0 = Math.min(...linked.map((r) => new Date(r.receivedAt).getTime()));
  const hasOfficial = linked.some(
    (r) => r.sourceType === "official" || r.sourceType === "scientific",
  );
  const last = evDecisions[evDecisions.length - 1];
  const st = row.state;
  const verifiedish = st === "VERIFIED";
  const reviewed = !!last;
  const order: EventState[] = [
    "DETECTED",
    "PROCESSING",
    "ANALYZED",
    "CORRELATED",
    "CORROBORATED",
    "NEEDS_REVIEW",
    "VERIFIED",
  ];
  const reach = st === "REJECTED" || st === "MERGED" ? 6 : order.indexOf(st);
  const at = (m: number) => fmt(t0 + m * 60000);
  const s = (done: boolean, current = false) =>
    (done ? "done" : current ? "current" : "pending") as LifecycleStage["status"];
  const dupes = linked.filter((r) => r.duplicateStatus !== "unique").length;
  const corroborated = hasOfficial && reach >= 4;
  const stages: LifecycleStage[] = [
    {
      key: "received",
      label: "Report Received",
      status: "done",
      at: at(0),
      description: `First of ${linked.length} reports received`,
      system: "Ingestion gateway",
    },
    {
      key: "processing",
      label: "Processing",
      status: "done",
      at: at(0.5),
      description: "Normalised, language detected, media extracted",
      system: "Stream processor",
    },
    {
      key: "ai",
      label: "AI Analysis",
      status: "done",
      at: at(1),
      description: "Hazard type and severity classified (demo model)",
      system: "Classifier service",
    },
    {
      key: "geo",
      label: "Geo Enrichment",
      status: "done",
      at: at(1.5),
      description: `Geocoded to ${row.seed.district}, ${row.seed.state}`,
      system: "Geo service",
    },
    {
      key: "dup",
      label: "Duplicate Check",
      status: "done",
      at: at(2),
      description: `${dupes} near-duplicate report(s) flagged`,
      system: "Similarity index",
    },
    {
      key: "corr",
      label: "Event Correlation",
      status: s(reach >= 3 || reach === 2),
      at: at(3),
      description: `${linked.length} reports clustered into ${row.id}`,
      system: "Correlation engine",
    },
    {
      key: "official",
      label: "Official Corroboration",
      status: hasOfficial ? "done" : "skipped",
      at: hasOfficial ? at(5) : null,
      description: hasOfficial
        ? "Official / scientific observation matched"
        : "No official observation yet",
      system: "Corroboration rules",
    },
    {
      key: "verif",
      label: "Verification",
      status: s(reach >= 4 || reach === 5, reach === 2),
      at: reach >= 4 ? at(6) : null,
      description: corroborated
        ? "Corroboration threshold met"
        : "Score below auto-verify threshold",
      system: "Scoring service",
    },
    {
      key: "human",
      label: "Human Review",
      status: reviewed
        ? "done"
        : st === "NEEDS_REVIEW" || st === "ANALYZED"
          ? "current"
          : verifiedish
            ? "skipped"
            : "pending",
      at: last?.decidedAt ?? null,
      description: last
        ? `${last.action.toUpperCase()} by ${last.decidedBy}`
        : st === "NEEDS_REVIEW" || st === "ANALYZED"
          ? "Pending in verification queue"
          : "Not required (auto)",
      system: "Verifier desk",
    },
    {
      key: "final",
      label: st === "REJECTED" ? "Rejected" : st === "MERGED" ? "Merged" : "Verified Event",
      status: verifiedish || st === "REJECTED" || st === "MERGED" ? "done" : "pending",
      at: verifiedish || st === "REJECTED" || st === "MERGED" ? (last?.decidedAt ?? at(7)) : null,
      description:
        st === "MERGED"
          ? `Merged into ${row.mergedInto}`
          : st === "REJECTED"
            ? (last?.reason ?? "Rejected")
            : verifiedish
              ? "Event state VERIFIED"
              : "Awaiting decision",
      system: "Event registry",
    },
    {
      key: "alert",
      label: "Alert Generated",
      status: alertIds.length ? "done" : "pending",
      at: alertIds.length ? at(8) : null,
      description: alertIds.length ? alertIds.join(", ") : "No alert linked",
      system: "Alert service",
    },
    {
      key: "analytics",
      label: "Analytics Updated",
      status: verifiedish || st === "CORROBORATED" ? "done" : "pending",
      at: verifiedish || st === "CORROBORATED" ? at(9) : null,
      description: "Counted in trends and KPIs",
      system: "Analytics store",
    },
  ];
  return stages;
}

function toEvent(row: EventRow): WeatherEvent {
  const s = row.seed;
  const linked = row.reportIds.map((id) => reports.get(id)!);
  const counted = linked.filter((r) => r.duplicateStatus !== "merged");
  const sourceIds = [...new Set(counted.map((r) => r.sourceId))];
  const kinds = s.kinds.filter((k) => sourceIds.includes(KIND_SOURCE[k].id));
  const alertIds = alerts.filter((a) => a.eventId === row.id).map((a) => a.id);
  const evDecisions = decisions.filter((d) => d.eventId === row.id);
  const images = linked.reduce((n, r) => n + r.media.filter((m) => m.kind === "image").length, 0);
  const videos = linked.reduce((n, r) => n + r.media.filter((m) => m.kind === "video").length, 0);
  const lastUpdated = evDecisions.length
    ? evDecisions[evDecisions.length - 1]!.decidedAt
    : linked[linked.length - 1]!.receivedAt;
  return {
    id: row.id,
    title: `${EVENT_TYPE_LABEL[s.type]} — ${s.location}`,
    type: s.type,
    severity: s.severity,
    verification: row.verification,
    lifecycleState: row.state,
    location: s.location,
    district: s.district,
    state: s.state,
    lat: s.lat,
    lng: s.lng,
    reportedAt: iso(NOW - s.minsAgo * 60000),
    startTime: linked[0]!.reportedAt,
    lastUpdated,
    reports: counted.length,
    sources: sourceIds.length,
    sourceKinds: kinds,
    confidence: s.confidence,
    affectedAreaKm2: s.area,
    images,
    videos,
    mediaCount: images + videos,
    summary: s.summary,
    reportIds: row.reportIds,
    sourceIds,
    alertIds,
    decisionIds: evDecisions.map((d) => d.id),
    duplicateCount: linked.filter((r) => r.duplicateStatus === "suspected").length,
    lifecycle: lifecycle(row, linked, alertIds, evDecisions),
    ...(row.mergedInto ? { mergedInto: row.mergedInto } : {}),
  };
}

export const repo = {
  events(): WeatherEvent[] {
    return [...events.values()].map(toEvent);
  },
  event(id: string): WeatherEvent | null {
    const r = events.get(id);
    return r ? toEvent(r) : null;
  },
  reports(): Report[] {
    return [...reports.values()].map((r) => ({ ...r }));
  },
  reportsByEvent(eventId: string): Report[] {
    return (events.get(eventId)?.reportIds ?? []).map((id) => ({ ...reports.get(id)! }));
  },
  report(id: string): Report | null {
    const r = reports.get(id);
    return r ? { ...r } : null;
  },
  alerts(): WeatherAlert[] {
    return alerts.map((a) => ({ ...a }));
  },
  alert(id: string): WeatherAlert | null {
    const a = alerts.find((x) => x.id === id);
    return a ? { ...a } : null;
  },
  sources() {
    return mockSources.map((s) => ({ ...s }));
  },
  decisions(): VerificationDecision[] {
    return [...decisions].reverse();
  },

  decide(input: {
    eventId: string;
    action: DecisionAction;
    reason: string;
    targetEventId?: string;
    by?: string;
  }): VerificationDecision {
    const row = events.get(input.eventId);
    if (!row) throw new Error(`Unknown event ${input.eventId}`);
    if (input.action !== "approve" && !input.reason.trim()) throw new Error("A reason is required");
    const from = row.state;
    if (input.action === "approve") {
      row.state = "VERIFIED";
      row.verification = "verified";
    }
    if (input.action === "reject") {
      row.state = "REJECTED";
      row.verification = "rejected";
    }
    if (input.action === "escalate") {
      row.state = "NEEDS_REVIEW";
      row.verification = "escalated";
    }
    if (input.action === "merge") {
      const target = input.targetEventId && events.get(input.targetEventId);
      if (!target || target.id === row.id) throw new Error("Choose a different target event");
      row.state = "MERGED";
      row.verification = "merged";
      row.mergedInto = target.id;
    }
    row.reportIds.forEach((id) => {
      const r = reports.get(id)!;
      if (input.action === "approve") r.status = "verified";
      if (input.action === "reject") r.status = "rejected";
    });
    const d: VerificationDecision = {
      id: `VER-2026-${String(decisionSeq++).padStart(5, "0")}`,
      eventId: row.id,
      action: input.action,
      reason: input.reason.trim() || "Evidence sufficient",
      decidedAt: iso(NOW + (decisionSeq - 321) * 60000),
      decidedBy: input.by ?? "Demo Verifier",
      fromState: from,
      toState: row.state,
      ...(input.targetEventId && input.action === "merge"
        ? { targetEventId: input.targetEventId }
        : {}),
    };
    decisions.push(d);
    record({
      action: `${
        {
          start_review: "REVIEW STARTED",
          approve: "APPROVED",
          verify: "VERIFIED",
          reject: "REJECTED",
          request_evidence: "NEEDS MORE EVIDENCE",
          escalate: "ESCALATED",
          merge: "MERGED",
        }[input.action]
      } EVENT`,
      entity: "Event",
      entityId: row.id,
      result: "Success",
      reason: d.reason,
      from,
      to: row.state,
      related: input.targetEventId ?? d.id,
    });
    bump();
    return d;
  },

  resolveDuplicate(reportId: string, resolution: "merged" | "ignored") {
    const r = reports.get(reportId);
    if (!r || r.duplicateStatus !== "suspected") throw new Error("Not a suspected duplicate");
    r.duplicateStatus = resolution;
    record({
      action: resolution === "merged" ? "MERGED DUPLICATE" : "IGNORED DUPLICATE",
      entity: "Report",
      entityId: r.id,
      result: "Success",
      reason:
        resolution === "merged" ? `Duplicate of ${r.duplicateOf}` : "Kept as independent report",
      from: "suspected",
      to: resolution,
      ...(r.eventId ? { related: r.eventId } : {}),
    });
    bump();
  },

  audit(): AuditEntry[] {
    return [...audit].reverse();
  },
  recordRoleChange(from: string, to: string) {
    record({
      action: "CHANGED ROLE",
      entity: "User",
      entityId: getActor().session,
      result: "Success",
      reason: "Demo role switch",
      from,
      to,
    });
    bump();
  },
  setUserRole(userId: string, name: string, from: string, to: string) {
    record({
      action: "CHANGED USER ROLE",
      entity: "User",
      entityId: userId,
      result: "Success",
      reason: `Role of ${name} updated`,
      from,
      to,
    });
    bump();
  },

  submissions(): CitizenSubmission[] {
    return [...submissions].reverse();
  },
  submission(id: string): CitizenSubmission | null {
    return submissions.find((s) => s.id === id.trim().toUpperCase()) ?? null;
  },
  submitReport(input: Omit<CitizenSubmission, "id" | "submittedAt">): CitizenSubmission {
    if (!input.description.trim() || !input.location.trim())
      throw new Error("Description and location are required");
    const sub: CitizenSubmission = {
      ...input,
      id: `CR-2026-${String(subSeq++).padStart(5, "0")}`,
      submittedAt: new Date().toISOString(),
    };
    submissions.push(sub);
    record({
      action: "SUBMITTED REPORT",
      entity: "Report",
      entityId: sub.id,
      result: "Success",
      reason: `${input.hazard} at ${input.location}${input.triage ? ` · AI: ${input.triage.urgency} → ${input.triage.queue}` : ""}`,
      to: "RECEIVED",
    });
    bump();
    return sub;
  },

  saveAlert(input: AlertInput & { id?: string }): WeatherAlert {
    if (!input.title.trim() || !input.region.trim())
      throw new Error("Title and region are required");
    if (!input.channels.length) throw new Error("Select at least one channel");
    const existing = input.id ? alerts.find((a) => a.id === input.id) : undefined;
    if (existing) {
      const from = `${existing.severity}/${existing.status}`;
      Object.assign(existing, input);
      record({
        action: "UPDATED ALERT",
        entity: "Alert",
        entityId: existing.id,
        result: "Success",
        reason: input.message.slice(0, 80),
        from,
        to: `${existing.severity}/${existing.status}`,
        related: existing.eventId,
      });
      bump();
      return { ...existing };
    }
    const a: WeatherAlert = {
      id: `ALT-2026-${String(alertSeq++).padStart(5, "0")}`,
      issuer: "HIKARI SENSE Ops (demo)",
      eventId: input.eventId,
      title: input.title,
      region: input.region,
      detail: input.message,
      message: input.message,
      severity: input.severity,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      instructions: input.instructions,
      alertType: input.alertType,
      affectedArea: input.affectedArea,
      status: input.status,
      recipients: input.recipients,
      channels: input.channels,
    };
    alerts.unshift(a);
    record({
      action: "CREATED ALERT",
      entity: "Alert",
      entityId: a.id,
      result: "Success",
      reason: input.title,
      to: `${a.severity}/${a.status}`,
      related: a.eventId,
    });
    bump();
    return { ...a };
  },
  setAlertStatus(id: string, status: WeatherAlert["status"]) {
    const a = alerts.find((x) => x.id === id);
    if (!a) throw new Error(`Unknown alert ${id}`);
    const from = a.status;
    a.status = status;
    record({
      action: status === "active" ? "ACTIVATED ALERT" : "DEACTIVATED ALERT",
      entity: "Alert",
      entityId: id,
      result: "Success",
      reason: `Status ${from} → ${status}`,
      from,
      to: status,
      related: a.eventId,
    });
    bump();
  },
};
