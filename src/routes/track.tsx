import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { TrackPage } from "@/features/public/CitizenReports";

export const Route = createFileRoute("/track")({
  validateSearch: z.object({ id: z.string().max(40).optional() }),
  head: () => ({
    meta: [
      { title: "Track Report — HIKARI SENSE" },
      { name: "description", content: "Track a report by reference ID." },
      { property: "og:title", content: "Track Report — HIKARI SENSE" },
      { property: "og:description", content: "Track a report by reference ID." },
    ],
  }),
  component: TrackRoute,
});

function TrackRoute() {
  const { id } = Route.useSearch();
  return <TrackPage id={id} />;
}
