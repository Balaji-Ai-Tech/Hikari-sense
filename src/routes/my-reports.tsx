import { createFileRoute } from "@tanstack/react-router";
import { MyReportsPage } from "@/features/public/CitizenReports";

export const Route = createFileRoute("/my-reports")({
  head: () => ({
    meta: [
      { title: "My Reports — HIKARI SENSE" },
      { name: "description", content: "Reports you have submitted and their status." },
      { property: "og:title", content: "My Reports — HIKARI SENSE" },
      { property: "og:description", content: "Reports you have submitted and their status." },
    ],
  }),
  component: MyReportsPage,
});
