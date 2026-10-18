import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  CircleDot,
  ExternalLink,
  MapPin,
  RotateCcw,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  EventType,
  Severity,
  SourceKind,
  VerificationStatus,
  WeatherAlert,
  WeatherEvent,
} from "@/types";
import { EVENT_TYPE_LABEL, INDIAN_STATES } from "@/data/mockEvents";
import { minutesAgo, pct } from "@/utils/format";
import {
  DemoTag,
  EmptyState,
  SeverityBadge,
  VERIFICATION_LABEL,
  VerificationBadge,
} from "@/components/hs/primitives";
import { EVENT_ICON } from "@/components/hs/cards";
import { Drawer, Modal } from "@/components/hs/data";
import { activeFilterCount, useEventFilters } from "./filters";

const sevText: Record<Severity, string> = {
  critical: "text-sev-critical",
  high: "text-sev-high",
  medium: "text-sev-medium",
  low: "text-sev-low",
};
const sevBorder: Record<Severity, string> = {
  critical: "border-l-sev-critical",
  high: "border-l-sev-high",
  medium: "border-l-sev-medium",
  low: "border-l-sev-low",
};
const sevDot: Record<Severity, string> = {
  critical: "bg-sev-critical",
  high: "bg-sev-high",
  medium: "bg-sev-medium",
  low: "bg-sev-low",
};

function Select<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <label className="flex h-7 items-center gap-1.5 rounded-sm border border-border bg-panel-raised/60 pl-2 text-[11px]">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={cn(
          "h-full max-w-[140px] cursor-pointer bg-transparent pr-1 outline-hidden",
          value !== "all" && value !== "0" ? "text-primary" : "text-foreground",
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-popover">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export { EventFilterBar } from "./EventFilterBar";

export function EventStreamRow({
  event,
  selected,
  fresh,
  onClick,
}: {
  event: WeatherEvent;
  selected?: boolean;
  fresh?: boolean;
  onClick?: () => void;
}) {
  const Icon = EVENT_ICON[event.type];
  return (
    <button
      onClick={onClick}
      className={cn(
        "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 border-l-2 px-2.5 py-2 text-left transition-colors",
        sevBorder[event.severity],
        selected ? "bg-accent" : "bg-panel-raised/50 hover:bg-accent/70",
        fresh && "animate-arrive",
      )}
    >
      <div className="relative">
        <Icon className={cn("h-4 w-4", sevText[event.severity])} />
        <span
          className={cn(
            "absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full",
            sevDot[event.severity],
          )}
        />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[12px] font-semibold">{EVENT_TYPE_LABEL[event.type]}</span>
          {fresh && (
            <span className="rounded-sm bg-primary/20 px-1 font-mono text-[8px] font-bold text-primary">
              NEW
            </span>
          )}
        </div>
        <div className="truncate text-[11px] text-muted-foreground">
          {event.location}, {event.state}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
          <VerificationBadge status={event.verification} />
          <span className="whitespace-nowrap">
            {event.sources} src · {minutesAgo(event.reportedAt)}
          </span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="font-mono text-[13px] font-semibold tabular">{pct(event.confidence)}</span>
        <SeverityBadge severity={event.severity} />
      </div>
    </button>
  );
}

export function AlertRow({ alert, onClick }: { alert: WeatherAlert; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2.5 border-l-2 bg-panel-raised/50 px-2.5 py-2 text-left transition-colors hover:bg-accent/70",
        sevBorder[alert.severity],
      )}
    >
      <AlertTriangle className={cn("mt-0.5 h-4 w-4", sevText[alert.severity])} />
      <div className="min-w-0">
        <div className={cn("truncate text-[12px] font-semibold", sevText[alert.severity])}>
          {alert.title}
        </div>
        <div className="truncate text-[11px]">{alert.region}</div>
        <div className="font-mono text-[10px] text-muted-foreground">
          Issued {alert.issuedAt} IST · Expires {alert.expiresAt}
          {alert.expiresAt.length <= 5 ? " IST" : ""}
        </div>
      </div>
      <SeverityBadge severity={alert.severity} />
    </button>
  );
}

export function AlertModal({
  alert,
  onClose,
}: {
  alert: WeatherAlert | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  return (
    <Modal open={!!alert} onOpenChange={(o) => !o && onClose()} title={alert?.title ?? ""}>
      {alert && (
        <div className="space-y-3 text-[12px]">
          <div className="flex items-center gap-2">
            <SeverityBadge severity={alert.severity} />
            <span className="font-mono text-[11px] text-primary">{alert.id}</span>
            <DemoTag className="ml-auto" />
          </div>
          <dl className="grid grid-cols-[100px_1fr] gap-y-1.5">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="font-semibold uppercase">{alert.status}</dd>
            <dt className="text-muted-foreground">Area</dt>
            <dd>{alert.affectedArea}</dd>
            <dt className="text-muted-foreground">Event</dt>
            <dd className="font-mono text-primary">{alert.eventId}</dd>
            <dt className="text-muted-foreground">Detail</dt>
            <dd>{alert.detail}</dd>
            <dt className="text-muted-foreground">Issued</dt>
            <dd className="font-mono">{alert.issuedAt} IST</dd>
            <dt className="text-muted-foreground">Expires</dt>
            <dd className="font-mono">{alert.expiresAt}</dd>
            <dt className="text-muted-foreground">Issuer</dt>
            <dd>{alert.issuer} (simulated)</dd>
          </dl>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              Advisory
            </div>
            <ul className="list-inside list-disc space-y-0.5">
              {alert.instructions.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                onClose();
                navigate({ to: "/alerts/$alertId", params: { alertId: alert.id } });
              }}
              className="rounded-sm border border-border py-1.5 text-[12px] font-semibold hover:bg-accent"
            >
              Alert details
            </button>
            <button
              onClick={() => {
                onClose();
                navigate({ to: "/events/$eventId", params: { eventId: alert.eventId } });
              }}
              className="flex items-center justify-center gap-1.5 rounded-sm bg-primary py-1.5 text-[12px] font-semibold text-primary-foreground hover:opacity-90"
            >
              View Event <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

const istTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });

/** Reusable 12-stage lifecycle, computed by the repository from linked reports, alerts and decisions. */
export function EventLifecycle({ event, compact }: { event: WeatherEvent; compact?: boolean }) {
  const lifecycle = event.lifecycle ?? [
    {
      key: "backend-state",
      label: event.lifecycleState,
      status: "current" as const,
      at: event.lastUpdated,
      description: event.summary,
      system: "Event API",
    },
  ];
  const stages = compact
    ? lifecycle.filter((s) => s.status !== "pending" || s.key === "human")
    : lifecycle;
  return (
    <ol className="relative space-y-2.5 border-l border-border pl-4">
      {stages.map((s) => (
        <li key={s.key} className="relative">
          <span className="absolute -left-[21px] top-0.5 bg-panel">
            {s.status === "done" ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-sev-low" />
            ) : s.status === "current" ? (
              <CircleDot className="h-3.5 w-3.5 text-sev-medium" />
            ) : (
              <Circle
                className={cn(
                  "h-3.5 w-3.5",
                  s.status === "skipped" ? "text-border" : "text-muted-foreground",
                )}
              />
            )}
          </span>
          <div className="flex items-baseline justify-between gap-2">
            <span
              className={cn(
                "text-[12px] font-medium",
                s.status === "pending" && "text-muted-foreground",
                s.status === "current" && "text-sev-medium",
              )}
            >
              {s.label}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {s.at
                ? `${istTime(s.at)} IST`
                : s.status === "current"
                  ? "Pending"
                  : s.status === "skipped"
                    ? "n/a"
                    : "—"}
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            {s.description}
            {!compact && <span className="ml-1 text-[10px] opacity-70">· {s.system}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Timeline({ event }: { event: WeatherEvent }) {
  return <EventLifecycle event={event} compact />;
}

export function isDemoEvent(event: Pick<WeatherEvent, "origin">) {
  return event.origin === "demo";
}

export function EventDrawer({
  event,
  onClose,
  onViewOnMap,
  showFullEventLink = true,
}: {
  event: WeatherEvent | null;
  onClose: () => void;
  onViewOnMap?: (e: WeatherEvent) => void;
  showFullEventLink?: boolean;
}) {
  return (
    <Drawer
      open={!!event}
      onOpenChange={(o) => !o && onClose()}
      title={event ? EVENT_TYPE_LABEL[event.type] : ""}
    >
      {event && (
        <div
          className="space-y-4 overflow-y-auto pb-6 text-[12px]"
          style={{ maxHeight: "calc(100vh - 90px)" }}
        >
          <div>
            <div className="font-mono text-[11px] text-primary">{event.id}</div>
            <div className="mt-0.5 flex items-center gap-1 text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {event.location}, {event.district}, {event.state}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <SeverityBadge severity={event.severity} />
              <VerificationBadge status={event.verification} />
              <span className="font-mono text-[11px]">{pct(event.confidence)} confidence</span>
              {isDemoEvent(event) && <DemoTag />}
            </div>
          </div>
          {(event.alertIds?.length ?? 0) > 0 && (
            <Link
              to="/alerts/$alertId"
              params={{ alertId: event.alertIds![0]! }}
              onClick={onClose}
              className="flex items-center gap-2 rounded-sm border border-sev-high/40 bg-sev-high/10 px-2 py-1.5 text-[11px] text-sev-high hover:bg-sev-high/20"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="font-semibold">ACTIVE ALERT</span>
              <span className="font-mono">{event.alertIds![0]}</span>
              <span className="ml-auto">View Alert →</span>
            </Link>
          )}
          <section>
            <h3 className="mb-2 font-display text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
              Lifecycle
            </h3>
            <Timeline event={event} />
          </section>
          <section>
            <h3 className="mb-2 font-display text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
              Evidence
            </h3>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                ["Reports", event.reports],
                ["Sources", event.sources],
                ["Media", `${event.images} img · ${event.videos} vid`],
                ["Official obs.", event.sourceKinds.includes("IMD") ? "Yes" : "None"],
              ].map(([k, v]) => (
                <div
                  key={k as string}
                  className="rounded-sm border border-border bg-panel-raised/50 px-2 py-1.5"
                >
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {k}
                  </div>
                  <div className="font-mono text-[13px] font-semibold">{v}</div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {event.sourceKinds.map((s) => (
                <span key={s} className="rounded-sm border border-border px-1.5 py-0.5 text-[10px]">
                  {s}
                </span>
              ))}
            </div>
          </section>
          <div className={`grid ${showFullEventLink ? "grid-cols-2" : "grid-cols-1"} gap-2`}>
            {showFullEventLink && (
              <Link
                to="/events/$eventId"
                params={{ eventId: event.id }}
                onClick={onClose}
                className="flex items-center justify-center gap-1.5 rounded-sm bg-primary py-2 text-[12px] font-semibold text-primary-foreground hover:opacity-90"
              >
                View Full Event
              </Link>
            )}
            <button
              onClick={() => {
                onViewOnMap?.(event);
                onClose();
              }}
              className="flex items-center justify-center gap-1.5 rounded-sm border border-border py-2 text-[12px] font-semibold hover:bg-accent"
            >
              <MapPin className="h-3.5 w-3.5" />
              View on Map
            </button>
          </div>
        </div>
      )}
    </Drawer>
  );
}

export function StreamList({
  events,
  latestId,
  selectedId,
  onSelect,
}: {
  events: WeatherEvent[];
  latestId?: string | undefined;
  selectedId?: string | undefined;
  onSelect: (e: WeatherEvent) => void;
}) {
  if (!events.length)
    return (
      <div className="p-3">
        <EmptyState
          title="No events match the filters"
          description="Adjust or clear filters to see events."
        />
      </div>
    );
  return (
    <div className="space-y-px">
      {events.map((e) => (
        <EventStreamRow
          key={e.id}
          event={e}
          fresh={e.id === latestId}
          selected={e.id === selectedId}
          onClick={() => onSelect(e)}
        />
      ))}
    </div>
  );
}

export function useSelection() {
  const [drawer, setDrawer] = useState<WeatherEvent | null>(null);
  const [focusId, setFocusId] = useState<string | undefined>();
  return { drawer, setDrawer, focusId, setFocusId };
}
