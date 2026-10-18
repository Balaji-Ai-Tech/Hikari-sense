import { PageSkeleton } from "@/components/hs/states";
import { createFileRoute } from "@tanstack/react-router";
import {
  alertsQuery,
  eventsQuery,
  metricsQuery,
  reportsQuery,
  ingestionQuery,
  rainfallQuery,
  sourcesQuery,
  eventsByTypeQuery,
  verificationTrendQuery,
  stateIntensityQuery,
} from "@/hooks/useWeather";
import { AnalyticsPage } from "@/features/analytics/AnalyticsPage";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics & Trends — HIKARI SENSE" },
      {
        name: "description",
        content: "Operational trends across event types, states and verification.",
      },
      { property: "og:title", content: "Analytics & Trends — HIKARI SENSE" },
      {
        property: "og:description",
        content: "Operational trends across event types, states and verification.",
      },
    ],
  }),
  loader: ({ context }) =>
    Promise.all(
      [eventsByTypeQuery, verificationTrendQuery, stateIntensityQuery, eventsQuery].map((q) =>
        context.queryClient.ensureQueryData(q as never),
      ),
    ),
  pendingComponent: () => <PageSkeleton />,
  component: AnalyticsPage,
});
