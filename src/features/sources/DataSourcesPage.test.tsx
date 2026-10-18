import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sourceService } from "@/services/api";
import { DataSourcesPage } from "./DataSourcesPage";

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    sourceService: {
      list: vi.fn(),
      health: vi.fn(),
    },
  };
});

const listSources = vi.mocked(sourceService.list);
const loadHealth = vi.mocked(sourceService.health);

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DataSourcesPage />
    </QueryClientProvider>,
  );
}

describe("DataSourcesPage live registry handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (!("ResizeObserver" in globalThis)) {
      Object.defineProperty(globalThis, "ResizeObserver", {
        configurable: true,
        value: class {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
      });
    }
  });

  it("labels fallback data and surfaces the backend error when the registry is unavailable", async () => {
    listSources.mockRejectedValue(new Error("Backend unavailable"));
    loadHealth.mockRejectedValue(new Error("Backend unavailable"));

    renderPage();

    expect(await screen.findByText("DEMO / FALLBACK DATA")).toBeInTheDocument();
    expect(screen.getAllByText(/Backend unavailable/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /retry/i })).toBeEnabled();
  });

  it("keeps an empty backend response empty instead of substituting demo sources", async () => {
    listSources.mockResolvedValue([]);
    loadHealth.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText("Live registry status")).toBeInTheDocument();
    expect(screen.queryByText("DEMO / FALLBACK DATA")).not.toBeInTheDocument();
    expect(screen.getByText("Registered sources").parentElement?.parentElement).toHaveTextContent(
      "0",
    );
  });

  it("recovers to backend rows after retry succeeds", async () => {
    listSources.mockRejectedValueOnce(new Error("Backend unavailable")).mockResolvedValueOnce([
      {
        id: "SRC-SACHET",
        name: "SACHET / NDMA CAP alerts",
        kind: "Official alert",
        status: "connected",
        reliability: 0.6,
        throughput: "8/processed",
        lastSync: "07:22",
        description: "SACHET / NDMA CAP alerts",
      },
    ]);
    loadHealth.mockResolvedValue([]);

    renderPage();
    expect(await screen.findByText("DEMO / FALLBACK DATA")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => {
      expect(screen.getByText("Live registry status")).toBeInTheDocument();
      expect(screen.getAllByText("SACHET / NDMA CAP alerts")).toHaveLength(2);
    });
    expect(screen.queryByText("DEMO / FALLBACK DATA")).not.toBeInTheDocument();
  });
});
