import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { GlobalSearch } from "./GlobalSearch";
import { CitizenBell } from "@/features/public/CitizenBell";
import { Bell, ChevronDown, Lock, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isNavActive } from "@/lib/navigation";
import {
  ROLES,
  ROLE_HOME,
  ROLE_NAV,
  canAccess,
  roleMeta,
  setRole,
  useRole,
  type Role,
} from "@/lib/roles";
import { useEffect } from "react";
import { Languages } from "lucide-react";
import { StateScreen } from "@/components/hs/states";
import { auditService } from "@/services/api";
import { useInvalidateAll } from "@/hooks/useWeather";
import { LANGUAGES, hasKey, setLang, useLang, useT } from "@/i18n";

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const role = useRole();
  const NAV = role ? ROLE_NAV[role] : [];
  const t = useT();
  const tr = (k: string, fb: string) => (hasKey(k) ? t(k) : fb);
  return (
    <nav className="flex h-full flex-col bg-sidebar">
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4">
        <div className="grid h-8 w-8 place-items-center rounded-sm border border-primary/50 bg-primary/10 font-display text-lg font-bold text-primary glow-primary">
          光
        </div>
        <div className="min-w-0 leading-tight">
          <div className="font-display text-[15px] font-bold tracking-[0.18em] text-sidebar-accent-foreground">
            HIKARI SENSE
          </div>
          <div className="truncate text-[9px] uppercase tracking-wider text-muted-foreground">
            Weather Intelligence Platform
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {NAV.map((section) => (
          <div key={section.label} className="mb-2">
            <div className="flex items-center justify-between px-4 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/80">
              {tr(
                `nav.section.${section.label === "Stay informed" ? "informed" : section.label === "Your reports" ? "reports" : "x"}`,
                section.label,
              )}
              {section.restricted && <Lock className="h-2.5 w-2.5" aria-label="Restricted area" />}
            </div>
            {section.items.map((item) => {
              const active = isNavActive(item.to, path);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  className={cn(
                    "mx-2 flex items-center gap-2.5 rounded-sm border-l-2 px-2 py-1.5 text-[12px] transition-colors",
                    active
                      ? "border-primary bg-sidebar-accent text-sidebar-accent-foreground"
                      : "border-transparent text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  )}
                >
                  <item.icon className={cn("h-3.5 w-3.5 shrink-0", active && "text-primary")} />
                  <span className="truncate">{tr(`nav.${item.to}`, item.title)}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      <div className="border-t border-sidebar-border px-4 py-2 font-mono text-[9px] text-muted-foreground">
        SIH 2026 · PS 26069 · v0.1
      </div>
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const role = useRole();
  return (
    <div className="flex min-h-screen w-full">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-sidebar-border lg:block">
        <Sidebar />
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-background/70" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-sidebar-border">
            <button
              className="absolute right-2 top-4 z-10 text-muted-foreground"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-3 backdrop-blur lg:px-5">
          <button
            className="text-muted-foreground lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden min-w-0 md:block">
            <div className="truncate font-display text-[15px] font-semibold tracking-wide">
              National Weather Big Data Analytics & Intelligence Platform
            </div>
            <div className="truncate text-[10px] text-muted-foreground">
              Real-time monitoring · AI-assisted verification · Multi-source fusion
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {role && role !== "citizen" && <GlobalSearch />}
            <button
              onClick={() =>
                toast("DATA PROVENANCE", {
                  duration: 8000,
                  description:
                    "Data provenance varies by view. Backend-backed records are shown where available; fallback values and illustrative charts are labeled in their respective views.",
                })
              }
              className="hidden h-8 items-center rounded-sm border border-sev-medium/40 bg-sev-medium/10 px-2 font-mono text-[10px] font-semibold tracking-widest text-sev-medium hover:bg-sev-medium/20 md:flex"
              title="Data provenance"
            >
              DATA INFO ⓘ
            </button>
            <div
              className="flex h-8 items-center gap-1.5 rounded-sm border border-border bg-panel px-2 font-mono text-[10px] font-semibold tracking-widest text-muted-foreground"
              title="Data status is reported by each view"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
              DATA STATUS
            </div>
            {role && role !== "citizen" && (
              <button
                className="relative grid h-8 w-8 place-items-center rounded-sm border border-border bg-panel text-muted-foreground hover:text-foreground"
                aria-label="Notifications"
                onClick={() =>
                  toast("3 new high-severity events", {
                    description: "Hyderabad · Chennai · Dehradun (demo)",
                    action: { label: "View", onClick: () => navigate({ to: "/events" }) },
                  })
                }
              >
                <Bell className="h-4 w-4" />
                <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-sev-critical px-1 font-mono text-[9px] font-bold text-destructive-foreground">
                  3
                </span>
              </button>
            )}
            {role === "citizen" && <CitizenBell />}
            <LanguageSelect />
            <RoleSwitcher />
          </div>
        </header>
        <main className="flex-1 bg-grid p-3 lg:p-4">
          <RouteGate role={role} path={path}>
            {children}
          </RouteGate>
        </main>
      </div>
    </div>
  );
}

function RoleSwitcher() {
  const role = useRole();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const refresh = useInvalidateAll();
  if (!role) return <div className="h-8 w-28 rounded-sm border border-border bg-panel" />;
  const m = roleMeta(role);
  const pick = (r: Role) => {
    if (r !== role) {
      auditService.roleChanged(m.label, roleMeta(r).label);
      setRole(r);
      refresh();
    }
    setOpen(false);
    navigate({ to: ROLE_HOME[r] });
    toast(`Switched to ${roleMeta(r).label} (demo)`);
  };
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Switch demo role"
        className="flex h-8 items-center gap-2 rounded-sm border border-border bg-panel pl-1 pr-2"
      >
        <span className="grid h-6 w-6 place-items-center rounded-sm bg-primary/20 font-mono text-[10px] font-bold text-primary">
          {m.initials}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-[11px] font-medium">{m.label}</span>
          <span className="block text-[9px] text-muted-foreground">{m.unit} · Demo</span>
        </span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-56 rounded-sm border border-border bg-panel p-1 shadow-lg">
          <div className="px-2 py-1 text-[9px] uppercase tracking-wider text-muted-foreground">
            Demo role (no sign-in yet)
          </div>
          {ROLES.map((r) => (
            <button
              key={r.id}
              onClick={() => pick(r.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12px] hover:bg-sidebar-accent",
                r.id === role && "text-primary",
              )}
            >
              <span className="font-mono text-[10px]">{r.initials}</span>
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RouteGate({
  role,
  path,
  children,
}: {
  role: Role | null;
  path: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const known = ROLES.some((r) => canAccess(r.id, path));
  const allowed = role ? !known || canAccess(role, path) : false; // unknown paths fall through to the 404 screen
  const isHome = (path.replace(/\/$/, "") || "/") === "/";
  useEffect(() => {
    if (role && !allowed && isHome) navigate({ to: ROLE_HOME[role], replace: true });
  }, [role, allowed, isHome, navigate]);
  if (!role)
    return <div className="p-6 font-mono text-[11px] text-muted-foreground">Checking access…</div>;
  if (allowed) return <>{children}</>;
  if (isHome) return null;
  return <RestrictedScreen role={role} path={path} />;
}

function RestrictedScreen({ role, path }: { role: Role; path: string }) {
  const t = useT();
  return (
    <StateScreen
      kind="restricted"
      title={t("error.restricted").toUpperCase()}
      description={
        <>
          {t("error.restrictedD")}{" "}
          <span className="mt-1 block font-mono text-[11px]">
            {roleMeta(role).label} · {path}
          </span>
        </>
      }
      actions={[
        {
          label: role === "citizen" ? t("common.goMap") : t("common.goDashboard"),
          to: ROLE_HOME[role],
          primary: true,
        },
        { label: t("common.back"), onClick: () => window.history.back() },
        {
          label: t("common.contactAdmin"),
          onClick: () => toast("Contact your platform administrator to request access (demo)."),
        },
      ]}
    />
  );
}

function LanguageSelect() {
  const lang = useLang();
  const t = useT();
  return (
    <label
      className="flex h-8 items-center gap-1 rounded-sm border border-border bg-panel px-1.5"
      title={`${t("common.language")} — UI translation only`}
    >
      <Languages className="h-3.5 w-3.5 text-muted-foreground" />
      <select
        aria-label={t("common.language")}
        value={lang}
        onChange={(e) => setLang(e.target.value as typeof lang)}
        className="bg-transparent text-[11px] outline-none"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} className="bg-panel">
            {l.native}
          </option>
        ))}
      </select>
    </label>
  );
}
