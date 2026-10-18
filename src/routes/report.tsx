import { createFileRoute } from "@tanstack/react-router";
import { ReportPage } from "@/features/public/CitizenReports";

export const Route = createFileRoute("/report")({
  head: () => ({
    meta: [
      { title: "Report Weather Event — HIKARI SENSE" },
      {
        name: "description",
        content: "Submit an observation with location, media and description.",
      },
      { property: "og:title", content: "Report Weather Event — HIKARI SENSE" },
      {
        property: "og:description",
        content: "Submit an observation with location, media and description.",
      },
    ],
  }),
  component: ReportPage,
});
