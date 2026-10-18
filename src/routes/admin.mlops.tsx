import { createFileRoute } from "@tanstack/react-router";
import { MLMonitoringPage } from "@/features/ml/MLMonitoringPage";

export const Route = createFileRoute("/admin/mlops")({
  head: () => ({
    meta: [
      { title: "MLOps — HIKARI SENSE" },
      { name: "description", content: "Model registry, deployments and rollbacks." },
      { property: "og:title", content: "MLOps — HIKARI SENSE" },
      { property: "og:description", content: "Model registry, deployments and rollbacks." },
    ],
  }),
  component: MLMonitoringPage,
});
