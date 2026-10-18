import { PageSkeleton } from "@/components/hs/states";
import { createFileRoute } from "@tanstack/react-router";
import { MLMonitoringPage } from "@/features/ml/MLMonitoringPage";

export const Route = createFileRoute("/ml-monitoring")({
  head: () => ({
    meta: [
      { title: "ML Monitoring — HIKARI SENSE" },
      { name: "description", content: "Drift, latency and prediction quality in production." },
      { property: "og:title", content: "ML Monitoring — HIKARI SENSE" },
      {
        property: "og:description",
        content: "Drift, latency and prediction quality in production.",
      },
    ],
  }),
  pendingComponent: () => <PageSkeleton />,
  component: MLMonitoringPage,
});
