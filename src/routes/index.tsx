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
import { DashboardPage } from "@/features/dashboard/DashboardPage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "National Dashboard — HIKARI SENSE" },
      {
        name: "description",
        content: "National weather command center: live events, alerts, map and source status.",
      },
      { property: "og:title", content: "National Dashboard — HIKARI SENSE" },
      {
        property: "og:description",
        content: "National weather command center: live events, alerts, map and source status.",
      },
    ],
  }),
  loader: ({ context }) =>
    Promise.all(
      [
        metricsQuery,
        eventsQuery,
        alertsQuery,
        reportsQuery,
        ingestionQuery,
        rainfallQuery,
        sourcesQuery,
      ].map((q) => context.queryClient.ensureQueryData(q as never)),
    ),
  pendingComponent: () => <PageSkeleton map />,
  component: DashboardPage,
});
