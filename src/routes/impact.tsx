import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/pages/PlaceholderPage";

export const Route = createFileRoute("/impact")({
  head: () => ({
    meta: [
      { title: "Impact Assessment — HIKARI SENSE" },
      {
        name: "description",
        content: "Population, infrastructure and agriculture exposure estimates.",
      },
      { property: "og:title", content: "Impact Assessment — HIKARI SENSE" },
      {
        property: "og:description",
        content: "Population, infrastructure and agriculture exposure estimates.",
      },
    ],
  }),
  component: () => <PlaceholderPage path="/impact" />,
});
