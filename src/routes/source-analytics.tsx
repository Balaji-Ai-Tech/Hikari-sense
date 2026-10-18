import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/pages/PlaceholderPage";

export const Route = createFileRoute("/source-analytics")({
  head: () => ({
    meta: [
      { title: "Source Analytics — HIKARI SENSE" },
      { name: "description", content: "Volume, latency and reliability by data source." },
      { property: "og:title", content: "Source Analytics — HIKARI SENSE" },
      { property: "og:description", content: "Volume, latency and reliability by data source." },
    ],
  }),
  component: () => <PlaceholderPage path="/source-analytics" />,
});
