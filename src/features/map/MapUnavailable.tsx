import { MapPinOff, RotateCw } from "lucide-react";

const GUIDANCE =
  "Check your connection or whether a content blocker is preventing the map tile server from loading, then retry.";

export function MapUnavailable({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-panel p-4">
      <div className="max-w-md rounded-md border border-sev-critical/40 bg-background/90 p-4 text-[12px]">
        <div className="mb-2 flex items-center gap-2 font-display text-[14px] font-semibold uppercase tracking-wider text-sev-critical">
          <MapPinOff className="h-4 w-4" />
          Map unavailable
        </div>
        <p className="mb-1">
          <span className="text-muted-foreground">Reason: </span>
          {message}
        </p>
        <p className="mb-3 text-muted-foreground">{GUIDANCE}</p>
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-sm border border-primary/50 px-2 py-1 font-semibold text-primary hover:bg-primary/10"
        >
          <RotateCw className="h-3 w-3" />
          Retry
        </button>
      </div>
    </div>
  );
}
