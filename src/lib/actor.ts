// Demo session store (client-side only). Real enforcement must move to server-verified roles once sign-in exists.
import { useSyncExternalStore } from "react";

export type Role = "citizen" | "analyst" | "verifier" | "admin" | "ml_engineer" | "system_operator";
const LABEL: Record<Role, string> = {
  citizen: "Citizen",
  analyst: "Analyst",
  verifier: "Verifier",
  admin: "Administrator",
  ml_engineer: "ML Engineer",
  system_operator: "System Operator",
};
const KEY = "hs-demo-role";
const IDS = Object.keys(LABEL) as Role[];
let current: Role | null = null;
const subs = new Set<() => void>();

export function getRole(): Role {
  if (current) return current;
  const v = typeof window !== "undefined" ? window.sessionStorage.getItem(KEY) : null;
  current = IDS.includes(v as Role) ? (v as Role) : "citizen";
  return current;
}
export function setRole(r: Role) {
  current = r;
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(KEY, r);
  }
  subs.forEach((f) => f());
}
/** Keep the server snapshot role-neutral; browser storage resolves after hydration. */
export function useRole(): Role | null {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    getRole,
    () => null,
  );
}
let session = "";
export function getActor() {
  if (!session) session = `SES-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const r = getRole();
  return { name: `Demo ${LABEL[r]}`, role: LABEL[r], session: `${session} · 10.0.0.x (demo)` };
}
