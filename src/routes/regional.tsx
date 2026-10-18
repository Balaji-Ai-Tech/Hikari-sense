import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/pages/PlaceholderPage";

export const Route = createFileRoute("/regional")({
  head: () => ({
    meta: [
      { title: "Regional Intelligence — HIKARI SENSE" },
      { name: "description", content: "State and district level intelligence summaries." },
      { property: "og:title", content: "Regional Intelligence — HIKARI SENSE" },
      { property: "og:description", content: "State and district level intelligence summaries." },
    ],
  }),
  component: () => <PlaceholderPage path="/regional" />,
});
