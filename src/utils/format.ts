import { DEMO_NOW } from "@/data/demo";

export function minutesAgo(iso: string, now = DEMO_NOW) {
  const m = Math.round((new Date(now).getTime() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ${m % 60}m ago`;
  const d = Math.floor(m / 1440);
  return d === 1 ? "1 day ago" : `${d} days ago`;
}

export const pct = (v: number) => `${Math.round(v * 100)}%`;
