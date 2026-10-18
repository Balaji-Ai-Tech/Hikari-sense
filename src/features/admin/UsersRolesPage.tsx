import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Panel, SectionHeader } from "@/components/hs/primitives";
import { DataTable } from "@/components/hs/data";
import { ROLES, ROLE_NAV, type Role } from "@/lib/roles";
import { adminService } from "@/services/api";
import { reviewersQuery } from "@/hooks/useWeather";
import { useRole } from "@/lib/roles";
import { toast } from "sonner";

export function UsersRolesPage() {
  const role = useRole();
  const client = useQueryClient();
  const [query, setQuery] = useState("");
  const usersQuery = useQuery({
    queryKey: ["adminUsers", query],
    queryFn: () => adminService.users(role ?? "admin", query),
  });
  const matrixQuery = useQuery({
    queryKey: ["rbacRolePermissions"],
    queryFn: () => adminService.rolePermissions(role ?? "admin"),
  });
  const reviewers = useQuery(reviewersQuery(role ?? "admin"));
  const roleChange = useMutation({
    mutationFn: ({ id, nextRole }: { id: string; nextRole: Role }) =>
      adminService.setUserRole(id, nextRole, role ?? "admin"),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["adminUsers"] });
      await client.invalidateQueries({ queryKey: ["audit"] });
      toast.success("Role change saved and audited.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const statusChange = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminService.setUserActive(id, isActive, role ?? "admin"),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ["adminUsers"] });
      await client.invalidateQueries({ queryKey: ["audit"] });
      toast.success(`Account ${result.is_active ? "enabled" : "disabled"} and audited.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const label = (r: Role) => ROLES.find((x) => x.id === r)!.label;
  const users = usersQuery.data ?? [];
  const roleMatrix = matrixQuery.data ?? [];
  return (
    <div className="space-y-3">
      <SectionHeader
        eyebrow="Admin"
        title="Users & Roles"
        description="Manage live accounts and inspect the backend permission policy. Administrative changes are audited."
      />
      <Panel title={`${usersQuery.isLoading ? "Loading" : users.length} accounts`}>
        <div className="border-b border-border p-2">
          <input
            aria-label="Search users"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, username, email"
            className="h-8 w-full max-w-sm rounded-sm border border-border bg-panel-raised px-2 text-[12px]"
          />
        </div>
        {usersQuery.isError ? (
          <p role="alert" className="p-3 text-[12px] text-sev-critical">
            Could not load users. {usersQuery.error.message}
          </p>
        ) : users.length === 0 ? (
          <p className="p-3 text-[12px] text-muted-foreground">No users match this search.</p>
        ) : (
          <DataTable
            rows={users}
            rowKey={(user) => user.id}
            columns={[
              {
                key: "id",
                header: "User ID",
                render: (user) => <span className="font-mono text-[11px]">{user.id}</span>,
              },
              { key: "n", header: "Name", render: (user) => user.display_name || user.username },
              {
                key: "e",
                header: "Username / email",
                render: (user) => (
                  <span className="text-muted-foreground">
                    {user.username}
                    {user.email ? ` · ${user.email}` : ""}
                  </span>
                ),
              },
              {
                key: "r",
                header: "Role",
                render: (user) => (
                  <select
                    aria-label={`Role for ${user.display_name || user.username}`}
                    value={(user.roles[0] ?? "citizen") as Role}
                    disabled={roleChange.isPending || !user.is_active}
                    onChange={(event) =>
                      roleChange.mutate({ id: user.id, nextRole: event.target.value as Role })
                    }
                    className="h-7 rounded-sm border border-border bg-panel-raised px-1.5 text-[12px]"
                  >
                    {ROLES.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                ),
              },
              {
                key: "active",
                header: "Account",
                render: (user) => (user.is_active ? "Enabled" : "Disabled"),
              },
              {
                key: "status",
                header: "Action",
                render: (user) => (
                  <button
                    type="button"
                    disabled={statusChange.isPending}
                    onClick={() => statusChange.mutate({ id: user.id, isActive: !user.is_active })}
                    className="h-7 rounded-sm border border-border px-2 text-[11px] disabled:opacity-50"
                  >
                    {user.is_active ? "Disable" : "Enable"}
                  </button>
                ),
              },
            ]}
          />
        )}
      </Panel>
      <Panel title="Reviewer workload">
        {reviewers.data?.length ? (
          <DataTable
            rows={reviewers.data}
            rowKey={(reviewer) => reviewer.id}
            columns={[
              {
                key: "name",
                header: "Reviewer",
                render: (reviewer) => reviewer.display_name || reviewer.username,
              },
              {
                key: "roles",
                header: "Role",
                render: (reviewer) =>
                  reviewer.roles.map((reviewerRole) => label(reviewerRole as Role)).join(", "),
              },
              {
                key: "active",
                header: "Status",
                render: (reviewer) => (reviewer.is_active ? "Enabled" : "Disabled"),
              },
              {
                key: "workload",
                header: "Active assignments",
                render: (reviewer) => String(reviewer.active_assignments),
              },
            ]}
          />
        ) : (
          <p className="p-3 text-[12px] text-muted-foreground">No eligible active reviewers.</p>
        )}
      </Panel>
      <Panel title="System role permissions">
        {matrixQuery.isError ? (
          <p role="alert" className="p-3 text-[12px] text-sev-critical">
            Could not load permissions. {matrixQuery.error.message}
          </p>
        ) : (
          <DataTable
            rows={roleMatrix}
            rowKey={(row) => row.name}
            columns={[
              { key: "role", header: "Role", render: (row) => label(row.name as Role) },
              {
                key: "permissions",
                header: "Backend permissions",
                render: (row) => (
                  <span className="text-[11px] text-muted-foreground">
                    {row.permissions.join(" · ")}
                  </span>
                ),
              },
            ]}
          />
        )}
      </Panel>
    </div>
  );
}
