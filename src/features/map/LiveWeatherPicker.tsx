import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LocateFixed, LoaderCircle, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BackendApiError,
  weatherService,
  type LiveWeatherResponse,
  type WeatherLocationResult,
} from "@/services/api";
import type { LiveWeatherLocation } from "@/types";

type LiveWeatherPickerProps = {
  selected: LiveWeatherLocation | null;
  onSelect: (location: LiveWeatherLocation) => void;
};

function locationLabel(location: WeatherLocationResult) {
  return [location.name, location.admin2, location.admin1, location.country]
    .filter(Boolean)
    .join(", ");
}

function parseCoordinates(value: string): LiveWeatherLocation | "invalid" | null {
  if (!value.includes(",")) return null;
  const parts = value.trim().split(",");
  if (parts.length !== 2 || parts.some((part) => !/^[+-]?\d+(?:\.\d+)?$/.test(part.trim())))
    return null;
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return "invalid";
  return { name: "Coordinate search", latitude, longitude };
}

function value(data: LiveWeatherResponse | undefined, field: string) {
  const item = data?.current[field];
  return typeof item === "number" ? item : null;
}

function forecastValue(
  data: LiveWeatherResponse,
  group: "hourly" | "daily",
  field: string,
  index: number,
) {
  const item = data[group][field]?.[index];
  return typeof item === "number" ? item : null;
}

function requestErrorMessage(error: Error, request: "location search" | "weather forecast") {
  if (!(error instanceof BackendApiError)) return error.message || `The ${request} request failed.`;
  if (error.status === 0)
    return "Backend unavailable: confirm FastAPI is running at localhost:8000 and CORS allows this page.";
  if (error.status === 429) return `Rate limit reached for ${request}. Wait briefly, then retry.`;
  if (error.status === 504)
    return `Open-Meteo ${request} timed out. Retry when the provider is reachable.`;
  if (error.status === 502 && /invalid|inconsistent/i.test(error.message))
    return `Open-Meteo returned an invalid ${request} response.`;
  if (error.status === 502) return `Open-Meteo ${request} is unavailable. Retry shortly.`;
  return error.message;
}

function useMyLocation(onSelect: (location: LiveWeatherLocation) => void) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locate = () => {
    setError(null);
    if (!window.isSecureContext) {
      setError("Device location requires HTTPS or localhost.");
      return;
    }
    if (!navigator.geolocation) {
      setError("This device does not provide location services.");
      return;
    }
    setPending(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setPending(false);
        onSelect({
          name: "My location",
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
      },
      (positionError) => {
        setPending(false);
        setError(
          positionError.code === positionError.PERMISSION_DENIED
            ? "Location permission was denied."
            : positionError.code === positionError.TIMEOUT
              ? "The device location request timed out."
              : "The device location is unavailable.",
        );
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  };
  return { locate, pending, error };
}

export function LiveWeatherPicker({ selected, onSelect }: LiveWeatherPickerProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [refreshRequest, setRefreshRequest] = useState<{
    locationKey: string;
    nonce: number;
  } | null>(null);
  const gps = useMyLocation(onSelect);
  const locationKey = selected ? `${selected.latitude}:${selected.longitude}` : "";
  const refreshNonce = refreshRequest?.locationKey === locationKey ? refreshRequest.nonce : 0;
  const coordinateSearch = parseCoordinates(debouncedQuery);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (selected) setSearchOpen(false);
  }, [selected]);

  const search = useQuery({
    queryKey: ["weatherLocationSearch", debouncedQuery],
    queryFn: ({ signal }) => weatherService.searchLocations(debouncedQuery, signal),
    enabled: debouncedQuery.length >= 2 && coordinateSearch === null,
    staleTime: 5 * 60_000,
  });
  const forecast = useQuery({
    queryKey: ["liveWeather", selected?.latitude, selected?.longitude, refreshNonce],
    queryFn: ({ signal }) => weatherService.live(selected!, signal, refreshNonce > 0),
    enabled: selected !== null,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const data = forecast.data;
  const current = [
    ["Temperature", value(data, "temperature_2m"), "°C"],
    ["Feels like", value(data, "apparent_temperature"), "°C"],
    ["Humidity", value(data, "relative_humidity_2m"), "%"],
    ["Rain", value(data, "rain") ?? value(data, "precipitation"), "mm"],
    ["Wind", value(data, "wind_speed_10m"), "km/h"],
    ["Gusts", value(data, "wind_gusts_10m"), "km/h"],
  ] as const;
  const weatherCode = value(data, "weather_code");
  const stale = data ? Date.now() - Date.parse(data.fetchedAt) > 10 * 60_000 : false;
  const hourlySlots = (data?.hourly.time ?? []).slice(0, 6).map((time, index) => ({ time, index }));
  const dailySlots = (data?.daily.time ?? []).slice(0, 5).map((time, index) => ({ time, index }));

  return (
    <section className="border-b border-border px-3 py-3" aria-label="Live weather by location">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 font-mono text-[10px] font-semibold uppercase text-muted-foreground">
            Live weather location
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                aria-label="Search a city, district, region, or country"
                aria-autocomplete="list"
                autoComplete="off"
                className="h-9 pl-9 text-sm"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                placeholder="Search any place"
                value={query}
              />
              {searchOpen && query.trim().length >= 2 && (
                <div
                  className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto border border-border bg-popover shadow-md"
                  role="listbox"
                >
                  {search.isFetching ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      Searching Open-Meteo…
                    </div>
                  ) : coordinateSearch === "invalid" ? (
                    <div className="px-3 py-2 text-xs text-sev-high">
                      Enter latitude, longitude within WGS84 bounds.
                    </div>
                  ) : coordinateSearch ? (
                    <button
                      className="block w-full px-3 py-2 text-left text-xs hover:bg-accent"
                      onClick={() => {
                        setQuery(`${coordinateSearch.latitude}, ${coordinateSearch.longitude}`);
                        setSearchOpen(false);
                        onSelect(coordinateSearch);
                      }}
                      role="option"
                      type="button"
                    >
                      Use coordinates {coordinateSearch.latitude}, {coordinateSearch.longitude}
                    </button>
                  ) : search.isError ? (
                    <div className="px-3 py-2 text-xs text-sev-high" role="alert">
                      {requestErrorMessage(search.error, "location search")}
                    </div>
                  ) : search.data?.items.length ? (
                    search.data.items.map((place) => (
                      <button
                        key={`${place.id ?? place.name}:${place.latitude}:${place.longitude}`}
                        className="block w-full border-b border-border px-3 py-2 text-left last:border-0 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => {
                          const name = locationLabel(place);
                          setQuery(name);
                          setSearchOpen(false);
                          onSelect({ name, latitude: place.latitude, longitude: place.longitude });
                        }}
                        role="option"
                        type="button"
                      >
                        <span className="block truncate text-xs font-semibold">{place.name}</span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {[place.admin1, place.admin2, place.country].filter(Boolean).join(" · ")}
                        </span>
                      </button>
                    ))
                  ) : search.isFetched ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      No matching locations.
                    </div>
                  ) : null}
                </div>
              )}
            </div>
            <Button
              aria-label="Use my current location"
              className="h-9 shrink-0"
              disabled={gps.pending}
              onClick={gps.locate}
              type="button"
              variant="outline"
            >
              {gps.pending ? <LoaderCircle className="animate-spin" /> : <LocateFixed />}
              <span className="hidden sm:inline">Use my location</span>
            </Button>
          </div>
          {gps.error && (
            <p role="alert" className="mt-1 text-[11px] text-sev-high">
              {gps.error}
            </p>
          )}
        </div>
      </div>
      {selected && (
        <div className="mt-3 border-t border-border pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold">{selected.name}</div>
              <div className="font-mono text-[9px] text-muted-foreground">
                {selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}
                {data?.timezone ? ` · ${data.timezone}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-2 font-mono text-[9px] text-muted-foreground">
              {forecast.isFetching
                ? "Fetching live forecast…"
                : data
                  ? `${stale ? "STALE · " : "Updated "}${new Date(data.fetchedAt).toLocaleString()}`
                  : "Waiting for forecast"}
              <Button
                aria-label="Refresh live weather"
                className="size-8"
                disabled={forecast.isFetching}
                onClick={() => setRefreshRequest({ locationKey, nonce: Date.now() })}
                size="icon"
                title="Refresh live weather"
                type="button"
                variant="ghost"
              >
                <RefreshCw />
              </Button>
            </div>
          </div>
          {forecast.isError && (
            <p role="alert" className="mt-2 text-[11px] text-sev-high">
              {requestErrorMessage(forecast.error, "weather forecast")}
            </p>
          )}
          {forecast.isLoading ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Loading current conditions and forecast…
            </p>
          ) : data ? (
            <>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
                {current.map(([label, number, unit]) => (
                  <div key={label} className="min-w-0">
                    <div className="font-mono text-[9px] uppercase text-muted-foreground">
                      {label}
                    </div>
                    <div className="truncate font-mono text-xs font-semibold tabular-nums">
                      {number === null ? "—" : `${number}${unit === "%" ? "" : ` ${unit}`}`}
                      {number !== null && unit === "%" ? "%" : ""}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 grid gap-2 border-t border-border pt-2 lg:grid-cols-2">
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <span className="w-full font-mono text-[9px] uppercase text-muted-foreground">
                    Hourly forecast
                  </span>
                  {hourlySlots.map(({ time, index }) => (
                    <span key={time} className="font-mono text-[10px] tabular-nums">
                      {new Date(time).toLocaleTimeString([], { hour: "2-digit" })}
                      {forecastValue(data, "hourly", "temperature_2m", index) !== null
                        ? ` · ${forecastValue(data, "hourly", "temperature_2m", index)}°`
                        : ""}
                      {forecastValue(data, "hourly", "precipitation_probability", index) !== null
                        ? ` · ${forecastValue(data, "hourly", "precipitation_probability", index)}% rain`
                        : ""}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <span className="w-full font-mono text-[9px] uppercase text-muted-foreground">
                    Daily forecast
                  </span>
                  {dailySlots.map(({ time, index }) => (
                    <span key={time} className="font-mono text-[10px] tabular-nums">
                      {new Date(time).toLocaleDateString([], { weekday: "short" })}
                      {forecastValue(data, "daily", "temperature_2m_min", index) !== null
                        ? ` · ${forecastValue(data, "daily", "temperature_2m_min", index)}°`
                        : ""}
                      {forecastValue(data, "daily", "temperature_2m_max", index) !== null
                        ? `/${forecastValue(data, "daily", "temperature_2m_max", index)}°`
                        : ""}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-1 font-mono text-[9px] text-muted-foreground">
                {data.provider} model grid {data.coordinates.latitude.toFixed(3)},{" "}
                {data.coordinates.longitude.toFixed(3)} · WMO {weatherCode ?? "—"} ·{" "}
                {data.attribution}
              </div>
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}
