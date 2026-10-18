import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/pages/PlaceholderPage";

export const Route = createFileRoute("/inundation")({
  head: () => ({
    meta: [
      { title: "Inundation / DIRI — HIKARI SENSE" },
      {
        name: "description",
        content: "Inundation risk and Disaster Impact Risk Index by district.",
      },
      { property: "og:title", content: "Inundation / DIRI — HIKARI SENSE" },
      {
        property: "og:description",
        content: "Inundation risk and Disaster Impact Risk Index by district.",
      },
    ],
  }),
  component: () => <PlaceholderPage path="/inundation" />,
});
