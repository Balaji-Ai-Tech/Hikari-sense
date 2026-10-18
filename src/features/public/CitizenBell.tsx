import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { submissionsQuery } from "@/hooks/useWeather";
import { useT, type TKey } from "@/i18n";
import { trackStages } from "./CitizenReports";

/** In-app notice that one of the citizen's reports moved to a new status (session-only demo). */
interface Notice {
  id: string;
  reportId: string;
  stage: string;
  at: number;
  read: boolean;
}

let notices: Notice[] = [];
const seen = new Map<string, number>();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const store = {
  subscribe: (f: () => void) => (subs.add(f), () => subs.delete(f)),
  get: () => notices,
  markAllRead: () => {
    notices = notices.map((n) => ({ ...n, read: true }));
    emit();
  },
};

const currentIndex = (s: Parameters<typeof trackStages>[0]) =>
  trackStages(s).reduce((m, st, i) => (st.status !== "pending" ? i : m), 0);

export function CitizenBell() {
  const t = useT();
  const { data } = useQuery({ ...submissionsQuery, refetchInterval: 5000 });
  const list = useSyncExternalStore(store.subscribe, store.get, store.get);
  const [open, setOpen] = useState(false);
  const [, tick] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // Re-check stages every 5 s; stages advance with time in the demo.
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 5000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    for (const s of data ?? []) {
      const idx = currentIndex(s);
      const prev = seen.get(s.id);
      seen.set(s.id, idx);
      if (prev === undefined || idx <= prev) continue;
      const stage = trackStages(s)[idx]!.key;
      const label = t(`stage.${stage}` as TKey);
      notices = [
        { id: `${s.id}-${stage}`, reportId: s.id, stage: label, at: Date.now(), read: false },
        ...notices,
      ].slice(0, 30);
      emit();
      toast(`Report ${s.id} updated`, { description: `New status: ${label}` });
    }
  });
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const unread = list.filter((n) => !n.read).length;
  return (
    <div ref={ref} className="relative">
      <button
        aria-label={`Report updates${unread ? ` (${unread} new)` : ""}`}
        onClick={() => {
          setOpen((o) => !o);
          if (!open) store.markAllRead();
        }}
        className="relative grid h-8 w-8 place-items-center rounded-sm border border-border bg-panel text-muted-foreground hover:text-foreground"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-sev-critical px-1 font-mono text-[9px] font-bold text-destructive-foreground">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-72 rounded-md border border-border bg-panel shadow-lg">
          <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wider">
            Report updates
          </div>
          {list.length ? (
            <ul className="max-h-80 overflow-y-auto">
              {list.map((n) => (
                <li key={n.id}>
                  <Link
                    to="/track"
                    search={{ id: n.reportId }}
                    onClick={() => setOpen(false)}
                    className="block px-3 py-2 text-[12px] hover:bg-accent"
                  >
                    <span className="font-mono text-primary">{n.reportId}</span> is now{" "}
                    <span className="font-semibold">{n.stage}</span>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(n.at).toLocaleTimeString()}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-4 text-[12px] text-muted-foreground">
              No updates yet. You'll be told here when one of your reports changes status.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
