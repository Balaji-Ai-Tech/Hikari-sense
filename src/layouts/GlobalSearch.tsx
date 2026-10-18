import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, FileText, Radio, Search } from "lucide-react";
import { searchService } from "@/services/api";
import type { SearchResult } from "@/types";
import { cn } from "@/lib/utils";

const ICON = { event: Radio, report: FileText, alert: AlertTriangle };

/** Searches events, reports and alerts from the central dataset (debounced). */
export function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      searchService.search(q).then((r) => {
        setResults(r);
        setActive(0);
      });
    }, 200);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const go = (r: SearchResult) => {
    setOpen(false);
    setQ("");
    if (r.kind === "alert") navigate({ to: "/alerts/$alertId", params: { alertId: r.id } });
    else
      navigate({
        to: "/events/$eventId",
        params: { eventId: r.kind === "event" ? r.id : r.eventId! },
      });
  };

  return (
    <div ref={box} className="relative hidden sm:block">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const r = results[active];
          if (r) go(r);
        }}
        className="flex h-8 items-center gap-2 rounded-sm border border-border bg-panel px-2"
      >
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={q}
          maxLength={80}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            }
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Search event, report, alert ID, place…"
          aria-label="Global search"
          className="w-44 bg-transparent text-[12px] outline-hidden placeholder:text-muted-foreground xl:w-64"
        />
        <kbd className="font-mono text-[9px] text-muted-foreground">↵</kbd>
      </form>
      {open && q.trim().length >= 2 && (
        <div className="absolute right-0 top-9 z-40 w-[380px] overflow-hidden rounded-md border border-border bg-popover shadow-lg">
          {results.length === 0 ? (
            <div className="px-3 py-3 text-[12px] text-muted-foreground">No matches for “{q}”.</div>
          ) : (
            <ul className="max-h-[360px] overflow-y-auto py-1">
              {results.map((r, i) => {
                const Icon = ICON[r.kind];
                return (
                  <li key={`${r.kind}-${r.id}`}>
                    <button
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(r)}
                      className={cn(
                        "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-1.5 text-left",
                        i === active && "bg-accent",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 text-primary" />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] text-primary">{r.id}</span>
                          <span className="truncate text-[12px] font-medium">{r.title}</span>
                        </span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {r.location}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block text-[9px] uppercase tracking-wider text-muted-foreground">
                          {r.kind}
                        </span>
                        <span className="block text-[10px] uppercase">
                          {r.status.replace("_", " ")}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
