import { createFileRoute } from "@tanstack/react-router";
import { AuditLogPage } from "@/features/admin/AuditLogPage";

export const Route = createFileRoute("/admin/audit")({
  head: () => ({
    meta: [
      { title: "Audit Log — HIKARI SENSE" },
      { name: "description", content: "Immutable log of privileged actions." },
      { property: "og:title", content: "Audit Log — HIKARI SENSE" },
      { property: "og:description", content: "Immutable log of privileged actions." },
    ],
  }),
  component: AuditLogPage,
});
