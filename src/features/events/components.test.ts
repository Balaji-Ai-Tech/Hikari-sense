import { describe, expect, it } from "vitest";
import { isDemoEvent } from "./components";

describe("event provenance labels", () => {
  it("labels only demo events as demo data", () => {
    expect(isDemoEvent({ origin: "backend" })).toBe(false);
    expect(isDemoEvent({ origin: "demo" })).toBe(true);
  });
});
