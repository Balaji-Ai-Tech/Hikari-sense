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
import { VerificationQueuePage } from "@/features/verification/VerificationPages";

export const Route = createFileRoute("/verification/")({
  head: () => ({
    meta: [
      { title: "Verification Queue — HIKARI SENSE" },
      { name: "description", content: "Events awaiting corroboration and analyst decision." },
      { property: "og:title", content: "Verification Queue — HIKARI SENSE" },
      {
        property: "og:description",
        content: "Events awaiting corroboration and analyst decision.",
      },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([eventsQuery].map((q) => context.queryClient.ensureQueryData(q as never))),
  pendingComponent: () => <PageSkeleton table />,
  component: VerificationQueuePage,
});
