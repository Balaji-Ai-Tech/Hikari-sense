import { createFileRoute } from "@tanstack/react-router";
import { UsersRolesPage } from "@/features/admin/UsersRolesPage";

export const Route = createFileRoute("/admin/users")({
  head: () => ({
    meta: [
      { title: "Users & Roles — HIKARI SENSE" },
      { name: "description", content: "User accounts and role assignments." },
      { property: "og:title", content: "Users & Roles — HIKARI SENSE" },
      { property: "og:description", content: "User accounts and role assignments." },
    ],
  }),
  component: UsersRolesPage,
});
