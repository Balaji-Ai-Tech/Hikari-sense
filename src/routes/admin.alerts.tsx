import { createFileRoute } from "@tanstack/react-router";
import { AlertManagementPage } from "@/features/admin/AlertManagementPage";

export const Route = createFileRoute("/admin/alerts")({
  head: () => ({
    meta: [
      { title: "Alert Management — HIKARI SENSE" },
      { name: "description", content: "Configure alert rules, thresholds and dissemination." },
      { property: "og:title", content: "Alert Management — HIKARI SENSE" },
      {
        property: "og:description",
        content: "Configure alert rules, thresholds and dissemination.",
      },
    ],
  }),
  component: AlertManagementPage,
});
