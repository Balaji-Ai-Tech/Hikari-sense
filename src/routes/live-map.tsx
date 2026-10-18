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
import { LiveMapPage } from "@/features/map/LiveMapPage";

export const Route = createFileRoute("/live-map")({
  head: () => ({
    meta: [
      { title: "Live Map — HIKARI SENSE" },
      {
        name: "description",
        content: "MapLibre basemap with weather event intelligence overlays.",
      },
      { property: "og:title", content: "Live Map — HIKARI SENSE" },
      {
        property: "og:description",
        content: "MapLibre basemap with weather event intelligence overlays.",
      },
    ],
  }),
  loader: ({ context }) =>
    Promise.all(
      [metricsQuery, eventsQuery, alertsQuery, reportsQuery].map((q) =>
        context.queryClient.ensureQueryData(q as never),
      ),
    ),
  pendingComponent: () => <PageSkeleton map />,
  component: LiveMapPage,
});
