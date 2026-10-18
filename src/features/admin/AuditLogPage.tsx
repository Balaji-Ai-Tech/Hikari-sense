import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Panel, SectionHeader } from "@/components/hs/primitives";
import { DataTable } from "@/components/hs/data";
import { StateScreen, TableSkeleton } from "@/components/hs/states";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { auditQuery } from "@/hooks/useWeather";
import type { AuditEntry } from "@/types";

const sel = "h-8 rounded-sm border border-border bg-panel-raised px-2 text-[12px]";
const time = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    hour12: false,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

function EntityLink({ id }: { id: string }) {
  if (id.startsWith("EV-"))
    return (
      <Link to="/events/$eventId" params={{ eventId: id }} className="text-primary hover:underline">
        {id}
      </Link>
    );
  if (id.startsWith("ALT-"))
    return (
      <Link to="/alerts/$alertId" params={{ alertId: id }} className="text-primary hover:underline">
        {id}
      </Link>
    );
  return <span>{id}</span>;
}

export function AuditLogPage() {
  const { data, isPending } = useQuery(auditQuery);
  const rows = data ?? [];
  const [f, setF] = useState({
    q: "",
    actor: "all",
    role: "all",
    action: "all",
    entity: "all",
    result: "all",
    from: "",
    to: "",
  });
  const [open, setOpen] = useState<AuditEntry | null>(null);
  const uniq = (k: keyof AuditEntry) => [...new Set(rows.map((r) => String(r[k])))].sort();
  const shown = useMemo(
    () =>
      rows.filter((r) => {
        const q = f.q.trim().toLowerCase();
        if (
          q &&
          ![r.entityId, r.related ?? "", r.actor, r.id].some((v) => v.toLowerCase().includes(q))
        )
          return false;
        if (f.actor !== "all" && r.actor !== f.actor) return false;
        if (f.role !== "all" && r.role !== f.role) return false;
        if (f.action !== "all" && r.action !== f.action) return false;
        if (f.entity !== "all" && r.entity !== f.entity) return false;
        if (f.result !== "all" && r.result !== f.result) return false;
        if (f.from && r.at < new Date(f.from).toISOString()) return false;
        if (f.to && r.at > new Date(f.to + "T23:59:59").toISOString()) return false;
        return true;
      }),
    [rows, f],
  );
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div className="space-y-3">
      <SectionHeader
        eyebrow="Admin"
        title="Audit Log"
        description="Every action taken in this demo session, recorded as it happens."
        actions={
          <span className="rounded-sm border border-sev-medium/40 bg-sev-medium/10 px-2 py-1 font-mono text-[10px] font-semibold text-sev-medium">
            DEMO AUDIT DATA
          </span>
        }
      />
      <Panel title="Filters">
        <div className="flex flex-wrap gap-2">
          <input
            value={f.q}
            onChange={set("q")}
            placeholder="Search event, report, alert ID or user"
            aria-label="Search audit log"
            className={`${sel} w-64`}
          />
          {(
            [
              ["actor", "User"],
              ["role", "Role"],
              ["action", "Action"],
              ["entity", "Entity"],
              ["result", "Result"],
            ] as const
          ).map(([k, l]) => (
            <select key={k} aria-label={l} value={f[k]} onChange={set(k)} className={sel}>
              <option value="all">All {l.toLowerCase()}s</option>
              {uniq(k).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          ))}
          <input
            type="date"
            aria-label="From date"
            value={f.from}
            onChange={set("from")}
            className={sel}
          />
          <input
            type="date"
            aria-label="To date"
            value={f.to}
            onChange={set("to")}
            className={sel}
          />
        </div>
      </Panel>
      <Panel title={`${shown.length} of ${rows.length} records`}>
        {isPending ? (
          <TableSkeleton cols={7} />
        ) : shown.length === 0 ? (
          <StateScreen
            compact
            kind="noResults"
            title="No audit records match"
            description="Change the filters, or perform an action (approve an event, edit an alert) to create one."
            actions={[
              {
                label: "Clear filters",
                onClick: () =>
                  setF({
                    q: "",
                    actor: "all",
                    role: "all",
                    action: "all",
                    entity: "all",
                    result: "all",
                    from: "",
                    to: "",
                  }),
              },
            ]}
          />
        ) : (
          <DataTable
            rows={shown}
            rowKey={(r) => r.id}
            onRowClick={setOpen}
            columns={[
              {
                key: "at",
                header: "Timestamp",
                render: (r) => <span className="font-mono text-[11px]">{time(r.at)}</span>,
              },
              { key: "u", header: "User", render: (r) => r.actor },
              { key: "r", header: "Role", render: (r) => r.role },
              {
                key: "a",
                header: "Action",
                render: (r) => (
                  <span className="font-mono text-[11px] font-semibold">{r.action}</span>
                ),
              },
              { key: "e", header: "Entity", render: (r) => r.entity },
              {
                key: "id",
                header: "Entity ID",
                render: (r) => <span className="font-mono text-[11px]">{r.entityId}</span>,
              },
              {
                key: "res",
                header: "Result",
                render: (r) => (
                  <span className={r.result === "Success" ? "text-sev-low" : "text-sev-critical"}>
                    {r.result}
                  </span>
                ),
              },
              {
                key: "why",
                header: "Reason",
                render: (r) => (
                  <span className="line-clamp-1 text-muted-foreground">{r.reason ?? "—"}</span>
                ),
              },
              {
                key: "s",
                header: "Session",
                render: (r) => (
                  <span className="font-mono text-[10px] text-muted-foreground">{r.session}</span>
                ),
              },
              {
                key: "d",
                header: "",
                render: (r) => (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen(r);
                    }}
                    className="text-[11px] text-primary hover:underline"
                  >
                    View details
                  </button>
                ),
              },
            ]}
          />
        )}
      </Panel>
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono">{open.action}</SheetTitle>
              </SheetHeader>
              <dl className="mt-4 grid grid-cols-[120px_1fr] gap-y-2 text-[12px]">
                {(
                  [
                    ["Audit ID", open.id],
                    ["Actor", open.actor],
                    ["Role", open.role],
                    ["Timestamp", time(open.at)],
                    ["Entity", `${open.entity}`],
                  ] as const
                ).map(([k, v]) => (
                  <>
                    <dt key={k} className="text-muted-foreground">
                      {k}
                    </dt>
                    <dd>{v}</dd>
                  </>
                ))}
                <dt className="text-muted-foreground">Entity ID</dt>
                <dd className="font-mono">
                  <EntityLink id={open.entityId} />
                </dd>
                <dt className="text-muted-foreground">Previous state</dt>
                <dd className="font-mono">{open.from ?? "—"}</dd>
                <dt className="text-muted-foreground">New state</dt>
                <dd className="font-mono text-primary">{open.to ?? "—"}</dd>
                <dt className="text-muted-foreground">Reason</dt>
                <dd>{open.reason ?? "—"}</dd>
                <dt className="text-muted-foreground">Related</dt>
                <dd className="font-mono">
                  {open.related ? <EntityLink id={open.related} /> : "—"}
                </dd>
                <dt className="text-muted-foreground">Result</dt>
                <dd>{open.result}</dd>
                <dt className="text-muted-foreground">Session</dt>
                <dd className="font-mono text-[11px]">{open.session}</dd>
              </dl>
              <p className="mt-4 text-[10px] text-muted-foreground">
                DEMO AUDIT DATA — kept in this browser session only; not an immutable server log.
              </p>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
