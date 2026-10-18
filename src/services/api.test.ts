import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  alertService,
  analyticsService,
  BackendApiError,
  eventService,
  sourceService,
  verificationService,
  weatherService,
} from "./api";

describe("eventService provenance", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves an empty response from the live public events API", async () => {
    const fetchMock = vi.fn(
      async () => ({ ok: true, json: async () => ({ items: [], total_pages: 0 }) }) as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(await eventService.publicList()).toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/public/events?page=1&page_size=200",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
  });

  it("marks demo events and gives a non-sensitive reason when the API is unavailable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const events = await eventService.publicList();

    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toMatchObject({
      origin: "demo",
      originError: "Live event API is unavailable because of a network error.",
    });
    warn.mockRestore();
  });
});

describe("sourceService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads source data from the backend API instead of demo repository data", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/dev-login")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ access_token: "dev-token" }),
        } as Response);
      }
      if (url.endsWith("/api/v1/sources")) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              id: "SRC-OPEN-METEO",
              name: "Open-Meteo",
              kind: "Weather API",
              status: "connected",
              reliability: 0.96,
              throughput: "42.5k/min",
              lastSync: "07:30",
              description: "Live weather feed",
              health: "CONNECTED",
            },
          ],
        } as Response);
      }
      return Promise.reject(new Error(`Unexpected fetch to ${url}`));
    });

    vi.stubGlobal("fetch", fetchMock);

    const sources = await sourceService.list();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/auth/dev-login",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/sources",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      id: "SRC-OPEN-METEO",
      name: "Open-Meteo",
      status: "connected",
    });
  });

  it("loads runtime source counters from the backend health endpoint", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/dev-login")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ access_token: "dev-token" }),
        } as Response);
      }
      if (url.endsWith("/api/v1/sources/health")) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              source_id: "source-1",
              code: "SRC-SACHET",
              status: "CONNECTED",
              last_success: "2026-10-03T07:30:00Z",
              last_failure: null,
              latency_ms: 0,
              records_received: 20,
              records_processed: 10,
              error_count: 0,
              last_error: null,
              is_live: true,
              note: "Live connector",
            },
          ],
        } as Response);
      }
      return Promise.reject(new Error(`Unexpected fetch to ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const health = await sourceService.health();

    expect(health).toMatchObject([{ code: "SRC-SACHET", records_received: 20, is_live: true }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/sources/health",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
  });
});

describe("live weather request errors", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("identifies a backend connection failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(
      weatherService.live({ name: "Delhi", latitude: 28.6, longitude: 77.2 }),
    ).rejects.toMatchObject({
      name: "BackendApiError",
      status: 0,
      message: expect.stringContaining("backend is unavailable"),
    });
  });

  it("preserves the backend's invalid-provider-response message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({
          error: {
            code: "HTTP_ERROR",
            message: "Open-Meteo returned an invalid forecast response.",
          },
        }),
      } as Response),
    );

    await expect(
      weatherService.live({ name: "Delhi", latitude: 28.6, longitude: 77.2 }),
    ).rejects.toMatchObject({
      status: 502,
      message: "Open-Meteo returned an invalid forecast response.",
    });
  });

  it("preserves rate-limit status and retry guidance from the backend", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ "Retry-After": "45" }),
        json: async () => ({
          error: { code: "RATE_LIMITED", message: "Open-Meteo rate limit reached. Retry shortly." },
        }),
      } as Response),
    );

    await expect(
      weatherService.live({ name: "Delhi", latitude: 28.6, longitude: 77.2 }),
    ).rejects.toMatchObject({
      status: 429,
      message: expect.stringContaining("rate limit reached"),
    });
  });
});

describe("live data services", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads active alerts from the backend", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/dev-login")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ access_token: "dev-token" }),
        } as Response);
      }
      if (url.endsWith("/api/v1/public/alerts")) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              id: "alert-1",
              title: "River flood warning",
              region: "Uttar Pradesh",
              detail: "Ganga is above normal flood level",
              severity: "high",
              issuedAt: "2026-10-05T03:45:18Z",
              expiresAt: "2026-10-05T09:45:18Z",
              issuer: "IMD",
              eventId: "event-1",
              instructions: ["Move to higher ground"],
              alertType: "flood",
              affectedArea: "Dalmau",
              message: "Flood warning",
              status: "active",
              recipients: [],
              channels: [],
            },
          ],
        } as Response);
      }
      return Promise.reject(new Error(`Unexpected fetch to ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const alerts = await alertService.list();

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      id: "alert-1",
      eventId: "event-1",
      status: "active",
      severity: "high",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/public/alerts",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
  });

  it("loads live KPI and analytics data from the backend", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/dev-login")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ access_token: "dev-token" }),
        } as Response);
      }
      if (url.endsWith("/api/v1/stats/kpis")) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { label: "Total Reports", value: "42", hint: "derived", spark: [1, 2] },
          ],
        } as Response);
      }
      if (url.endsWith("/api/v1/stats/by-type")) {
        return Promise.resolve({
          ok: true,
          json: async () => [{ name: "flood", value: 7 }],
        } as Response);
      }
      return Promise.reject(new Error(`Unexpected fetch to ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const metrics = await analyticsService.metrics();
    const eventTypes = await analyticsService.eventsByType();

    expect(metrics).toMatchObject([{ label: "Total Reports", value: "42", hint: "derived" }]);
    expect(eventTypes).toEqual([{ name: "flood", value: 7 }]);
  });
});

describe("verificationService report queue", () => {
  it("sends combined filters and preserves server pagination metadata", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/dev-login")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ access_token: "queue-token" }),
        } as Response);
      }
      if (url.includes("/api/v1/verification/reports/queue?")) {
        const parsed = new URL(url);
        expect(parsed.searchParams.get("status")).toBe("UNDER_REVIEW");
        expect(parsed.searchParams.get("event_type")).toBe("flood");
        expect(parsed.searchParams.get("has_media")).toBe("true");
        expect(parsed.searchParams.get("page")).toBe("2");
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [
              {
                id: "report-1",
                eventId: null,
                text: "Report",
                language: "en",
                location: "Hyderabad",
                lat: 17.3,
                lng: 78.4,
                reportedAt: "2026-10-05T00:00:00Z",
                hasMedia: true,
                status: "under_review",
                sourceId: "SRC-CITIZEN",
                sourceName: "Citizen",
                sourceType: "citizen",
                sourceAccount: "citizen-1",
                receivedAt: "2026-10-05T00:00:00Z",
                media: [],
                aiClassification: "flood",
                aiConfidence: 0.8,
                duplicateStatus: "unique",
                duplicateOf: null,
                similarity: null,
                severity: "high",
                priority: "normal",
              },
            ],
            total: 31,
            page: 2,
            page_size: 10,
            total_pages: 4,
            status_counts: { UNDER_REVIEW: 12 },
          }),
        } as Response);
      }
      return Promise.reject(new Error(`Unexpected fetch to ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const page = await verificationService.reportQueue("admin", {
      status: "UNDER_REVIEW",
      event_type: "flood",
      has_media: true,
      page: 2,
      page_size: 10,
    });

    expect(page).toMatchObject({
      total: 31,
      page: 2,
      page_size: 10,
      total_pages: 4,
      status_counts: { UNDER_REVIEW: 12 },
    });
    expect(page.items[0]?.severity).toBe("high");
  });
});
