import { useMemo } from "react";
import type { WeatherEvent } from "@/types";

/** Stable REST event ordering; arrivals are no longer simulated. */
export function useDemoStream(events: WeatherEvent[]) {
  const visible = useMemo(
    () => [...events].sort((a, b) => b.reportedAt.localeCompare(a.reportedAt)),
    [events],
  );
  return { visible, latestId: undefined, pending: 0 };
}
