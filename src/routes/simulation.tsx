import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/pages/PlaceholderPage";

export const Route = createFileRoute("/simulation")({
  head: () => ({
    meta: [
      { title: "What-If Simulation — HIKARI SENSE" },
      { name: "description", content: "Scenario modelling for rainfall, wind and storm surge." },
      { property: "og:title", content: "What-If Simulation — HIKARI SENSE" },
      {
        property: "og:description",
        content: "Scenario modelling for rainfall, wind and storm surge.",
      },
    ],
  }),
  component: () => <PlaceholderPage path="/simulation" />,
});
