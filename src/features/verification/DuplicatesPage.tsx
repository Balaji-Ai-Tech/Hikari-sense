import { ReportText } from "@/components/hs/ReportText";
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { reportsQuery, useResolveDuplicate } from "@/hooks/useWeather";
import {
  DemoTag,
  EmptyState,
  FilterBar,
  FilterChip,
  MetricCard,
  Panel,
  SectionHeader,
} from "@/components/hs/primitives";
import { DataTable, Modal } from "@/components/hs/data";
import { pct } from "@/utils/format";
import type { DuplicateStatus, Report } from "@/types";

export interface DuplicatePair {
  report: Report;
  original: Report;
}

export function buildPairs(reports: Report[]): DuplicatePair[] {
  const byId = new Map(reports.map((r) => [r.id, r]));
  return reports
    .filter((r) => r.duplicateOf && byId.has(r.duplicateOf))
    .map((r) => ({ report: r, original: byId.get(r.duplicateOf!)! }));
}

const statusCls: Record<DuplicateStatus, string> = {
  suspected: "text-sev-medium",
  merged: "text-primary",
  ignored: "text-muted-foreground",
  unique: "",
};

export function DuplicateTable({
  pairs,
  showEvent = true,
}: {
  pairs: DuplicatePair[];
  showEvent?: boolean;
}) {
  const resolve = useResolveDuplicate();
  const [compare, setCompare] = useState<DuplicatePair | null>(null);
  if (!pairs.length)
    return (
      <div className="p-3">
        <EmptyState
          title="No duplicate reports"
          description="No near-duplicate pairs match this view."
        />
      </div>
    );
  return (
    <>
      <DataTable
        rows={pairs}
        rowKey={(p) => p.report.id}
        columns={[
          ...(showEvent
            ? [
                {
                  key: "ev",
                  header: "Event",
                  render: (p: DuplicatePair) =>
                    p.report.eventId ? (
                      <Link
                        to="/events/$eventId"
                        params={{ eventId: p.report.eventId }}
                        className="font-mono text-[10px] text-primary hover:underline"
                      >
                        {p.report.eventId}
                      </Link>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">Not linked</span>
                    ),
                },
              ]
            : []),
          {
            key: "a",
            header: "Report",
            render: (p) => <span className="font-mono text-[11px]">{p.report.id}</span>,
          },
          {
            key: "b",
            header: "Similar to",
            render: (p) => <span className="font-mono text-[11px]">{p.original.id}</span>,
          },
          {
            key: "t",
            header: "Text",
            render: (p) => <span className="line-clamp-1">{p.report.text}</span>,
          },
          {
            key: "s",
            header: "Similarity",
            className: "font-mono",
            render: (p) => (p.report.similarity ?? 0).toFixed(2),
          },
          {
            key: "st",
            header: "Status",
            render: (p) => (
              <span
                className={`text-[11px] font-semibold uppercase ${statusCls[p.report.duplicateStatus]}`}
              >
                {p.report.duplicateStatus}
              </span>
            ),
          },
          {
            key: "x",
            header: "Actions",
            render: (p) => (
              <div className="flex gap-1 text-[11px]">
                <button
                  onClick={() => setCompare(p)}
                  className="rounded-sm border border-border px-2 py-0.5 hover:bg-accent"
                >
                  Compare
                </button>
                {p.report.duplicateStatus === "suspected" && (
                  <>
                    <button
                      onClick={() => resolve.mutate({ id: p.report.id, resolution: "merged" })}
                      className="rounded-sm border border-primary/40 px-2 py-0.5 text-primary hover:bg-primary/10"
                    >
                      Merge
                    </button>
                    <button
                      onClick={() => resolve.mutate({ id: p.report.id, resolution: "ignored" })}
                      className="rounded-sm border border-border px-2 py-0.5 text-muted-foreground hover:bg-accent"
                    >
                      Ignore
                    </button>
                  </>
                )}
              </div>
            ),
          },
        ]}
      />
      <Modal open={!!compare} onOpenChange={(o) => !o && setCompare(null)} title="Compare reports">
        {compare && (
          <div className="space-y-2 text-[12px]">
            <div className="grid grid-cols-2 gap-2">
              {[compare.original, compare.report].map((r, i) => (
                <div key={r.id} className="rounded-sm border border-border bg-panel-raised/50 p-2">
                  <div className="mb-1 flex justify-between font-mono text-[10px]">
                    <span className="text-primary">{r.id}</span>
                    <span className="text-muted-foreground">
                      {i === 0 ? "original" : "candidate"}
                    </span>
                  </div>
                  <ReportText report={r} clamp={false} />
                  <dl className="mt-2 grid grid-cols-[70px_1fr] gap-y-0.5 text-[10px] text-muted-foreground">
                    <dt>Source</dt>
                    <dd>
                      {r.sourceName} · {r.sourceAccount}
                    </dd>
                    <dt>Language</dt>
                    <dd>{r.language}</dd>
                    <dt>Posted</dt>
                    <dd className="font-mono">
                      {new Date(r.reportedAt).toLocaleTimeString("en-IN", {
                        timeZone: "Asia/Kolkata",
                        hour12: false,
                      })}
                    </dd>
                    <dt>Media</dt>
                    <dd>{r.media.length}</dd>
                  </dl>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Text similarity {(compare.report.similarity ?? 0).toFixed(2)} · same event{" "}
              {compare.report.eventId}. Merging removes the candidate from the event’s independent
              report count.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}

export function DuplicatesPage() {
  const { data: reports } = useSuspenseQuery(reportsQuery);
  const pairs = useMemo(() => buildPairs(reports), [reports]);
  const [status, setStatus] = useState<DuplicateStatus | "all">("suspected");
  const rows = pairs.filter((p) => status === "all" || p.report.duplicateStatus === status);
  const n = (s: DuplicateStatus) => pairs.filter((p) => p.report.duplicateStatus === s).length;
  return (
    <div className="space-y-3">
      <SectionHeader
        eyebrow="Verification"
        title="Duplicate / Similar Reports"
        description="Near-duplicate report pairs detected within the same event."
        actions={<DemoTag />}
      />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <MetricCard label="Pairs detected" value={String(pairs.length)} />
        <MetricCard label="Pending" value={String(n("suspected"))} tone="medium" />
        <MetricCard label="Merged" value={String(n("merged"))} tone="low" />
        <MetricCard
          label="Mean similarity"
          value={pct(
            pairs.reduce((s, p) => s + (p.report.similarity ?? 0), 0) / Math.max(1, pairs.length),
          )}
        />
      </div>
      <FilterBar>
        {(["suspected", "merged", "ignored", "all"] as const).map((s) => (
          <FilterChip key={s} active={status === s} onClick={() => setStatus(s)}>
            {s === "suspected" ? "Pending" : s}
          </FilterChip>
        ))}
      </FilterBar>
      <Panel title="Pairs" bodyClassName="p-1">
        <DuplicateTable pairs={rows} />
      </Panel>
    </div>
  );
}
