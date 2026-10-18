import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/pages/PlaceholderPage";

export const Route = createFileRoute("/verification-analytics")({
  head: () => ({
    meta: [
      { title: "Verification Analytics — HIKARI SENSE" },
      { name: "description", content: "Verification throughput, accuracy and turnaround." },
      { property: "og:title", content: "Verification Analytics — HIKARI SENSE" },
      { property: "og:description", content: "Verification throughput, accuracy and turnaround." },
    ],
  }),
  component: () => <PlaceholderPage path="/verification-analytics" />,
});
