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
import { EvidencePage } from "@/features/verification/VerificationPages";

export const Route = createFileRoute("/verification/evidence")({
  head: () => ({
    meta: [
      { title: "Evidence — HIKARI SENSE" },
      { name: "description", content: "Media and report evidence linked to weather events." },
      { property: "og:title", content: "Evidence — HIKARI SENSE" },
      {
        property: "og:description",
        content: "Media and report evidence linked to weather events.",
      },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([reportsQuery].map((q) => context.queryClient.ensureQueryData(q as never))),
  component: EvidencePage,
});
