import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Panel, SectionHeader, SeverityBadge } from "@/components/hs/primitives";
import { DataTable } from "@/components/hs/data";
import { StateScreen, TableSkeleton } from "@/components/hs/states";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { alertsQuery, eventsQuery, useAlertStatus, useSaveAlert } from "@/hooks/useWeather";
import type { AlertInput, Severity, WeatherAlert } from "@/types";

const CHANNELS = ["Dashboard", "Email", "SMS", "Public Web"];
const RECIPIENTS = ["Public", "District Collector", "SDMA", "NDRF", "Municipal Corporation"];
const field = "h-8 w-full rounded-sm border border-border bg-panel-raised px-2 text-[12px]";

type Draft = AlertInput & { id?: string; scheduled: boolean };
const blank = (eventId: string): Draft => ({
  eventId,
  title: "",
  region: "",
  message: "",
  severity: "high",
  issuedAt: "",
  expiresAt: "",
  instructions: [],
  alertType: "Warning",
  affectedArea: "",
  status: "active",
  recipients: ["Public"],
  channels: ["Dashboard", "Public Web"],
  scheduled: false,
});

export function AlertManagementPage() {
  const { data: alerts, isPending } = useQuery(alertsQuery);
  const { data: events = [] } = useQuery(eventsQuery);
  const save = useSaveAlert();
  const status = useAlertStatus();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const edit = (a: WeatherAlert) => {
    setDraft({ ...a, scheduled: false });
    setStart("");
    setEnd("");
  };
  const toggle = <K extends "channels" | "recipients">(k: K, v: string) =>
    setDraft(
      (d) => d && { ...d, [k]: d[k].includes(v) ? d[k].filter((x) => x !== v) : [...d[k], v] },
    );
  const submit = async () => {
    if (!draft) return;
    const fmt = (s: string) =>
      s
        ? new Date(s).toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
        : "";
    const scheduled = !!start && new Date(start) > new Date();
    const { scheduled: _s, ...rest } = draft;
    await save
      .mutateAsync({
        ...rest,
        issuedAt: fmt(start) || draft.issuedAt || fmt(new Date().toISOString()),
        expiresAt: fmt(end) || draft.expiresAt || "—",
        status: scheduled ? "cancelled" : draft.status,
        ...(scheduled
          ? { message: `[SCHEDULED ${start.replace("T", " ")}] ${draft.message}` }
          : {}),
      })
      .then(() => setDraft(null))
      .catch(() => {});
  };

  return (
    <div className="space-y-3">
      <SectionHeader
        eyebrow="Admin"
        title="Alert Management"
        description="Create, edit, schedule and activate alerts. Dissemination is simulated."
        actions={
          <button
            onClick={() => {
              setDraft(blank(events[0]?.id ?? ""));
              setStart("");
              setEnd("");
            }}
            className="h-8 rounded-sm bg-primary px-3 text-[12px] text-primary-foreground"
          >
            Create alert
          </button>
        }
      />
      <div className="rounded-sm border border-sev-medium/40 bg-sev-medium/10 px-3 py-2 text-[11px] text-sev-medium">
        SIMULATED CONNECTOR — no SMS or email provider is connected. Nothing is delivered outside
        this app.
      </div>
      <Panel title={`${alerts?.length ?? 0} alerts`}>
        {isPending ? (
          <TableSkeleton />
        ) : !alerts?.length ? (
          <StateScreen
            compact
            kind="noAlerts"
            title="No alerts yet"
            actions={[
              {
                label: "Create alert",
                onClick: () => setDraft(blank(events[0]?.id ?? "")),
                primary: true,
              },
            ]}
          />
        ) : (
          <DataTable
            rows={alerts}
            rowKey={(a) => a.id}
            columns={[
              {
                key: "id",
                header: "Alert",
                render: (a) => (
                  <Link
                    to="/alerts/$alertId"
                    params={{ alertId: a.id }}
                    className="font-mono text-primary hover:underline"
                  >
                    {a.id}
                  </Link>
                ),
              },
              {
                key: "t",
                header: "Title",
                render: (a) => <span className="line-clamp-1">{a.title}</span>,
              },
              { key: "r", header: "Region", render: (a) => a.region },
              {
                key: "s",
                header: "Severity",
                render: (a) => <SeverityBadge severity={a.severity} />,
              },
              {
                key: "st",
                header: "Status",
                render: (a) => (
                  <span
                    className={a.status === "active" ? "text-sev-low" : "text-muted-foreground"}
                  >
                    {a.status}
                  </span>
                ),
              },
              {
                key: "c",
                header: "Channels",
                render: (a) => (
                  <span className="text-[11px] text-muted-foreground">{a.channels.join(", ")}</span>
                ),
              },
              {
                key: "x",
                header: "",
                render: (a) => (
                  <div className="flex gap-2 text-[11px]">
                    <button onClick={() => edit(a)} className="text-primary hover:underline">
                      Edit
                    </button>
                    <button
                      onClick={() =>
                        status.mutate({
                          id: a.id,
                          status: a.status === "active" ? "cancelled" : "active",
                        })
                      }
                      className="hover:underline"
                    >
                      {a.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Panel>
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? `Edit ${draft.id}` : "Create alert"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-2.5 text-[12px]">
              <label className="block">
                Title
                <input
                  className={field}
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  maxLength={120}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  Affected region
                  <input
                    className={field}
                    value={draft.region}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        region: e.target.value,
                        affectedArea: draft.affectedArea || e.target.value,
                      })
                    }
                    maxLength={80}
                  />
                </label>
                <label className="block">
                  Severity
                  <select
                    className={field}
                    value={draft.severity}
                    onChange={(e) => setDraft({ ...draft, severity: e.target.value as Severity })}
                  >
                    {["critical", "high", "medium", "low"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block">
                Linked event
                <select
                  className={field}
                  value={draft.eventId}
                  onChange={(e) => setDraft({ ...draft, eventId: e.target.value })}
                >
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.id} — {e.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                Message
                <textarea
                  className={`${field} h-20 py-1.5`}
                  value={draft.message}
                  onChange={(e) => setDraft({ ...draft, message: e.target.value })}
                  maxLength={500}
                />
              </label>
              <label className="block">
                Public guidance (one per line)
                <textarea
                  className={`${field} h-16 py-1.5`}
                  value={draft.instructions.join("\n")}
                  onChange={(e) =>
                    setDraft({ ...draft, instructions: e.target.value.split("\n").filter(Boolean) })
                  }
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  Start (future = schedule)
                  <input
                    type="datetime-local"
                    className={field}
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </label>
                <label className="block">
                  End
                  <input
                    type="datetime-local"
                    className={field}
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </label>
              </div>
              <fieldset>
                <legend className="mb-1">Recipients</legend>
                <div className="flex flex-wrap gap-1.5">
                  {RECIPIENTS.map((r) => (
                    <label key={r} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={draft.recipients.includes(r)}
                        onChange={() => toggle("recipients", r)}
                      />
                      {r}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-1">Channels (simulated)</legend>
                <div className="flex flex-wrap gap-2">
                  {CHANNELS.map((c) => (
                    <label key={c} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={draft.channels.includes(c)}
                        onChange={() => toggle("channels", c)}
                      />
                      {c}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={draft.status === "active"}
                  onChange={(e) =>
                    setDraft({ ...draft, status: e.target.checked ? "active" : "cancelled" })
                  }
                />
                Active
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setDraft(null)}
                  className="h-8 rounded-sm border border-border px-3"
                >
                  Cancel
                </button>
                <button
                  onClick={submit}
                  disabled={save.isPending}
                  className="h-8 rounded-sm bg-primary px-3 text-primary-foreground disabled:opacity-50"
                >
                  Save alert
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
