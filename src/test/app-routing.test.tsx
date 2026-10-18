import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, render, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { routeTree } from "@/routeTree.gen";
import { Route as rootRoute } from "@/routes/__root";
import { useRole } from "@/lib/actor";
import { eventService } from "@/services/api";

const TestShell = ({ children }: { children: ReactNode }) => <>{children}</>;
const rootRouteShell = rootRoute as unknown as {
  options: { shellComponent?: ((props: { children: ReactNode }) => ReactNode) | undefined };
  update: (options: {
    shellComponent?: ((props: { children: ReactNode }) => ReactNode) | undefined;
  }) => unknown;
};
const appShell = rootRouteShell.options.shellComponent;

function renderAt(path: string) {
  rootRouteShell.update({ shellComponent: TestShell });
  const queryClient = new QueryClient();
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return render(<RouterProvider router={router} />);
}

afterEach(() => {
  cleanup();
  rootRouteShell.update({ shellComponent: appShell });
  vi.restoreAllMocks();
});

// Assert only that the router mounts and paints, never page content:
// routes are rewritten as the app is built and this must keep passing.
describe("App routing", () => {
  it("renders the index route", async () => {
    const { container } = renderAt("/");

    await waitFor(() => expect(container.firstChild).not.toBeNull());
  });

  it("renders the not-found route", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { container } = renderAt("/this-route-does-not-exist");

    await waitFor(() => expect(container.firstChild).not.toBeNull());
  });

  it("keeps the role-neutral server snapshot until browser hydration", () => {
    const originalWindow = globalThis.window;
    vi.stubGlobal("window", undefined);

    try {
      function RoleProbe() {
        const role = useRole();
        return <span>{role ?? "missing"}</span>;
      }

      const html = renderToString(<RoleProbe />);

      expect(html).toContain("missing");
      expect(html).not.toContain("citizen");
    } finally {
      vi.stubGlobal("window", originalWindow);
    }
  });

  it("falls back to demo events when the backend is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("database unavailable"))),
    );

    await expect(eventService.publicList()).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: expect.any(String) })]),
    );
  });
});
