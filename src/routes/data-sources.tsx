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
import { DataSourcesPage } from "@/features/sources/DataSourcesPage";

export const Route = createFileRoute("/data-sources")({
  head: () => ({
    meta: [
      { title: "Data Sources — HIKARI SENSE" },
      { name: "description", content: "Connector registry, status and reliability weights." },
      { property: "og:title", content: "Data Sources — HIKARI SENSE" },
      {
        property: "og:description",
        content: "Connector registry, status and reliability weights.",
      },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([sourcesQuery].map((q) => context.queryClient.ensureQueryData(q as never))),
  pendingComponent: () => <PageSkeleton table />,
  component: DataSourcesPage,
});
