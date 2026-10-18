import { CheckCircle2, Circle, CircleDot, Lock } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { findNav } from "@/lib/navigation";
import { DemoTag, Panel, SectionHeader } from "@/components/hs/primitives";

const PHASES = [
  { label: "Data model & service interface", state: "done" },
  { label: "Demo dataset & UI workspace", state: "active" },
  { label: "Backend integration (FastAPI · PostGIS)", state: "todo" },
  { label: "Streaming updates (Kafka · WebSocket)", state: "todo" },
] as const;

/** Professional roadmap state for modules not yet built out. */
export function PlaceholderPage({ path }: { path: string }) {
  const nav = findNav(path);
  if (!nav) return null;
  return (
    <div className="space-y-3">
      <SectionHeader
        eyebrow={nav.section}
        title={nav.title}
        description={nav.description}
        actions={<DemoTag />}
      />
      {nav.restricted && (
        <div className="flex items-center gap-2 rounded-md border border-sev-high/40 bg-sev-high/10 px-3 py-2 text-xs text-sev-high">
          <Lock className="h-3.5 w-3.5" />
          Administrative area — access will be enforced by role-based permissions.
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="Module roadmap">
          <p className="mb-3 text-[12px] text-muted-foreground">
            This workspace is scheduled in the delivery plan. Its navigation, permissions and data
            contracts are in place.
          </p>
          <ol className="space-y-2">
            {PHASES.map((p, i) => (
              <li
                key={p.label}
                className="flex items-center gap-2.5 rounded-sm border border-border bg-panel-raised/50 px-2.5 py-2 text-[12px]"
              >
                {p.state === "done" ? (
                  <CheckCircle2 className="h-4 w-4 text-sev-low" />
                ) : p.state === "active" ? (
                  <CircleDot className="h-4 w-4 text-primary" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="font-mono text-[10px] text-muted-foreground">P{i + 1}</span>
                {p.label}
                <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
                  {p.state === "done"
                    ? "Complete"
                    : p.state === "active"
                      ? "In progress"
                      : "Planned"}
                </span>
              </li>
            ))}
          </ol>
        </Panel>
        <Panel title="Available now">
          <div className="space-y-1 text-[12px]">
            {[
              ["/", "National Dashboard"],
              ["/events", "Live Events"],
              ["/live-map", "Live Map"],
              ["/verification", "Verification Queue"],
              ["/analytics", "Analytics & Trends"],
              ["/data-sources", "Data Sources"],
            ].map(([to, l]) => (
              <Link
                key={to}
                to={to!}
                className="block rounded-sm px-2 py-1.5 text-primary hover:bg-accent"
              >
                {l} →
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
