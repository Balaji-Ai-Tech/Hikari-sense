import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/pages/PlaceholderPage";

export const Route = createFileRoute("/event-intelligence")({
  head: () => ({
    meta: [
      { title: "Event Intelligence — HIKARI SENSE" },
      {
        name: "description",
        content: "AI-assisted event classification, explanation and source fusion.",
      },
      { property: "og:title", content: "Event Intelligence — HIKARI SENSE" },
      {
        property: "og:description",
        content: "AI-assisted event classification, explanation and source fusion.",
      },
    ],
  }),
  component: () => <PlaceholderPage path="/event-intelligence" />,
});
