import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/pages/PlaceholderPage";

export const Route = createFileRoute("/decisions")({
  head: () => ({
    meta: [
      { title: "Human Decisions — HIKARI SENSE" },
      { name: "description", content: "Analyst decisions and overrides with rationale." },
      { property: "og:title", content: "Human Decisions — HIKARI SENSE" },
      { property: "og:description", content: "Analyst decisions and overrides with rationale." },
    ],
  }),
  component: () => <PlaceholderPage path="/decisions" />,
});
