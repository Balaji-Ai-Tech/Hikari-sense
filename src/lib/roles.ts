import { ALL_NAV, type NavSection } from "@/lib/navigation";

import type { Role } from "@/lib/actor";
export type { Role };

export const ROLES: { id: Role; label: string; initials: string; unit: string }[] = [
  { id: "citizen", label: "Citizen", initials: "CZ", unit: "Public portal" },
  { id: "analyst", label: "Analyst", initials: "AN", unit: "Ops Desk" },
  { id: "verifier", label: "Verifier", initials: "VR", unit: "Verification Cell" },
  { id: "admin", label: "Administrator", initials: "AD", unit: "Platform Admin" },
  { id: "ml_engineer", label: "ML Engineer", initials: "ML", unit: "Model Ops" },
  { id: "system_operator", label: "System Operator", initials: "SO", unit: "Infra & Ingestion" },
];

const ROLE_PERMISSIONS: Record<Role, readonly string[]> = {
  citizen: [
    "public:read",
    "alerts:read",
    "reports:create",
    "reports:read:own",
    "reports:update:own",
    "media:upload",
    "media:read:own",
    "citizen:submit",
    "citizen:own",
    "notifications:own",
  ],
  analyst: [
    "public:read",
    "alerts:read",
    "events:read",
    "reports:read:all",
    "reports:update:review",
    "media:read:review",
    "verification:queue:read",
    "verification:read",
    "verification:reviewers:read",
    "verification:start_review",
    "verification:request_evidence",
    "verification:escalate",
    "evidence:read",
    "evidence:link",
    "evidence:correlate",
    "events:create_candidate",
    "duplicates:suggest",
    "ai:read",
    "ai:run",
    "sources:read",
    "analytics:read",
    "system:health",
    "audit:read:relevant",
    "notifications:own",
  ],
  verifier: [
    "public:read",
    "alerts:read",
    "events:read",
    "reports:read:all",
    "reports:update:review",
    "media:read:review",
    "verification:queue:read",
    "verification:read",
    "verification:reviewers:read",
    "verification:start_review",
    "verification:verify",
    "verification:reject",
    "verification:request_evidence",
    "verification:escalate",
    "evidence:read",
    "evidence:link",
    "evidence:correlate",
    "events:create_candidate",
    "events:update",
    "events:verify",
    "duplicates:suggest",
    "duplicates:merge",
    "ai:read",
    "ai:run",
    "sources:read",
    "analytics:read",
    "system:health",
    "audit:read:relevant",
    "notifications:own",
  ],
  ml_engineer: [
    "public:read",
    "events:read",
    "reports:read:ai",
    "media:read:ai",
    "evidence:read",
    "evidence:correlate",
    "ai:read",
    "ai:run",
    "ai:configure",
    "ai:models:manage",
    "ml:read",
    "sources:read",
    "analytics:read",
    "system:health",
  ],
  system_operator: [
    "public:read",
    "events:read",
    "evidence:read",
    "sources:read",
    "sources:configure",
    "sources:operate",
    "system:health",
    "system:logs",
    "system:operate",
  ],
  admin: [
    "public:read",
    "alerts:read",
    "alerts:manage",
    "analytics:read",
    "events:read",
    "reports:create",
    "reports:read:own",
    "reports:read:all",
    "reports:read:ai",
    "reports:update:own",
    "reports:update:review",
    "reports:delete",
    "citizen:submit",
    "citizen:own",
    "notifications:own",
    "media:upload",
    "media:read:own",
    "media:read:review",
    "media:read:ai",
    "verification:queue:read",
    "verification:read",
    "verification:reviewers:read",
    "verification:start_review",
    "verification:verify",
    "verification:reject",
    "verification:request_evidence",
    "verification:escalate",
    "verification:assign",
    "verification:decide",
    "evidence:read",
    "evidence:link",
    "evidence:correlate",
    "events:create_candidate",
    "events:update",
    "events:verify",
    "duplicates:suggest",
    "duplicates:merge",
    "ai:read",
    "ai:run",
    "ai:configure",
    "ai:models:manage",
    "sources:read",
    "sources:configure",
    "sources:operate",
    "system:health",
    "system:logs",
    "system:operate",
    "audit:read",
    "audit:read:security",
    "users:read",
    "users:create",
    "users:update",
    "users:disable",
    "users:manage",
    "sources:manage",
    "ml:read",
    "rbac:read",
    "rbac:manage",
    "settings:read",
    "settings:manage",
  ],
};

export function hasPermission(role: Role, permission: string) {
  return ROLE_PERMISSIONS[role].includes(permission);
}
export const roleMeta = (r: Role) => ROLES.find((x) => x.id === r)!;

const sec = (label: string, paths: string[], restricted = false): NavSection => ({
  label,
  restricted,
  items: paths.map((p) => {
    const n = ALL_NAV.find((i) => i.to === p);
    if (!n) throw new Error(`Unknown nav path ${p}`);
    return n;
  }),
});

const PUBLIC = [
  "/public-map",
  "/news-weather",
  "/public-alerts",
  "/report",
  "/my-reports",
  "/track",
];
const COMMAND = ["/", "/events", "/live-map"];
const INTEL = [
  "/event-intelligence",
  "/rainfall",
  "/prediction",
  "/inundation",
  "/impact",
  "/simulation",
  "/replay",
];
const VERIF = ["/verification", "/verification/evidence", "/duplicates", "/decisions"];
const ANALYTICS = ["/analytics", "/regional", "/source-analytics", "/verification-analytics"];
const DATA = ["/data-sources", "/ingestion", "/system-health"];
const ML = ["/model-evaluation", "/ml-monitoring", "/admin/mlops"];
const ADMIN = ["/admin/users", "/admin/alerts", "/admin/audit", "/admin/mlops", "/admin/config"];

/** Each role gets its own navigation experience; route access is derived from it. */
export const ROLE_NAV: Record<Role, NavSection[]> = {
  citizen: [
    sec("Stay informed", ["/public-map", "/news-weather", "/public-alerts"]),
    sec("Your reports", ["/report", "/my-reports", "/track"]),
  ],
  analyst: [
    sec("Command Center", COMMAND),
    sec("Intelligence", INTEL),
    sec("Analytics", ANALYTICS),
    sec("Evidence", ["/verification", "/verification/evidence", "/decisions"]),
  ],
  verifier: [
    sec("Command Center", COMMAND),
    sec("Verification", VERIF),
    sec("Quality", ["/verification-analytics", "/source-analytics"]),
  ],
  ml_engineer: [
    sec("Overview", ["/", "/events"]),
    sec("Models", ["/event-intelligence", "/prediction", ...ML]),
    sec("Data quality", ["/source-analytics", "/verification-analytics"]),
  ],
  system_operator: [
    sec("Overview", ["/", "/live-map"]),
    sec("Data & System", DATA),
    sec("Throughput", ["/source-analytics"]),
  ],
  admin: [
    sec("Command Center", COMMAND),
    sec("Intelligence", INTEL),
    sec("Verification", VERIF),
    sec("Analytics", ANALYTICS),
    sec("Data & System", [...DATA, "/model-evaluation", "/ml-monitoring"]),
    sec("Admin", ADMIN, true),
    sec("Public portal", PUBLIC),
  ],
};

/** Detail routes not in the menu, granted per role. */
const EXTRA: Record<Role, string[]> = {
  citizen: [],
  analyst: ["/events/", "/alerts/"],
  verifier: ["/events/", "/alerts/"],
  ml_engineer: ["/events/"],
  system_operator: [],
  admin: ["/events/", "/alerts/"],
};

export const ROLE_HOME: Record<Role, string> = {
  citizen: "/public-map",
  analyst: "/",
  verifier: "/verification",
  admin: "/",
  ml_engineer: "/ml-monitoring",
  system_operator: "/system-health",
};

export function canAccess(role: Role, pathname: string) {
  const p = pathname.replace(/\/$/, "") || "/";
  if (ROLE_NAV[role].some((s) => s.items.some((i) => i.to === p))) return true;
  return EXTRA[role].some((pre) => p.startsWith(pre));
}

export { setRole, useRole, getRole } from "@/lib/actor";
