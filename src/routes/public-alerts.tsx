import { createFileRoute } from "@tanstack/react-router";
import { PublicAlertsPage } from "@/features/public/PublicPages";

export const Route = createFileRoute("/public-alerts")({
  head: () => ({
    meta: [
      { title: "Public Alerts — HIKARI SENSE" },
      { name: "description", content: "Active official weather alerts and safety instructions." },
      { property: "og:title", content: "Public Alerts — HIKARI SENSE" },
      {
        property: "og:description",
        content: "Active official weather alerts and safety instructions.",
      },
    ],
  }),
  component: PublicAlertsPage,
});
