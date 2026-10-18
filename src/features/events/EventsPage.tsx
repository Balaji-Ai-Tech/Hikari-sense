import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowDownUp, ChevronLeft, ChevronRight } from "lucide-react";
import { Panel, SectionHeader, SeverityBadge, VerificationBadge } from "@/components/hs/primitives";
import { DataTable } from "@/components/hs/data";
import { EVENT_TYPE_LABEL } from "@/data/mockEvents";
import { minutesAgo, pct } from "@/utils/format";
import { cn } from "@/lib/utils";
import { EventFilterBar, KpiRow, OpsGrid, useCommandCenterData } from "./CommandCenter";
import { NoFilterResults } from "./EventFilterBar";
import { SORT_LABEL, eventPipeline, type EventSort } from "./filters";

const PAGE_SIZE = 10;

export function EventsPage() {
  const data = useCommandCenterData();
  const navigate = useNavigate();
  const [sort, setSort] = useState<EventSort>("latest");
  const [page, setPage] = useState(1);
  // Changing filters or sort resets to page 1.
  useEffect(() => {
    setPage(1);
  }, [data.filters, sort]);
  const view = useMemo(
    () => eventPipeline(data.stream.visible, data.filters, sort, page, PAGE_SIZE),
    [data.stream.visible, data.filters, sort, page],
  );

  return (
    <div className="space-y-3">
      <SectionHeader
        eyebrow="Command Center"
        title="Live Events"
        description="Database-backed weather events with location, verification state and source evidence."
        actions={<span className="font-mono text-[10px] font-semibold text-sev-low">LIVE API</span>}
      />
      <EventFilterBar
        count={data.filtered.length}
        total={data.stream.visible.length}
        events={data.events}
      />
      <KpiRow
        kpis={data.kpis}
        severity={data.filters.severity}
        onSeverity={(s) => data.setFilters({ severity: s })}
      />
      <OpsGrid data={data} mapHeight="h-[460px]" />
      <Panel
        title="Event Register"
        actions={
          <label className="flex items-center gap-1.5 text-[11px]">
            <ArrowDownUp className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as EventSort)}
              className="h-6 rounded-sm border border-border bg-panel-raised px-1 outline-hidden"
            >
              {(Object.keys(SORT_LABEL) as EventSort[]).map((k) => (
                <option key={k} value={k} className="bg-popover">
                  {SORT_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
        }
        bodyClassName="p-1"
      >
        {view.total === 0 && <NoFilterResults compact />}
        <DataTable
          rows={view.rows}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate({ to: "/events/$eventId", params: { eventId: r.id } })}
          columns={[
            {
              key: "id",
              header: "Event ID",
              render: (r) => <span className="font-mono text-[11px] text-primary">{r.id}</span>,
            },
            { key: "type", header: "Type", render: (r) => EVENT_TYPE_LABEL[r.type] },
            {
              key: "loc",
              header: "Location",
              render: (r) => (
                <span className="whitespace-nowrap">
                  {r.location}, {r.state}
                </span>
              ),
            },
            {
              key: "sev",
              header: "Severity",
              render: (r) => <SeverityBadge severity={r.severity} />,
            },
            {
              key: "ver",
              header: "Verification",
              render: (r) => <VerificationBadge status={r.verification} />,
            },
            {
              key: "conf",
              header: "Conf.",
              className: "text-right font-mono tabular",
              render: (r) => pct(r.confidence),
            },
            {
              key: "rep",
              header: "Reports",
              className: "text-right font-mono tabular",
              render: (r) => r.reports,
            },
            {
              key: "src",
              header: "Sources",
              className: "text-right font-mono tabular",
              render: (r) => r.sources,
            },
            {
              key: "area",
              header: "Area km²",
              className: "text-right font-mono tabular",
              render: (r) => r.affectedAreaKm2.toLocaleString("en-IN"),
            },
            {
              key: "t",
              header: "Time",
              className: "whitespace-nowrap text-right text-muted-foreground",
              render: (r) => minutesAgo(r.reportedAt),
            },
          ]}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-2 py-2 text-[11px]">
          <span className="text-muted-foreground">
            Showing {view.from}–{view.to} of {view.total} events
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={view.page <= 1}
              onClick={() => setPage(view.page - 1)}
              className="flex h-6 items-center gap-1 rounded-sm border border-border px-2 disabled:opacity-40 hover:bg-accent"
            >
              <ChevronLeft className="h-3 w-3" />
              Previous
            </button>
            {Array.from({ length: view.pages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => setPage(n)}
                className={cn(
                  "h-6 min-w-6 rounded-sm border px-1.5 font-mono",
                  n === view.page
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border hover:bg-accent",
                )}
              >
                {n}
              </button>
            ))}
            <button
              disabled={view.page >= view.pages}
              onClick={() => setPage(view.page + 1)}
              className="flex h-6 items-center gap-1 rounded-sm border border-border px-2 disabled:opacity-40 hover:bg-accent"
            >
              Next
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
