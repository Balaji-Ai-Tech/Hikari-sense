import type { ReactNode } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import {
  AlertOctagon,
  CloudOff,
  FileQuestion,
  Inbox,
  MapPinOff,
  SearchX,
  ShieldAlert,
  UploadCloud,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export type StateKind =
  | "notFound"
  | "restricted"
  | "mapUnavailable"
  | "dataUnavailable"
  | "network"
  | "sourceUnavailable"
  | "noResults"
  | "noEvents"
  | "noAlerts"
  | "noReports"
  | "uploadFailed"
  | "invalidReportId";

const ICON: Record<StateKind, typeof Inbox> = {
  notFound: FileQuestion,
  restricted: ShieldAlert,
  mapUnavailable: MapPinOff,
  dataUnavailable: CloudOff,
  network: WifiOff,
  sourceUnavailable: AlertOctagon,
  noResults: SearchX,
  noEvents: Inbox,
  noAlerts: Inbox,
  noReports: Inbox,
  uploadFailed: UploadCloud,
  invalidReportId: SearchX,
};
const TONE: Partial<Record<StateKind, string>> = {
  restricted: "text-sev-high",
  network: "text-sev-critical",
  uploadFailed: "text-sev-critical",
  sourceUnavailable: "text-sev-medium",
  dataUnavailable: "text-sev-medium",
  mapUnavailable: "text-sev-medium",
};

export interface StateAction {
  label: string;
  to?: string;
  onClick?: () => void;
  primary?: boolean;
}

/** One design-system screen for every error and empty state. Never renders stack traces. */
export function StateScreen({
  kind,
  title,
  description,
  actions = [],
  compact,
  className,
}: {
  kind: StateKind;
  title: string;
  description?: ReactNode;
  actions?: StateAction[];
  compact?: boolean;
  className?: string;
}) {
  const Icon = ICON[kind];
  return (
    <div
      role={kind === "restricted" || kind === "network" ? "alert" : "status"}
      className={cn(
        "mx-auto text-center",
        compact ? "py-8" : "mt-12 max-w-md rounded-md border border-border bg-panel p-6",
        className,
      )}
    >
      <Icon className={cn("mx-auto h-8 w-8", TONE[kind] ?? "text-muted-foreground")} />
      <h2 className="mt-3 font-display text-lg font-semibold tracking-wide">{title}</h2>
      {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
      {actions.length > 0 && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {actions.map((a) => {
            const cls = cn(
              "inline-flex h-8 items-center rounded-sm px-3 text-[12px] font-medium",
              a.primary
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "border border-border bg-panel-raised hover:bg-sidebar-accent",
            );
            return a.to ? (
              <Link key={a.label} to={a.to} className={cls}>
                {a.label}
              </Link>
            ) : (
              <button key={a.label} onClick={a.onClick} className={cls}>
                {a.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function useBack() {
  const r = useRouter();
  return () => r.history.back();
}

export function PanelSkeleton({ lines = 4, className }: { lines?: number; className?: string }) {
  return (
    <div
      className={cn("space-y-2 rounded-md border border-border bg-panel p-3", className)}
      aria-busy="true"
    >
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className="h-3" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-1.5 rounded-md border border-border bg-panel p-3" aria-busy="true">
      {Array.from({ length: rows }, (_, r) => (
        <div
          key={r}
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}
        >
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className="h-4" />
          ))}
        </div>
      ))}
    </div>
  );
}
export function MapSkeleton({ className }: { className?: string }) {
  return (
    <Skeleton
      className={cn("h-[420px] w-full rounded-md", className)}
      aria-busy="true"
      aria-label="Loading map"
    />
  );
}
export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-48 items-end gap-1.5 rounded-md border border-border bg-panel p-3",
        className,
      )}
      aria-busy="true"
    >
      {[40, 65, 50, 80, 55, 70, 35, 60].map((h, i) => (
        <Skeleton key={i} className="flex-1" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}
export function EventSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <Skeleton className="h-8 w-1/2" />
      <div className="grid gap-3 md:grid-cols-3">
        <PanelSkeleton />
        <PanelSkeleton />
        <PanelSkeleton />
      </div>
      <MapSkeleton className="h-64" />
    </div>
  );
}
/** Generic page-level loading layout built from the shared skeletons. */
export function PageSkeleton({ map, table }: { map?: boolean; table?: boolean }) {
  return (
    <div className="space-y-3" aria-busy="true">
      <Skeleton className="h-8 w-1/3" />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
      {map && <MapSkeleton />}
      {table ? (
        <TableSkeleton />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
      )}
    </div>
  );
}
