import { ReportText } from "@/components/hs/ReportText";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import {
  citizenReviewQueueQuery,
  decisionsQuery,
  eventsQuery,
  reportAuditQuery,
  reportAssignmentsQuery,
  reportEvidenceQuery,
  reportsQuery,
  reviewersQuery,
  useAssignReviewer,
  useReportReview,
} from "@/hooks/useWeather";
import { PENDING, type ReportEvidence } from "@/services/api";
import { submissionService } from "@/services/api";
import { MapLibreEventMap } from "@/features/map/MapLibreEventMap";
import { DecisionActions } from "./DecisionActions";
import {
  DemoTag,
  EmptyState,
  FilterBar,
  FilterChip,
  MetricCard,
  Panel,
  SectionHeader,
  SeverityBadge,
  VerificationBadge,
} from "@/components/hs/primitives";
import { DataTable } from "@/components/hs/data";
import { Modal } from "@/components/hs/data";
import { EVENT_TYPE_LABEL } from "@/data/mockEvents";
import { minutesAgo, pct } from "@/utils/format";
import type { Report, ReportReviewAction, ReviewQueueFilters, VerificationStatus } from "@/types";
import { hasPermission, useRole } from "@/lib/roles";
import type { Role } from "@/lib/actor";

export function VerificationQueuePage() {
  const role = useRole();
  const { data: events } = useSuspenseQuery(eventsQuery);
  const { data: decisions } = useSuspenseQuery(decisionsQuery);
  const { data: reviewers = [] } = useQuery(reviewersQuery(role ?? "analyst"));
  const [view, setView] = useState<"events" | "citizen" | "decided">("events");
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [filters, setFilters] = useState<ReviewQueueFilters>({ page: 1, page_size: 25 });
  const [draftFilters, setDraftFilters] = useState<ReviewQueueFilters>({ page: 1, page_size: 25 });
  const reportsQuery = useQuery(citizenReviewQueueQuery(role ?? "analyst", filters));
  const reportPage = reportsQuery.data;
  const citizenReports = reportPage?.items ?? [];
  const queue = events
    .filter((event) => PENDING.includes(event.verification))
    .sort((left, right) => right.reports - left.reports || left.id.localeCompare(right.id));
  const activeFilterCount = Object.entries(filters).filter(
    ([key, value]) => !["page", "page_size"].includes(key) && value !== undefined && value !== "",
  ).length;

  return (
    <div className="space-y-3">
      <SectionHeader
        eyebrow="Verification"
        title="Verification Queue"
        description="Review citizen submissions and candidate events. Human decisions are recorded by the backend."
      />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <MetricCard label="Event queue" value={String(queue.length)} tone="medium" />
        <MetricCard
          label="Citizen reports"
          value={String(reportPage?.total ?? 0)}
          tone="critical"
        />
        <MetricCard
          label="Escalated"
          value={String(
            queue.filter((event) => event.verification === "escalated").length +
              (reportPage?.status_counts["ESCALATED"] ?? 0),
          )}
          tone="critical"
        />
        <MetricCard label="Recorded decisions" value={String(decisions.length)} tone="low" />
      </div>
      <FilterBar>
        <FilterChip active={view === "events"} onClick={() => setView("events")}>
          Events ({queue.length})
        </FilterChip>
        <FilterChip active={view === "citizen"} onClick={() => setView("citizen")}>
          Citizen reports ({reportPage?.total ?? 0})
        </FilterChip>
        <FilterChip active={view === "decided"} onClick={() => setView("decided")}>
          Decision timeline ({decisions.length})
        </FilterChip>
      </FilterBar>
      {view === "events" ? (
        <Panel title="Event review queue" bodyClassName="p-1">
          {queue.length === 0 ? (
            <div className="p-3">
              <EmptyState
                title="Queue is clear"
                description="No events currently need human review."
              />
            </div>
          ) : (
            <DataTable
              rows={queue}
              rowKey={(event) => event.id}
              columns={[
                {
                  key: "id",
                  header: "Event",
                  render: (event) => (
                    <Link
                      to="/events/$eventId"
                      params={{ eventId: event.id }}
                      className="font-mono text-[11px] text-primary hover:underline"
                    >
                      {event.id}
                    </Link>
                  ),
                },
                {
                  key: "severity",
                  header: "Severity",
                  render: (event) => <SeverityBadge severity={event.severity} />,
                },
                {
                  key: "state",
                  header: "State",
                  render: (event) => <VerificationBadge status={event.verification} />,
                },
                {
                  key: "confidence",
                  header: "Conf.",
                  className: "font-mono",
                  render: (event) => pct(event.confidence),
                },
                {
                  key: "reports",
                  header: "Reports",
                  className: "font-mono",
                  render: (event) => `${event.reports} / ${event.sources} src`,
                },
                {
                  key: "waiting",
                  header: "Waiting",
                  className: "text-muted-foreground",
                  render: (event) => minutesAgo(event.reportedAt),
                },
                {
                  key: "action",
                  header: "Decision",
                  render: (event) => <DecisionActions event={event} />,
                },
              ]}
            />
          )}
        </Panel>
      ) : view === "citizen" ? (
        <Panel title="Citizen report review" bodyClassName="p-1">
          <ReviewQueueFilterForm
            draft={draftFilters}
            reviewers={reviewers}
            total={reportPage?.total ?? 0}
            activeCount={activeFilterCount}
            onChange={setDraftFilters}
            onApply={() => setFilters({ ...draftFilters, page: 1, page_size: filters.page_size })}
            onClear={() => {
              const reset = { page: 1, page_size: filters.page_size };
              setDraftFilters(reset);
              setFilters(reset);
            }}
          />
          {reportsQuery.isLoading ? (
            <div className="p-3 text-[12px] text-muted-foreground">Loading reports…</div>
          ) : reportsQuery.isError ? (
            <div role="alert" className="p-3 text-[12px] text-sev-critical">
              Could not load review reports. {reportsQuery.error.message}
            </div>
          ) : citizenReports.length === 0 ? (
            <div className="p-3">
              <EmptyState
                title="No reports match these filters"
                description="Adjust or clear filters to see more reports."
              />
            </div>
          ) : (
            <DataTable
              rows={citizenReports}
              rowKey={(report) => report.id}
              onRowClick={setSelectedReport}
              columns={[
                {
                  key: "id",
                  header: "Report",
                  render: (report) => <span className="font-mono text-primary">{report.id}</span>,
                },
                {
                  key: "type",
                  header: "Type",
                  render: (report) =>
                    report.aiClassification
                      ? (EVENT_TYPE_LABEL[report.aiClassification] ?? report.aiClassification)
                      : "Unclassified",
                },
                {
                  key: "location",
                  header: "Location",
                  render: (report) => report.location || "Location unavailable",
                },
                {
                  key: "submitted",
                  header: "Submitted",
                  render: (report) => minutesAgo(report.receivedAt),
                },
                {
                  key: "status",
                  header: "Status",
                  render: (report) => (
                    <VerificationBadge status={report.status as VerificationStatus} />
                  ),
                },
                {
                  key: "priority",
                  header: "Priority",
                  render: (report) => report.priority ?? "normal",
                },
                {
                  key: "reviewer",
                  header: "Reviewer",
                  render: (report) => report.reviewerName ?? "Unassigned",
                },
                {
                  key: "assessment",
                  header: "Assessment",
                  render: (report) =>
                    report.aiConfidence === null
                      ? "Not available"
                      : `${report.aiClassification ?? "Unclassified"} · ${pct(report.aiConfidence)}`,
                },
                {
                  key: "media",
                  header: "Media",
                  render: (report) => `${report.media.length} file(s)`,
                },
                {
                  key: "review",
                  header: "Review",
                  render: () => <span className="text-primary">Open</span>,
                },
              ]}
            />
          )}
          <div className="flex items-center justify-between border-t border-border px-2 py-2 text-[11px]">
            <span className="text-muted-foreground">
              Page {reportPage?.page ?? 1} of {Math.max(1, reportPage?.total_pages ?? 0)} ·{" "}
              {reportPage?.total ?? 0} results
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                aria-label="Previous page"
                disabled={!reportPage || reportPage.page <= 1}
                onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                className="grid h-7 w-7 place-items-center rounded-sm border border-border disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Next page"
                disabled={!reportPage || reportPage.page >= reportPage.total_pages}
                onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                className="grid h-7 w-7 place-items-center rounded-sm border border-border disabled:opacity-40"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </Panel>
      ) : (
        <Panel title="Decision timeline" bodyClassName="p-1">
          <DataTable
            rows={decisions}
            rowKey={(decision) => decision.id}
            columns={[
              {
                key: "id",
                header: "Decision",
                render: (decision) => <span className="font-mono text-[11px]">{decision.id}</span>,
              },
              {
                key: "entity",
                header: "Event / Report",
                render: (decision) =>
                  decision.eventId ? (
                    <Link
                      to="/events/$eventId"
                      params={{ eventId: decision.eventId }}
                      className="font-mono text-[11px] text-primary hover:underline"
                    >
                      {decision.eventId}
                    </Link>
                  ) : (
                    <span className="font-mono text-[11px]">
                      Report {decision.reportId ?? "unknown"}
                    </span>
                  ),
              },
              {
                key: "action",
                header: "Action",
                render: (decision) => (
                  <span className="font-semibold uppercase">{decision.action}</span>
                ),
              },
              {
                key: "transition",
                header: "Transition",
                className: "font-mono text-[10px]",
                render: (decision) => `${decision.fromState} → ${decision.toState}`,
              },
              {
                key: "reason",
                header: "Reason",
                render: (decision) => <span className="line-clamp-2">{decision.reason}</span>,
              },
              { key: "by", header: "By", render: (decision) => decision.decidedBy },
              {
                key: "time",
                header: "Time",
                className: "font-mono text-muted-foreground",
                render: (decision) =>
                  new Date(decision.decidedAt).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                    timeZone: "Asia/Kolkata",
                  }),
              },
            ]}
          />
        </Panel>
      )}
      {selectedReport && (
        <CitizenReportReviewDialog
          report={selectedReport}
          role={role ?? "analyst"}
          onClose={() => setSelectedReport(null)}
        />
      )}
    </div>
  );
}

function ReviewQueueFilterForm({
  draft,
  reviewers,
  total,
  activeCount,
  onChange,
  onApply,
  onClear,
}: {
  draft: ReviewQueueFilters;
  reviewers: { id: string; display_name: string; username: string }[];
  total: number;
  activeCount: number;
  onChange: (filters: ReviewQueueFilters) => void;
  onApply: () => void;
  onClear: () => void;
}) {
  const fieldClass =
    "h-8 w-full rounded-sm border border-border bg-panel-raised px-2 text-[12px] normal-case text-foreground";
  const set = (key: keyof ReviewQueueFilters, value: string | number | boolean | undefined) =>
    onChange({ ...draft, [key]: value });
  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    onApply();
  };
  return (
    <form
      className="grid gap-2 border-b border-border p-2 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={apply}
    >
      <label className="space-y-1 text-[10px] uppercase text-muted-foreground">
        Status
        <select
          className={fieldClass}
          value={draft.status ?? ""}
          onChange={(event) => set("status", event.target.value || undefined)}
        >
          <option value="">All open states</option>
          {[
            "RECEIVED",
            "PROCESSING",
            "AI_ANALYSIS_PENDING",
            "AI_ANALYZED",
            "PENDING_HUMAN_REVIEW",
            "UNDER_REVIEW",
            "NEEDS_MORE_EVIDENCE",
            "ESCALATED",
            "NEEDS_REVIEW",
            "LOW_CONFIDENCE",
          ].map((value) => (
            <option key={value} value={value}>
              {value.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-[10px] uppercase text-muted-foreground">
        Event type
        <select
          className={fieldClass}
          value={draft.event_type ?? ""}
          onChange={(event) => set("event_type", event.target.value || undefined)}
        >
          <option value="">All types</option>
          {Object.entries(EVENT_TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-[10px] uppercase text-muted-foreground">
        Severity
        <select
          className={fieldClass}
          value={draft.severity ?? ""}
          onChange={(event) => set("severity", event.target.value || undefined)}
        >
          <option value="">All severities</option>
          {["critical", "high", "medium", "low"].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-[10px] uppercase text-muted-foreground">
        Location
        <input
          className={fieldClass}
          value={draft.location ?? ""}
          onChange={(event) => set("location", event.target.value || undefined)}
          placeholder="City, district, state"
        />
      </label>
      <label className="space-y-1 text-[10px] uppercase text-muted-foreground">
        From
        <input
          type="datetime-local"
          className={fieldClass}
          value={draft.start_date ?? ""}
          onChange={(event) => set("start_date", event.target.value || undefined)}
        />
      </label>
      <label className="space-y-1 text-[10px] uppercase text-muted-foreground">
        To
        <input
          type="datetime-local"
          className={fieldClass}
          value={draft.end_date ?? ""}
          onChange={(event) => set("end_date", event.target.value || undefined)}
        />
      </label>
      <label className="space-y-1 text-[10px] uppercase text-muted-foreground">
        Media
        <select
          className={fieldClass}
          value={draft.has_media === undefined ? "" : String(draft.has_media)}
          onChange={(event) =>
            set("has_media", event.target.value === "" ? undefined : event.target.value === "true")
          }
        >
          <option value="">Any</option>
          <option value="true">Has media</option>
          <option value="false">No media</option>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-[10px] uppercase text-muted-foreground">
          Confidence min
          <input
            type="number"
            min="0"
            max="1"
            step="0.01"
            className={fieldClass}
            value={draft.ai_confidence_min ?? ""}
            onChange={(event) =>
              set(
                "ai_confidence_min",
                event.target.value === "" ? undefined : Number(event.target.value),
              )
            }
          />
        </label>
        <label className="space-y-1 text-[10px] uppercase text-muted-foreground">
          Confidence max
          <input
            type="number"
            min="0"
            max="1"
            step="0.01"
            className={fieldClass}
            value={draft.ai_confidence_max ?? ""}
            onChange={(event) =>
              set(
                "ai_confidence_max",
                event.target.value === "" ? undefined : Number(event.target.value),
              )
            }
          />
        </label>
      </div>
      <label className="space-y-1 text-[10px] uppercase text-muted-foreground">
        Source
        <input
          className={fieldClass}
          value={draft.source ?? ""}
          onChange={(event) => set("source", event.target.value || undefined)}
          placeholder="Source name or ID"
        />
      </label>
      <label className="space-y-1 text-[10px] uppercase text-muted-foreground">
        Priority
        <select
          className={fieldClass}
          value={draft.priority ?? ""}
          onChange={(event) =>
            set("priority", (event.target.value || undefined) as ReviewQueueFilters["priority"])
          }
        >
          <option value="">All priorities</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
      </label>
      <label className="space-y-1 text-[10px] uppercase text-muted-foreground">
        Reviewer
        <select
          className={fieldClass}
          value={draft.reviewer_id ?? ""}
          onChange={(event) => set("reviewer_id", event.target.value || undefined)}
        >
          <option value="">Any reviewer</option>
          {reviewers.map((reviewer) => (
            <option key={reviewer.id} value={reviewer.id}>
              {reviewer.display_name || reviewer.username}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-end gap-2 lg:col-span-2">
        <button
          type="submit"
          className="h-8 rounded-sm bg-primary px-3 text-[12px] font-semibold text-primary-foreground"
        >
          Apply filters
        </button>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-8 items-center gap-1 rounded-sm border border-border px-3 text-[12px]"
        >
          <RotateCcw className="h-3 w-3" />
          Clear
        </button>
        <span className="text-[11px] text-muted-foreground">
          {total} results · {activeCount} active
        </span>
      </div>
    </form>
  );
}

function CitizenReportReviewDialog({
  report,
  role,
  onClose,
}: {
  report: Report;
  role: Role;
  onClose: () => void;
}) {
  const review = useReportReview();
  const assign = useAssignReviewer(report.id);
  const [reason, setReason] = useState("");
  const [assignmentReason, setAssignmentReason] = useState("");
  const [selectedReviewer, setSelectedReviewer] = useState(report.reviewerId ?? "");
  const { data: audit, isLoading: auditLoading } = useQuery(reportAuditQuery(report.id, role));
  const { data: assignmentRecords = [], isLoading: assignmentLoading } = useQuery(
    reportAssignmentsQuery(report.id, role),
  );
  const { data: reviewers = [] } = useQuery(reviewersQuery(role));
  const { data: evidence, isLoading: evidenceLoading } = useQuery(
    reportEvidenceQuery(report.id, role),
  );
  const reportEvidence: ReportEvidence[] =
    report.lat !== null && report.lng !== null
      ? [
          {
            id: report.id,
            source: "Citizen report",
            sourceCode: "SRC-CITIZEN",
            sourceType: "citizen",
            summary: report.text,
            observedAt: report.reportedAt,
            distanceKm: 0,
            minutesApart: 0,
            reliability: null,
            status: report.status,
            classification: "POTENTIAL_CONTEXT",
            note: "Subject report location; not independent corroboration.",
            lat: report.lat,
            lng: report.lng,
            geometry: null,
          },
        ]
      : [];
  const mapEvidence = [...reportEvidence, ...(evidence ?? [])];
  const inReview = ["UNDER_REVIEW", "ESCALATED"].includes(report.status.toUpperCase());
  const actions: { action: ReportReviewAction; permission: string; label: string }[] = inReview
    ? [
        { action: "verify", permission: "verification:verify", label: "Verify" },
        { action: "reject", permission: "verification:reject", label: "Reject" },
        {
          action: "request_evidence",
          permission: "verification:request_evidence",
          label: "Request more evidence",
        },
        { action: "escalate", permission: "verification:escalate", label: "Escalate" },
      ]
    : [{ action: "start_review", permission: "verification:start_review", label: "Start review" }];
  const allowedActions = actions.filter((item) => hasPermission(role, item.permission));

  return (
    <Modal open onOpenChange={(open) => !open && onClose()} title={`Citizen report ${report.id}`}>
      <div className="max-h-[75vh] space-y-3 overflow-y-auto text-[12px]">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-[10px] uppercase text-muted-foreground">Description</p>
            <p className="mt-1 whitespace-pre-wrap">{report.text}</p>
          </div>
          <div className="space-y-1">
            <p>
              <span className="text-muted-foreground">Location:</span>{" "}
              {report.location || "Unavailable"}
            </p>
            <p>
              <span className="text-muted-foreground">Submitted:</span>{" "}
              {new Date(report.receivedAt).toLocaleString()}
            </p>
            <p>
              <span className="text-muted-foreground">State:</span>{" "}
              {report.status.replaceAll("_", " ")}
            </p>
          </div>
        </div>
        <section className="border-t border-border pt-3">
          <h3 className="text-[10px] font-semibold uppercase text-muted-foreground">
            Automated assessment
          </h3>
          {report.aiClassification && report.aiConfidence !== null ? (
            <p className="mt-1">
              Rules-based baseline: {report.aiClassification} · {pct(report.aiConfidence)}{" "}
              confidence. This is not a trained media model; it is a suggestion only, and human
              review is authoritative.
            </p>
          ) : (
            <p className="mt-1 text-muted-foreground">
              No persisted assessment is available for this report.
            </p>
          )}
        </section>
        <section className="border-t border-border pt-3">
          <h3 className="text-[10px] font-semibold uppercase text-muted-foreground">
            Submitted media
          </h3>
          {report.media.length ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {report.media.map((media) => (
                <ReviewMedia key={media.id} id={media.id} kind={media.kind} role={role} />
              ))}
            </div>
          ) : (
            <p className="mt-1 text-muted-foreground">No media attached.</p>
          )}
        </section>
        <section className="border-t border-border pt-3">
          <h3 className="text-[10px] font-semibold uppercase text-muted-foreground">
            Nearby source evidence
          </h3>
          <p className="mt-1 text-muted-foreground">
            Distance and timing are context only; they do not establish corroboration.
          </p>
          {evidenceLoading ? (
            <p className="mt-1 text-muted-foreground">Checking stored observations…</p>
          ) : evidence?.length ? (
            <ul className="mt-2 space-y-2">
              {evidence.map((item) => (
                <li
                  key={`${item.sourceCode}-${item.id}`}
                  className="border-l-2 border-primary/40 pl-2"
                >
                  <p className="font-semibold">
                    {item.source} · {item.status.replaceAll("_", " ")}
                  </p>
                  <p>{item.summary || "No source description recorded."}</p>
                  <p className="text-muted-foreground">
                    {item.distanceKm} km · {item.minutesApart} min ·{" "}
                    {new Date(item.observedAt).toLocaleString()}
                    {item.reliability === null
                      ? ""
                      : ` · source reliability ${pct(item.reliability)}`}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-muted-foreground">
              No stored source observations were found within 50 km and 6 hours.
            </p>
          )}
        </section>
        <section className="border-t border-border pt-3">
          <h3 className="text-[10px] font-semibold uppercase text-muted-foreground">
            Evidence map
          </h3>
          <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <i className="h-2 w-2 rounded-full bg-sev-critical" />
              FIRMS
            </span>
            <span className="inline-flex items-center gap-1">
              <i className="h-2 w-2 rounded-full bg-sev-high" />
              SACHET / official
            </span>
            <span className="inline-flex items-center gap-1">
              <i className="h-2 w-2 rounded-full bg-chart-3" />
              Citizen
            </span>
            <span className="inline-flex items-center gap-1">
              <i className="h-2 w-2 rounded-full bg-info" />
              Weather / other
            </span>
          </div>
          {evidenceLoading ? (
            <div className="mt-2 grid h-56 place-items-center bg-muted text-[11px] text-muted-foreground">
              Loading stored evidence…
            </div>
          ) : mapEvidence.some(
              (item) => item.geometry || (item.lat !== null && item.lng !== null),
            ) ? (
            <MapLibreEventMap
              events={[]}
              evidence={mapEvidence}
              evidenceVisible
              overlayLabel="Stored evidence"
              showLayerControl
              className="mt-2 h-56 rounded-sm border border-border"
            />
          ) : (
            <p className="mt-2 text-[11px] text-muted-foreground">
              No evidence has usable coordinates.
            </p>
          )}
        </section>
        <section className="border-t border-border pt-3">
          <h3 className="text-[10px] font-semibold uppercase text-muted-foreground">
            Review audit trail
          </h3>
          {auditLoading ? (
            <p className="mt-1 text-muted-foreground">Loading audit history…</p>
          ) : audit?.length ? (
            <ol className="mt-2 space-y-2">
              {audit.map((entry) => (
                <li key={entry.id} className="border-l-2 border-primary/40 pl-2">
                  <p className="font-semibold">
                    {entry.action.replaceAll(".", " ")} · {entry.actor} ({entry.role})
                  </p>
                  <p className="text-muted-foreground">
                    {new Date(entry.at).toLocaleString()} · {entry.reason ?? "No reason recorded"}
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {String(entry.before?.["status"] ?? "-")} →{" "}
                    {String(entry.after?.["status"] ?? "-")}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-1 text-muted-foreground">No review actions recorded.</p>
          )}
        </section>
        {hasPermission(role, "verification:assign") && (
          <section className="border-t border-border pt-3">
            <h3 className="text-[10px] font-semibold uppercase text-muted-foreground">
              Reviewer assignment
            </h3>
            {assignmentLoading ? (
              <p className="mt-1 text-muted-foreground">Loading assignment history…</p>
            ) : assignmentRecords.length > 0 ? (
              <ol className="mt-2 space-y-1 text-[11px]">
                {assignmentRecords.map((assignment) => (
                  <li key={assignment.id} className="text-muted-foreground">
                    {assignment.reviewer_name} · assigned by {assignment.assigned_by_name} ·{" "}
                    {new Date(assignment.assigned_at).toLocaleString()}
                    {assignment.unassigned_at &&
                      ` · unassigned ${new Date(assignment.unassigned_at).toLocaleString()}`}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-1 text-muted-foreground">No assignment history.</p>
            )}
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
              <select
                value={selectedReviewer}
                onChange={(event) => setSelectedReviewer(event.target.value)}
                className="h-8 rounded-sm border border-border bg-panel-raised px-2"
              >
                <option value="">Unassigned</option>
                {reviewers.map((reviewer) => (
                  <option key={reviewer.id} value={reviewer.id}>
                    {reviewer.display_name || reviewer.username} · {reviewer.roles.join(", ")} ·{" "}
                    {reviewer.active_assignments} active
                  </option>
                ))}
              </select>
              <input
                value={assignmentReason}
                onChange={(event) => setAssignmentReason(event.target.value)}
                maxLength={2000}
                placeholder="Assignment reason"
                className="h-8 rounded-sm border border-border bg-panel-raised px-2"
              />
              <button
                type="button"
                disabled={assignmentReason.trim().length < 3 || assign.isPending}
                onClick={() =>
                  assign.mutate(
                    { reviewerId: selectedReviewer || null, reason: assignmentReason.trim() },
                    { onSuccess: () => setAssignmentReason("") },
                  )
                }
                className="h-8 rounded-sm border border-primary/50 px-3 text-primary disabled:opacity-50"
              >
                Save assignment
              </button>
            </div>
          </section>
        )}
        <label className="block border-t border-border pt-3">
          <span className="text-[10px] font-semibold uppercase text-muted-foreground">
            Reviewer notes / reason
          </span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={3}
            maxLength={2000}
            rows={3}
            className="mt-1 w-full rounded-sm border border-border bg-panel-raised p-2"
            placeholder="Record the evidence and rationale for this action."
          />
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          {allowedActions.map(({ action, label }) => (
            <button
              key={action}
              type="button"
              disabled={reason.trim().length < 3 || review.isPending}
              onClick={() =>
                review.mutate(
                  { reportId: report.id, action, reason: reason.trim() },
                  { onSuccess: onClose },
                )
              }
              className="h-8 rounded-sm border border-primary/50 px-3 font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function ReviewMedia({ id, kind, role }: { id: string; kind: string; role: Role }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    void submissionService
      .mediaUrl(id, role)
      .then((nextUrl) => {
        objectUrl = nextUrl;
        if (active) setUrl(nextUrl);
        else URL.revokeObjectURL(nextUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, role]);

  if (failed) return <p className="text-muted-foreground">Media unavailable or access denied.</p>;
  if (!url) return <div className="h-24 animate-pulse bg-muted" />;
  return kind === "video" ? (
    <video controls preload="metadata" src={url} className="max-h-56 w-full bg-black" />
  ) : (
    <img src={url} alt="Citizen-submitted evidence" className="max-h-56 w-full object-contain" />
  );
}

export function EvidencePage() {
  const { data: reports } = useSuspenseQuery(reportsQuery);
  const [status, setStatus] = useState<VerificationStatus | "all">("all");
  const media = reports
    .filter((r) => r.hasMedia && (status === "all" || r.status === status))
    .slice(0, 24);
  return (
    <div className="space-y-3">
      <SectionHeader
        eyebrow="Verification"
        title="Evidence"
        description="Media and report evidence linked to events."
        actions={<DemoTag />}
      />
      <FilterBar>
        {(
          ["all", "verified", "corroborated", "needs_review", "low_confidence", "rejected"] as const
        ).map((s) => (
          <FilterChip key={s} active={status === s} onClick={() => setStatus(s)}>
            {s.replace("_", " ")}
          </FilterChip>
        ))}
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {media.length} items
        </span>
      </FilterBar>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
        {media.map((r) => {
          const card = (
            <div className="space-y-2 rounded-sm border border-border bg-panel p-3 hover:border-primary/50">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-primary">{r.id}</span>
                {r.status === "received" || r.status === "processing" ? (
                  <span className="text-[10px] uppercase">{r.status}</span>
                ) : (
                  <VerificationBadge status={r.status} />
                )}
              </div>
              <div className="text-[11px]">
                <ReportText report={r} />
              </div>
              <div className="flex flex-wrap justify-between gap-2 text-[10px] text-muted-foreground">
                <span>
                  {r.location} · {r.sourceName}
                </span>
                <span>{r.media.length} attachment(s); preview unavailable</span>
              </div>
            </div>
          );
          return r.eventId ? (
            <Link key={r.id} to="/events/$eventId" params={{ eventId: r.eventId }}>
              {card}
            </Link>
          ) : (
            <div key={r.id}>{card}</div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Media previews are unavailable from the current report API.
      </p>
    </div>
  );
}
