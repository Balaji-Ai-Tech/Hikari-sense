import type { ReactNode } from "react";
import { AlertOctagon, ArrowDownRight, ArrowUpRight, Inbox, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConnectorStatus, Severity, SystemStatus, VerificationStatus } from "@/types";

export function Panel({
  title,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string | undefined;
  bodyClassName?: string | undefined;
}) {
  return (
    <section
      className={cn("flex min-w-0 flex-col rounded-md border border-border bg-panel", className)}
    >
      {title && (
        <header className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border bg-panel-header px-3">
          <h2 className="truncate font-display text-[13px] font-semibold uppercase tracking-wider text-foreground">
            {title}
          </h2>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={cn("min-h-0 flex-1 p-3", bodyClassName)}>{children}</div>
    </section>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 border-b border-border pb-3">
      <div className="min-w-0">
        {eyebrow && (
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
            {eyebrow}
          </div>
        )}
        <h1 className="truncate font-display text-2xl font-semibold tracking-wide">{title}</h1>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function DemoTag({
  className,
  label = "Demo data",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span
      className={cn(
        "rounded-sm border border-sev-medium/40 bg-sev-medium/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-widest text-sev-medium",
        className,
      )}
    >
      {label}
    </span>
  );
}

export function Sparkline({ data, className }: { data: number[]; className?: string | undefined }) {
  const max = Math.max(...data),
    min = Math.min(...data),
    r = max - min || 1;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * 60},${18 - ((v - min) / r) * 16}`)
    .join(" ");
  return (
    <svg viewBox="0 0 60 20" className={cn("h-5 w-14", className)} aria-hidden>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function MetricCard({
  label,
  value,
  delta,
  up,
  hint,
  spark,
  tone = "primary",
  onClick,
  active,
}: {
  label: string;
  value: string;
  delta?: string | undefined;
  up?: boolean | undefined;
  hint?: string | undefined;
  spark?: number[] | undefined;
  tone?: "primary" | Severity;
  onClick?: () => void;
  active?: boolean;
}) {
  const toneBar: Record<string, string> = {
    primary: "bg-primary",
    critical: "bg-sev-critical",
    high: "bg-sev-high",
    medium: "bg-sev-medium",
    low: "bg-sev-low",
  };
  const toneText: Record<string, string> = {
    primary: "text-primary",
    critical: "text-sev-critical",
    high: "text-sev-high",
    medium: "text-sev-medium",
    low: "text-sev-low",
  };
  return (
    <div
      onClick={onClick}
      className={cn(
        "relative overflow-hidden rounded-md border bg-panel px-3 py-2 transition-colors",
        onClick && "cursor-pointer hover:bg-panel-raised",
        active ? "border-primary/60 glow-primary" : "border-border",
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-0.5", toneBar[tone])} />
      <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className="truncate">{label}</span>
        {hint && <span className="shrink-0 font-mono normal-case">{hint}</span>}
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="tabular font-mono text-xl font-semibold">{value}</span>
          {delta && (
            <span
              className={cn(
                "flex items-center text-[11px] font-medium tabular",
                up ? "text-sev-low" : "text-sev-critical",
              )}
            >
              {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {delta}
            </span>
          )}
        </div>
        {spark && <Sparkline data={spark} className={toneText[tone]} />}
      </div>
    </div>
  );
}

const sevCls: Record<Severity, string> = {
  critical: "border-sev-critical/50 bg-sev-critical/15 text-sev-critical",
  high: "border-sev-high/50 bg-sev-high/15 text-sev-high",
  medium: "border-sev-medium/50 bg-sev-medium/15 text-sev-medium",
  low: "border-sev-low/50 bg-sev-low/15 text-sev-low",
};
const pill =
  "inline-flex shrink-0 items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider";

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={cn(pill, sevCls[severity])}>{severity}</span>;
}

const verCls: Record<VerificationStatus, string> = {
  verified: "border-sev-low/50 bg-sev-low/10 text-sev-low",
  corroborated: "border-primary/50 bg-primary/10 text-primary",
  needs_review: "border-sev-medium/40 bg-sev-medium/10 text-sev-medium",
  low_confidence: "border-sev-high/50 bg-sev-high/10 text-sev-high",
  escalated: "border-sev-critical/50 bg-sev-critical/10 text-sev-critical",
  needs_more_evidence: "border-sev-medium/40 bg-sev-medium/10 text-sev-medium",
  under_review: "border-primary/50 bg-primary/10 text-primary",
  received: "border-border bg-muted/40 text-muted-foreground",
  processing: "border-primary/40 bg-primary/10 text-primary",
  ai_analysis_pending: "border-primary/40 bg-primary/10 text-primary",
  ai_analyzed: "border-primary/40 bg-primary/10 text-primary",
  pending_human_review: "border-sev-medium/40 bg-sev-medium/10 text-sev-medium",
  rejected: "border-border bg-muted/40 text-muted-foreground line-through",
  merged: "border-border bg-muted/40 text-muted-foreground",
};
export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  verified: "Verified",
  corroborated: "Corroborated",
  needs_review: "Needs Review",
  low_confidence: "Low Confidence",
  escalated: "Escalated",
  needs_more_evidence: "Needs More Evidence",
  under_review: "Under Review",
  received: "Received",
  processing: "Processing",
  ai_analysis_pending: "Analysis Pending",
  ai_analyzed: "Analyzed",
  pending_human_review: "Pending Human Review",
  rejected: "Rejected",
  merged: "Merged",
};
export function VerificationBadge({ status }: { status: VerificationStatus }) {
  return <span className={cn(pill, verCls[status])}>{VERIFICATION_LABEL[status]}</span>;
}

const statCls: Record<string, string> = {
  operational: "text-sev-low",
  connected: "text-sev-low",
  receiving: "text-primary",
  degraded: "text-sev-medium",
  down: "text-sev-critical",
  offline: "text-sev-critical",
  maintenance: "text-info",
};
export function StatusBadge({ status }: { status: SystemStatus | ConnectorStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] font-medium capitalize",
        statCls[status],
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-panel px-2 py-1.5">
      {children}
    </div>
  );
}

export function FilterChip({
  active,
  children,
  onClick,
}: {
  active?: boolean | undefined;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-sm border px-2 py-1 text-[11px] font-medium transition-colors",
        active
          ? "border-primary/60 bg-primary/15 text-primary"
          : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function EmptyState({
  title,
  description,
  icon,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border px-4 py-10 text-center">
      <div className="text-muted-foreground">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <div className="text-sm font-medium">{title}</div>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
      {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-sev-critical/40 bg-sev-critical/10 px-3 py-2 text-xs text-sev-critical">
      <AlertOctagon className="h-4 w-4 shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="font-semibold underline">
          Retry
        </button>
      )}
    </div>
  );
}
