import { createFileRoute } from "@tanstack/react-router";
import { reportsQuery } from "@/hooks/useWeather";
import { DuplicatesPage } from "@/features/verification/DuplicatesPage";

export const Route = createFileRoute("/duplicates")({
  head: () => ({
    meta: [
      { title: "Duplicate Reports — HIKARI SENSE" },
      { name: "description", content: "Clusters of near-duplicate reports for merge decisions." },
      { property: "og:title", content: "Duplicate Reports — HIKARI SENSE" },
      {
        property: "og:description",
        content: "Clusters of near-duplicate reports for merge decisions.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(reportsQuery),
  component: DuplicatesPage,
});
