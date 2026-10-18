import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/pages/PlaceholderPage";

export const Route = createFileRoute("/rainfall")({
  head: () => ({
    meta: [
      { title: "Rainfall Intelligence — HIKARI SENSE" },
      {
        name: "description",
        content: "Observed vs normal rainfall, departures and anomalies by region.",
      },
      { property: "og:title", content: "Rainfall Intelligence — HIKARI SENSE" },
      {
        property: "og:description",
        content: "Observed vs normal rainfall, departures and anomalies by region.",
      },
    ],
  }),
  component: () => <PlaceholderPage path="/rainfall" />,
});
