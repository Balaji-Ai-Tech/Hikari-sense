import { afterEach, describe, expect, it, vi } from "vitest";
import { eventService } from "@/services/api";

class MockWebSocket {
  static instance: MockWebSocket;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();

  constructor(
    readonly url: string,
    readonly protocols?: string | string[],
  ) {
    MockWebSocket.instance = this;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("event stream client", () => {
  it("delivers lifecycle messages from the authenticated API stream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: "test-token" }) }),
    );
    vi.stubGlobal("WebSocket", MockWebSocket);
    const onMessage = vi.fn();
    const unsubscribe = eventService.subscribe(onMessage);

    await vi.waitFor(() => expect(MockWebSocket.instance).toBeDefined());
    MockWebSocket.instance.onmessage?.({
      data: JSON.stringify({ type: "EVENT_CREATED", event_id: "event-1" }),
    });

    expect(MockWebSocket.instance.protocols).toEqual(["hikari-auth", "test-token"]);
    expect(new URL(MockWebSocket.instance.url).searchParams.has("token")).toBe(false);
    expect(onMessage).toHaveBeenCalledWith({ type: "EVENT_CREATED", event_id: "event-1" });
    unsubscribe();
    expect(MockWebSocket.instance.close).toHaveBeenCalledOnce();
  });
});
