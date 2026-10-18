import { createFileRoute } from "@tanstack/react-router";
import { PipelinePanel } from "@/features/sources/DataSourcesPage";

export const Route = createFileRoute("/ingestion")({
  head: () => ({
    meta: [
      { title: "Ingestion Monitoring — HIKARI SENSE" },
      { name: "description", content: "Pipeline throughput, lag and failures." },
      { property: "og:title", content: "Ingestion Monitoring — HIKARI SENSE" },
      { property: "og:description", content: "Pipeline throughput, lag and failures." },
    ],
  }),
  component: () => <PipelinePanel />,
});
