import { createFileRoute } from "@tanstack/react-router";
import { MLMonitoringPage } from "@/features/ml/MLMonitoringPage";

export const Route = createFileRoute("/model-evaluation")({
  head: () => ({
    meta: [
      { title: "Model Evaluation — HIKARI SENSE" },
      { name: "description", content: "Benchmarks and evaluation runs for ML models." },
      { property: "og:title", content: "Model Evaluation — HIKARI SENSE" },
      { property: "og:description", content: "Benchmarks and evaluation runs for ML models." },
    ],
  }),
  component: MLMonitoringPage,
});
