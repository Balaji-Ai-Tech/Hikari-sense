import { createFileRoute } from "@tanstack/react-router";
import { NewsWeatherPage } from "@/features/public/PublicPages";

export const Route = createFileRoute("/news-weather")({
  head: () => ({
    meta: [
      { title: "News & Weather — HIKARI SENSE" },
      { name: "description", content: "Public updates on verified weather events." },
      { property: "og:title", content: "News & Weather — HIKARI SENSE" },
      { property: "og:description", content: "Public updates on verified weather events." },
    ],
  }),
  component: NewsWeatherPage,
});
