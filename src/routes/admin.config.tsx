import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/pages/PlaceholderPage";

export const Route = createFileRoute("/admin/config")({
  head: () => ({
    meta: [
      { title: "System Configuration — HIKARI SENSE" },
      { name: "description", content: "Global platform configuration." },
      { property: "og:title", content: "System Configuration — HIKARI SENSE" },
      { property: "og:description", content: "Global platform configuration." },
    ],
  }),
  component: () => <PlaceholderPage path="/admin/config" />,
});
