import {
  AlertTriangle,
  CloudLightning,
  CloudRain,
  Cloudy,
  Flame,
  Tornado,
  Waves,
  Wind,
  Wind as Dust,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DataSource, EventType, WeatherAlert, WeatherEvent } from "@/types";
import { minutesAgo, pct } from "@/utils/format";
import { SeverityBadge, StatusBadge, VerificationBadge } from "./primitives";

export const EVENT_ICON: Record<EventType, typeof CloudRain> = {
  heavy_rainfall: CloudRain,
  flood: Waves,
  thunderstorm: CloudLightning,
  heatwave: Flame,
  cyclone: Tornado,
  strong_wind: Wind,
  fog: Cloudy,
  dust_storm: Dust,
};

const sevBorder = {
  critical: "border-l-sev-critical",
  high: "border-l-sev-high",
  medium: "border-l-sev-medium",
  low: "border-l-sev-low",
};
const sevText = {
  critical: "text-sev-critical",
  high: "text-sev-high",
  medium: "text-sev-medium",
  low: "text-sev-low",
};

export function EventCard({ event, onClick }: { event: WeatherEvent; onClick?: () => void }) {
  const Icon = EVENT_ICON[event.type];
  return (
    <button
      onClick={onClick}
      className={cn(
        "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 border-l-2 bg-panel-raised/60 px-2.5 py-2 text-left transition-colors hover:bg-accent",
        sevBorder[event.severity],
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", sevText[event.severity])} />
      <div className="min-w-0">
        <div className="truncate text-[12px] font-medium">
          {event.title} — {event.location}
        </div>
        <div className="truncate text-[10px] text-muted-foreground">
          {event.state} · {minutesAgo(event.reportedAt)} · {event.reports} reports
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <SeverityBadge severity={event.severity} />
        <span className="font-mono text-[9px] text-muted-foreground">
          {pct(event.confidence)} conf
        </span>
      </div>
    </button>
  );
}

export function AlertCard({ alert }: { alert: WeatherAlert }) {
  return (
    <div
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2.5 border-l-2 bg-panel-raised/60 px-2.5 py-2",
        sevBorder[alert.severity],
      )}
    >
      <AlertTriangle className={cn("mt-0.5 h-4 w-4", sevText[alert.severity])} />
      <div className="min-w-0">
        <div className={cn("truncate text-[12px] font-semibold", sevText[alert.severity])}>
          {alert.title}
        </div>
        <div className="truncate text-[11px]">{alert.region}</div>
        <div className="truncate text-[10px] text-muted-foreground">{alert.detail}</div>
      </div>
      <SeverityBadge severity={alert.severity} />
    </div>
  );
}

export function SourceCard({ source }: { source: DataSource }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-sm border border-border bg-panel-raised/50 px-2.5 py-2">
      <div className="min-w-0">
        <div className="truncate text-[12px] font-medium">{source.name}</div>
        <div className="text-[10px] text-muted-foreground">
          {source.kind} · sync {source.lastSync} · {source.throughput}
        </div>
      </div>
      <StatusBadge status={source.status} />
      <div className="col-span-2 flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-sev-low" style={{ width: pct(source.reliability) }} />
        </div>
        <span className="font-mono text-[10px] tabular">{source.reliability.toFixed(2)}</span>
      </div>
    </div>
  );
}

export { VerificationBadge };
