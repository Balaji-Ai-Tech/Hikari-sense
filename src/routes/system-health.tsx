import { createFileRoute } from "@tanstack/react-router";
import { DataSourcesPage } from "@/features/sources/DataSourcesPage";

export const Route = createFileRoute("/system-health")({
  head: () => ({
    meta: [
      { title: "System Health — HIKARI SENSE" },
      { name: "description", content: "Service uptime, queues and infrastructure status." },
      { property: "og:title", content: "System Health — HIKARI SENSE" },
      { property: "og:description", content: "Service uptime, queues and infrastructure status." },
    ],
  }),
  component: DataSourcesPage,
});
