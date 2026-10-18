import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LiveWeatherLocation } from "@/types";
import { LiveWeatherPicker } from "./LiveWeatherPicker";
import { zoomForLocationAccuracy } from "./locationZoom";

const geolocationDescriptor = Object.getOwnPropertyDescriptor(navigator, "geolocation");
const secureContextDescriptor = Object.getOwnPropertyDescriptor(window, "isSecureContext");

afterEach(() => {
  cleanup();
  if (geolocationDescriptor) {
    Object.defineProperty(navigator, "geolocation", geolocationDescriptor);
  } else {
    Reflect.deleteProperty(navigator, "geolocation");
  }
  if (secureContextDescriptor) {
    Object.defineProperty(window, "isSecureContext", secureContextDescriptor);
  } else {
    Reflect.deleteProperty(window, "isSecureContext");
  }
});

describe("device location", () => {
  it("waits briefly for an improved high-accuracy fix and preserves its accuracy", () => {
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    const onSelect = vi.fn<(location: LiveWeatherLocation) => void>();
    let reportPosition: PositionCallback | undefined;
    const watchPosition = vi.fn(
      (success: PositionCallback, _error: PositionErrorCallback | null, options?: PositionOptions) => {
        expect(options).toEqual({ enableHighAccuracy: true, timeout: 30_000, maximumAge: 0 });
        reportPosition = success;
        return 7;
      },
    );
    const clearWatch = vi.fn();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { watchPosition, clearWatch },
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <LiveWeatherPicker selected={null} onSelect={onSelect} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Use my current location" }));

    reportPosition?.({
      coords: { latitude: 17.385, longitude: 78.4867, accuracy: 8_000 } as GeolocationCoordinates,
      timestamp: Date.now(),
    } as GeolocationPosition);
    expect(onSelect).not.toHaveBeenCalled();
    reportPosition?.({
      coords: {
        latitude: 37.4219999,
        longitude: -122.0840575,
        accuracy: 18,
      } as GeolocationCoordinates,
      timestamp: Date.now(),
    } as GeolocationPosition);

    expect(onSelect).toHaveBeenCalledWith({
      name: "My location",
      latitude: 37.4219999,
      longitude: -122.0840575,
      accuracyMeters: 18,
    });
    expect(clearWatch).toHaveBeenCalledWith(7);
  });

  it("zooms in for precise fixes while keeping coarse accuracy visible", () => {
    expect(zoomForLocationAccuracy(50, 4.4)).toBe(16);
    expect(zoomForLocationAccuracy(500, 4.4)).toBeCloseTo(12.678, 2);
    expect(zoomForLocationAccuracy(50, 17)).toBe(17);
    expect(zoomForLocationAccuracy(0, 4.4)).toBe(6);
  });
});
