import { createFileRoute } from "@tanstack/react-router";
import { PublicMapPage } from "@/features/public/PublicPages";

export const Route = createFileRoute("/public-map")({
  head: () => ({
    meta: [
      { title: "Weather Map — HIKARI SENSE" },
      { name: "description", content: "Verified weather events across India." },
      { property: "og:title", content: "Weather Map — HIKARI SENSE" },
      { property: "og:description", content: "Verified weather events across India." },
    ],
  }),
  component: PublicMapPage,
});
