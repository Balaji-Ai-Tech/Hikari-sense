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
import { EventsPage } from "@/features/events/EventsPage";

export const Route = createFileRoute("/events/")({
  head: () => ({
    meta: [
      { title: "Live Events — HIKARI SENSE" },
      {
        name: "description",
        content: "Live multi-source weather events with filters, map and stream.",
      },
      { property: "og:title", content: "Live Events — HIKARI SENSE" },
      {
        property: "og:description",
        content: "Live multi-source weather events with filters, map and stream.",
      },
    ],
  }),
  loader: ({ context }) =>
    Promise.all(
      [metricsQuery, eventsQuery, alertsQuery, reportsQuery].map((q) =>
        context.queryClient.ensureQueryData(q as never),
      ),
    ),
  pendingComponent: () => <PageSkeleton table />,
  component: EventsPage,
});
