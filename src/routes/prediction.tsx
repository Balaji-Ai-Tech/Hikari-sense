import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/pages/PlaceholderPage";

export const Route = createFileRoute("/prediction")({
  head: () => ({
    meta: [
      { title: "Prediction — HIKARI SENSE" },
      { name: "description", content: "Short-range nowcasts and model forecast ensembles." },
      { property: "og:title", content: "Prediction — HIKARI SENSE" },
      { property: "og:description", content: "Short-range nowcasts and model forecast ensembles." },
    ],
  }),
  component: () => <PlaceholderPage path="/prediction" />,
});
