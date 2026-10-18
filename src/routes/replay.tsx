import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/pages/PlaceholderPage";

export const Route = createFileRoute("/replay")({
  head: () => ({
    meta: [
      { title: "Historical Replay — HIKARI SENSE" },
      {
        name: "description",
        content: "Replay past events on the timeline with all source layers.",
      },
      { property: "og:title", content: "Historical Replay — HIKARI SENSE" },
      {
        property: "og:description",
        content: "Replay past events on the timeline with all source layers.",
      },
    ],
  }),
  component: () => <PlaceholderPage path="/replay" />,
});
