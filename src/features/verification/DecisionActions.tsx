import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Check, FileQuestion, Flag, GitMerge, X } from "lucide-react";
import { Modal } from "@/components/hs/data";
import { eventsQuery, useDecide } from "@/hooks/useWeather";
import { isClosed } from "@/services/api";
import type { DecisionAction, WeatherEvent } from "@/types";
import { cn } from "@/lib/utils";
import { hasPermission, useRole } from "@/lib/roles";

const META: Record<DecisionAction, { label: string; icon: typeof Check; cls: string }> = {
  start_review: {
    label: "Start review",
    icon: FileQuestion,
    cls: "border-primary/40 text-primary hover:bg-primary/15",
  },
  approve: {
    label: "Approve",
    icon: Check,
    cls: "border-sev-low/40 text-sev-low hover:bg-sev-low/15",
  },
  verify: {
    label: "Verify",
    icon: Check,
    cls: "border-sev-low/40 text-sev-low hover:bg-sev-low/15",
  },
  reject: {
    label: "Reject",
    icon: X,
    cls: "border-sev-critical/40 text-sev-critical hover:bg-sev-critical/15",
  },
  request_evidence: {
    label: "Request evidence",
    icon: FileQuestion,
    cls: "border-sev-medium/40 text-sev-medium hover:bg-sev-medium/15",
  },
  escalate: {
    label: "Escalate",
    icon: Flag,
    cls: "border-sev-medium/40 text-sev-medium hover:bg-sev-medium/15",
  },
  merge: {
    label: "Merge",
    icon: GitMerge,
    cls: "border-primary/40 text-primary hover:bg-primary/15",
  },
};

/** Approve / Reject / Escalate / Merge. Reasons are required for everything except Approve. */
export function DecisionActions({
  event,
  size = "icon",
}: {
  event: WeatherEvent;
  size?: "icon" | "full";
}) {
  const [action, setAction] = useState<DecisionAction | null>(null);
  const decide = useDecide();
  const role = useRole();
  if (isClosed(event) || event.verification === "verified") return null;
  const possibleActions: DecisionAction[] = [
    "start_review",
    "approve",
    "reject",
    "request_evidence",
    "escalate",
    "merge",
  ];
  const permission: Record<DecisionAction, string> = {
    start_review: "verification:start_review",
    approve: "verification:verify",
    verify: "verification:verify",
    reject: "verification:reject",
    request_evidence: "verification:request_evidence",
    escalate: "verification:escalate",
    merge: "duplicates:merge",
  };
  const actions = role
    ? possibleActions.filter((item) => hasPermission(role, permission[item]))
    : [];
  if (!actions.length) return null;
  return (
    <>
      <div className={cn("flex gap-1", size === "full" && "flex-wrap gap-2")}>
        {actions.map((a) => {
          const M = META[a];
          const Icon = M.icon;
          return (
            <button
              key={a}
              title={M.label}
              disabled={decide.isPending}
              onClick={(ev) => {
                ev.stopPropagation();
                if (a === "approve") decide.mutate({ eventId: event.id, action: a, reason: "" });
                else setAction(a);
              }}
              className={cn(
                "flex items-center justify-center gap-1 rounded-sm border text-[11px] font-semibold disabled:opacity-50",
                M.cls,
                size === "icon" ? "h-6 w-6" : "h-8 px-3",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {size === "full" && M.label}
            </button>
          );
        })}
      </div>
      {action && <ReasonModal event={event} action={action} onClose={() => setAction(null)} />}
    </>
  );
}

function ReasonModal({
  event,
  action,
  onClose,
}: {
  event: WeatherEvent;
  action: DecisionAction;
  onClose: () => void;
}) {
  const { data: events } = useSuspenseQuery(eventsQuery);
  const decide = useDecide();
  const [reason, setReason] = useState("");
  const candidates = events.filter(
    (e) => e.id !== event.id && !isClosed(e) && (e.type === event.type || e.state === event.state),
  );
  const [target, setTarget] = useState(candidates[0]?.id ?? "");
  const valid =
    reason.trim().length >= 5 && reason.length <= 500 && (action !== "merge" || !!target);
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={`${META[action].label} ${event.id}`}>
      <form
        className="space-y-3 text-[12px]"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          decide.mutate(
            {
              eventId: event.id,
              action,
              reason: reason.trim(),
              ...(action === "merge" ? { targetEventId: target } : {}),
            },
            { onSuccess: onClose },
          );
        }}
      >
        {action === "merge" && (
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
              Merge into
            </span>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="h-8 w-full rounded-sm border border-border bg-panel-raised px-2"
            >
              {candidates.map((c) => (
                <option key={c.id} value={c.id} className="bg-popover">
                  {c.id} — {c.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
            Reason (required)
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
            autoFocus
            placeholder="e.g. No official observation; media shows an older event."
            className="w-full rounded-sm border border-border bg-panel-raised p-2 outline-hidden focus:border-primary"
          />
          <span className="text-[10px] text-muted-foreground">
            {reason.trim().length < 5 ? "At least 5 characters" : `${reason.length}/500`}
          </span>
        </label>
        <p className="text-[10px] text-muted-foreground">
          Demo decision — stored for this session only.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-sm border border-border px-3 hover:bg-accent"
          >
            Cancel
          </button>
          <button
            disabled={!valid || decide.isPending}
            className="h-8 rounded-sm bg-primary px-3 font-semibold text-primary-foreground disabled:opacity-50"
          >
            Confirm {META[action].label}
          </button>
        </div>
      </form>
    </Modal>
  );
}
