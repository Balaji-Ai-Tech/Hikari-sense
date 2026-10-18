import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Layers } from "lucide-react";
import * as maplibregl from "maplibre-gl";
import { setWorkerUrl } from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import type {
  CitizenReport,
  LiveWeatherLocation,
  OfficialAlertRecord,
  SatelliteObservation,
  WeatherEvent,
  WeatherObservation,
} from "@/types";
import type { ReportEvidence } from "@/services/api";
import { EVENT_TYPE_LABEL } from "@/data/mockEvents";
import {
  cycloneTrack,
  floodZones,
  heatZones,
  officialStations,
  rainfallCells,
  windVectors,
} from "@/data/mockOverlays";
import { minutesAgo, pct } from "@/utils/format";
import { VERIFICATION_LABEL, LoadingState } from "@/components/hs/primitives";
import { cn } from "@/lib/utils";
import { MapUnavailable } from "./MapUnavailable";
import { DEFAULT_LAYERS, MAP_COLORS, MAP_LAYERS, type MapLayerId } from "./layers";

setWorkerUrl(maplibreWorkerUrl);
const EMPTY_EVIDENCE: ReportEvidence[] = [];

const TYPE_GLYPH: Record<string, string> = {
  heavy_rainfall: "R",
  flood: "F",
  thunderstorm: "T",
  heatwave: "H",
  cyclone: "C",
  strong_wind: "W",
  fog: "G",
  dust_storm: "D",
};
const MAP_TILE_URL =
  (import.meta.env as Record<string, string | undefined>)["VITE_MAP_TILE_URL"] ??
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

function buildPinElement(color: string, label: string, selected: boolean) {
  const el = document.createElement("div");
  const size = selected ? 20 : 16;
  el.style.width = `${size * 2}px`;
  el.style.height = `${size * 2}px`;
  el.style.borderRadius = "50%";
  el.style.background = "rgba(11, 22, 38, 0.9)";
  el.style.border = `2px solid ${color}`;
  el.style.boxShadow = `0 0 0 3px ${color}33`;
  el.style.display = "grid";
  el.style.placeItems = "center";
  el.style.color = color;
  el.style.fontSize = "11px";
  el.style.fontWeight = "700";
  el.style.fontFamily = "JetBrains Mono, monospace";
  el.style.cursor = "pointer";
  el.textContent = label;
  return el;
}

function popup(e: WeatherEvent, onView: () => void) {
  const el = document.createElement("div");
  el.className = "hs-iw";
  const location = e.state ? `${e.location}, ${e.state}` : e.location || "Unknown";
  const rows: [string, string][] = [
    ["Location", location],
    ["Severity", e.severity.toUpperCase()],
    ["Confidence", pct(e.confidence)],
    ["Verification", VERIFICATION_LABEL[e.verification]],
    ["Reports", String(e.reports)],
    ["Sources", e.sourceKinds.length ? e.sourceKinds.join(", ") : String(e.sources)],
    ["Time", minutesAgo(e.reportedAt)],
  ];
  el.innerHTML = `<div class="hs-iw-id">${e.id}</div><div class="hs-iw-title">${EVENT_TYPE_LABEL[e.type]}</div>
    <dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>`;
  const btn = document.createElement("button");
  btn.textContent = "View Event →";
  btn.onclick = onView;
  el.appendChild(btn);
  return el;
}

function evidencePopup(item: ReportEvidence) {
  const element = document.createElement("div");
  element.className = "hs-iw";
  const heading = document.createElement("div");
  heading.className = "hs-iw-title";
  heading.textContent = item.source;
  const status = document.createElement("p");
  status.textContent = item.status.replaceAll("_", " ");
  const summary = document.createElement("p");
  summary.textContent = item.summary || "No source description recorded.";
  const timing = document.createElement("p");
  timing.textContent = `${item.distanceKm} km · ${item.minutesApart} min · ${new Date(item.observedAt).toLocaleString()}`;
  const relationship = document.createElement("p");
  relationship.textContent = item.note;
  element.append(heading, status, summary, timing, relationship);
  return element;
}

function weatherPopup(item: WeatherObservation) {
  const element = document.createElement("div");
  element.className = "hs-iw";
  const heading = document.createElement("div");
  heading.className = "hs-iw-title";
  heading.textContent = `${item.provider} ${item.recordType}`;
  const source = document.createElement("p");
  source.textContent = `Source record: ${item.sourceRecordId}`;
  const location = document.createElement("p");
  location.textContent =
    item.location || `${item.latitude.toFixed(3)}, ${item.longitude.toFixed(3)}`;
  const conditions = document.createElement("p");
  conditions.textContent = [
    item.temperatureC !== null ? `${item.temperatureC} °C` : null,
    item.humidityPct !== null ? `${item.humidityPct}% RH` : null,
    item.precipitationMm !== null ? `${item.precipitationMm} mm rain` : null,
    item.windSpeedMs !== null ? `${item.windSpeedMs} m/s wind` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const observed = document.createElement("p");
  observed.textContent = `${new Date(item.observedAt).toLocaleString()} · ${item.attribution}`;
  element.append(heading, source, location, conditions, observed);
  return element;
}

function officialAlertPopup(item: OfficialAlertRecord) {
  const element = document.createElement("div");
  element.className = "hs-iw";
  const heading = document.createElement("div");
  heading.className = "hs-iw-title";
  heading.textContent = item.headline || item.event || "Official alert";
  const source = document.createElement("p");
  source.textContent = `${item.issuer} · CAP ${item.sourceRecordId}`;
  const severity = document.createElement("p");
  severity.textContent = `${item.urgency} · ${item.severity} · ${item.certainty}`;
  const expiry = document.createElement("p");
  expiry.textContent = `Issued ${new Date(item.issuedAt).toLocaleString()} · Expires ${item.expiresAt ? new Date(item.expiresAt).toLocaleString() : "not specified"}`;
  const area = document.createElement("p");
  area.textContent = item.areas.join("; ") || item.location || "Area not specified";
  element.append(heading, source, severity, expiry, area);
  return element;
}

function satellitePopup(item: SatelliteObservation) {
  const element = document.createElement("div");
  element.className = "hs-iw";
  const heading = document.createElement("div");
  heading.className = "hs-iw-title";
  heading.textContent = "NASA FIRMS satellite observation";
  const source = document.createElement("p");
  source.textContent = `${item.sourceAccount} · ${item.sourceRecordId}`;
  const timing = document.createElement("p");
  timing.textContent = new Date(item.observedAt).toLocaleString();
  const summary = document.createElement("p");
  summary.textContent = `${item.summary} Observation only; not a verified incident.`;
  element.append(heading, source, timing, summary);
  return element;
}

function evidenceColor(sourceCode: string, sourceType: string) {
  const normalized = sourceCode.toUpperCase();
  if (normalized.includes("FIRMS")) return MAP_COLORS.critical;
  if (normalized.includes("SACHET")) return MAP_COLORS.high;
  if (sourceType === "citizen") return MAP_COLORS.citizen;
  return MAP_COLORS.info;
}

export function MapLibreEventMap({
  events,
  weatherObservations = [],
  officialAlerts = [],
  satelliteObservations = [],
  reports = [],
  evidence = EMPTY_EVIDENCE,
  evidenceVisible = false,
  overlayLabel = "DEMO DATA",
  selectedId,
  selectedWeatherLocation = null,
  onLocationSelect,
  onSelect,
  onViewEvent,
  className,
  showLayerControl = true,
}: {
  events: WeatherEvent[];
  weatherObservations?: WeatherObservation[];
  officialAlerts?: OfficialAlertRecord[];
  satelliteObservations?: SatelliteObservation[];
  reports?: CitizenReport[];
  evidence?: ReportEvidence[];
  evidenceVisible?: boolean;
  overlayLabel?: string;
  selectedId?: string | undefined;
  selectedWeatherLocation?: LiveWeatherLocation | null;
  onLocationSelect?: (location: LiveWeatherLocation) => void;
  onSelect?: (e: WeatherEvent) => void;
  onViewEvent?: (e: WeatherEvent) => void;
  className?: string;
  showLayerControl?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker[]>([]);
  const selectedLocationMarkerRef = useRef<maplibregl.Marker | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [layers, setLayers] = useState(() => ({ ...DEFAULT_LAYERS, evidence: evidenceVisible }));
  const [panelOpen, setPanelOpen] = useState(false);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const viewRef = useRef(onViewEvent);
  viewRef.current = onViewEvent;
  const locationSelectRef = useRef(onLocationSelect);
  locationSelectRef.current = onLocationSelect;

  useEffect(() => {
    if (!ref.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: [MAP_TILE_URL],
            tileSize: 256,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
          },
        },
        layers: [{ id: "osm-raster", type: "raster", source: "osm" }],
      },
      center: [80.5, 22.6],
      zoom: 4.4,
      minZoom: 2,
      attributionControl: false,
      pitchWithRotate: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 80, unit: "metric" }), "bottom-left");
    map.addControl(new maplibregl.AttributionControl({ compact: false }), "bottom-right");
    mapRef.current = map;
    map.on("load", () => setReady(true));
    map.on("error", (event) => {
      setError(event.error.message);
      setReady(false);
    });
    popupRef.current = new maplibregl.Popup({ closeButton: false, offset: 10 });
    return () => map.remove();
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !locationSelectRef.current) return;
    const handleMapClick = (event: maplibregl.MapMouseEvent) => {
      const interactiveLayers = [
        "hs-events-source-circle",
        "hs-weather-observations-circle",
        "hs-official-cap-alerts-circle",
        "hs-satellite-observations-circle",
        "hs-review-evidence-points-circle",
      ].filter((layerId) => map.getLayer(layerId));
      if (
        interactiveLayers.length &&
        map.queryRenderedFeatures(event.point, { layers: interactiveLayers }).length
      ) {
        return;
      }
      locationSelectRef.current?.({
        name: "Map selection",
        latitude: event.lngLat.lat,
        longitude: event.lngLat.lng,
      });
    };
    map.on("click", handleMapClick);
    return () => {
      map.off("click", handleMapClick);
    };
  }, [ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const eventFeatures: {
      type: "FeatureCollection";
      features: Array<{
        type: "Feature";
        properties: {
          id: string;
          title: string;
          severity: WeatherEvent["severity"];
          color: string;
          selected: boolean;
        };
        geometry: {
          type: "Point";
          coordinates: [number, number];
        };
      }>;
    } = {
      type: "FeatureCollection",
      features: events
        .filter((e) => e.lat !== null && e.lng !== null)
        .map((e) => ({
          type: "Feature",
          properties: {
            id: e.id,
            title: e.title,
            severity: e.severity,
            color: MAP_COLORS[e.severity],
            selected: e.id === selectedId,
          },
          geometry: {
            type: "Point",
            coordinates: [e.lng!, e.lat!],
          },
        })),
    };
    const sourceId = "hs-events-source";
    const polygonSourceId = "hs-event-polygons-source";
    const polygonFeatures = {
      type: "FeatureCollection" as const,
      features: events
        .filter((event) => event.geometry)
        .map((event) => ({
          type: "Feature" as const,
          properties: { id: event.id },
          geometry: event.geometry!,
        })),
    };
    if (map.getSource(polygonSourceId)) {
      (map.getSource(polygonSourceId) as maplibregl.GeoJSONSource).setData(polygonFeatures);
    } else {
      map.addSource(polygonSourceId, { type: "geojson", data: polygonFeatures });
      map.addLayer({
        id: `${polygonSourceId}-fill`,
        type: "fill",
        source: polygonSourceId,
        paint: { "fill-color": "#19a77a", "fill-opacity": 0.2 },
      });
      map.addLayer({
        id: `${polygonSourceId}-line`,
        type: "line",
        source: polygonSourceId,
        paint: { "line-color": "#087f5b", "line-width": 2 },
      });
    }
    if (map.getLayer(`${polygonSourceId}-fill`)) {
      map.setLayoutProperty(
        `${polygonSourceId}-fill`,
        "visibility",
        layers.events ? "visible" : "none",
      );
      map.setLayoutProperty(
        `${polygonSourceId}-line`,
        "visibility",
        layers.events ? "visible" : "none",
      );
    }
    if (map.getSource(sourceId)) {
      (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(eventFeatures);
    } else {
      map.addSource(sourceId, { type: "geojson", data: eventFeatures });
      map.addLayer({
        id: `${sourceId}-circle`,
        type: "circle",
        source: sourceId,
        paint: {
          "circle-radius": ["case", ["==", ["get", "selected"], true], 12, 9],
          "circle-color": ["get", "color"],
          "circle-stroke-color": "#e2e8f0",
          "circle-stroke-width": 1.5,
          "circle-opacity": 0.9,
        },
      });
    }
    if (map.getLayer(`${sourceId}-circle`)) {
      map.setLayoutProperty(`${sourceId}-circle`, "visibility", layers.events ? "visible" : "none");
    }
    const handleEventClick = (event: maplibregl.MapLayerMouseEvent) => {
      const f = event.features?.[0];
      if (!f || !f.properties) return;
      const match = events.find((item) => item.id === String(f.properties["id"]));
      if (!match) return;
      selectRef.current?.(match);
      const popupEl = popup(match, () => {
        if (viewRef.current) viewRef.current(match);
        else navigate({ to: "/events/$eventId", params: { eventId: match.id } });
      });
      popupRef.current?.setLngLat([match.lng!, match.lat!]).setDOMContent(popupEl).addTo(map);
    };
    map.on("click", `${polygonSourceId}-fill`, handleEventClick);
    map.on("click", `${sourceId}-circle`, handleEventClick);
    map.getCanvas().style.cursor = "pointer";
    return () => {
      map.off("click", `${polygonSourceId}-fill`, handleEventClick);
      map.off("click", `${sourceId}-circle`, handleEventClick);
    };
  }, [events, layers.events, navigate, ready, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const sourceId = "hs-weather-observations";
    const layerId = "hs-weather-observations-circle";
    const latestByGrid = new Map<string, WeatherObservation>();
    for (const item of weatherObservations) {
      if (item.recordType !== "current") continue;
      const key = `${item.latitude.toFixed(4)}:${item.longitude.toFixed(4)}`;
      const existing = latestByGrid.get(key);
      if (!existing || existing.observedAt < item.observedAt) latestByGrid.set(key, item);
    }
    const data = {
      type: "FeatureCollection" as const,
      features: [...latestByGrid.values()].map((item) => ({
        type: "Feature" as const,
        properties: { id: item.id },
        geometry: {
          type: "Point" as const,
          coordinates: [item.longitude, item.latitude] as [number, number],
        },
      })),
    };
    const existing = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    if (existing) existing.setData(data);
    else {
      map.addSource(sourceId, { type: "geojson", data });
      map.addLayer({
        id: layerId,
        type: "circle",
        source: sourceId,
        paint: {
          "circle-radius": 9,
          "circle-color": "#06b6d4",
          "circle-stroke-color": "#ecfeff",
          "circle-stroke-width": 2,
          "circle-opacity": 0.95,
        },
      });
    }
    map.setLayoutProperty(layerId, "visibility", layers.weather ? "visible" : "none");
    const handleWeatherClick = (event: maplibregl.MapLayerMouseEvent) => {
      const id = String(event.features?.[0]?.properties?.["id"] ?? "");
      const item = weatherObservations.find((candidate) => candidate.id === id);
      if (!item) return;
      popupRef.current
        ?.setLngLat([item.longitude, item.latitude])
        .setDOMContent(weatherPopup(item))
        .addTo(map);
    };
    map.on("click", layerId, handleWeatherClick);
    return () => {
      map.off("click", layerId, handleWeatherClick);
    };
  }, [layers.weather, ready, weatherObservations]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const sourceId = "hs-official-cap-alerts";
    const layerId = "hs-official-cap-alerts-circle";
    const locatedAlerts = officialAlerts.filter(
      (item) => item.latitude !== null && item.longitude !== null,
    );
    const data = {
      type: "FeatureCollection" as const,
      features: locatedAlerts.map((item) => ({
        type: "Feature" as const,
        properties: { id: item.id },
        geometry: {
          type: "Point" as const,
          coordinates: [item.longitude!, item.latitude!] as [number, number],
        },
      })),
    };
    const existing = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    if (existing) existing.setData(data);
    else {
      map.addSource(sourceId, { type: "geojson", data });
      map.addLayer({
        id: layerId,
        type: "circle",
        source: sourceId,
        paint: {
          "circle-radius": 10,
          "circle-color": "#ef4444",
          "circle-stroke-color": "#fff1f2",
          "circle-stroke-width": 2,
          "circle-opacity": 0.9,
        },
      });
    }
    map.setLayoutProperty(layerId, "visibility", layers.officialAlerts ? "visible" : "none");
    const handleAlertClick = (event: maplibregl.MapLayerMouseEvent) => {
      const id = String(event.features?.[0]?.properties?.["id"] ?? "");
      const item = officialAlerts.find((candidate) => candidate.id === id);
      if (!item || item.latitude === null || item.longitude === null) return;
      popupRef.current
        ?.setLngLat([item.longitude, item.latitude])
        .setDOMContent(officialAlertPopup(item))
        .addTo(map);
    };
    map.on("click", layerId, handleAlertClick);
    return () => {
      map.off("click", layerId, handleAlertClick);
    };
  }, [layers.officialAlerts, officialAlerts, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const sourceId = "hs-satellite-observations";
    const layerId = "hs-satellite-observations-circle";
    const data = {
      type: "FeatureCollection" as const,
      features: satelliteObservations.map((item) => ({
        type: "Feature" as const,
        properties: { id: item.id },
        geometry: {
          type: "Point" as const,
          coordinates: [item.longitude, item.latitude] as [number, number],
        },
      })),
    };
    const existing = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    if (existing) existing.setData(data);
    else {
      map.addSource(sourceId, { type: "geojson", data });
      map.addLayer({
        id: layerId,
        type: "circle",
        source: sourceId,
        paint: {
          "circle-radius": 7,
          "circle-color": "#fb923c",
          "circle-stroke-color": "#fff7ed",
          "circle-stroke-width": 2,
          "circle-opacity": 0.95,
        },
      });
    }
    map.setLayoutProperty(layerId, "visibility", layers.satellite ? "visible" : "none");
    const handleSatelliteClick = (event: maplibregl.MapLayerMouseEvent) => {
      const id = String(event.features?.[0]?.properties?.["id"] ?? "");
      const item = satelliteObservations.find((candidate) => candidate.id === id);
      if (!item) return;
      popupRef.current
        ?.setLngLat([item.longitude, item.latitude])
        .setDOMContent(satellitePopup(item))
        .addTo(map);
    };
    map.on("click", layerId, handleSatelliteClick);
    return () => {
      map.off("click", layerId, handleSatelliteClick);
    };
  }, [layers.satellite, ready, satelliteObservations]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    const pointData = {
      type: "FeatureCollection" as const,
      features: evidence
        .filter((item) => item.lat !== null && item.lng !== null)
        .map((item) => ({
          type: "Feature" as const,
          properties: { id: item.id, color: evidenceColor(item.sourceCode, item.sourceType) },
          geometry: {
            type: "Point" as const,
            coordinates: [item.lng!, item.lat!] as [number, number],
          },
        })),
    };
    const polygonData = {
      type: "FeatureCollection" as const,
      features: evidence
        .filter((item) => item.geometry !== null && item.geometry !== undefined)
        .map((item) => ({
          type: "Feature" as const,
          properties: { id: item.id, color: evidenceColor(item.sourceCode, item.sourceType) },
          geometry: item.geometry!,
        })),
    };
    const pointSourceId = "hs-review-evidence-points";
    const polygonSourceId = "hs-review-evidence-polygons";
    const pointLayerId = "hs-review-evidence-points-circle";
    const polygonFillId = "hs-review-evidence-polygons-fill";
    const polygonLineId = "hs-review-evidence-polygons-line";

    const pointSource = map.getSource(pointSourceId) as maplibregl.GeoJSONSource | undefined;
    if (pointSource) pointSource.setData(pointData);
    else map.addSource(pointSourceId, { type: "geojson", data: pointData });
    const polygonSource = map.getSource(polygonSourceId) as maplibregl.GeoJSONSource | undefined;
    if (polygonSource) polygonSource.setData(polygonData);
    else map.addSource(polygonSourceId, { type: "geojson", data: polygonData });

    if (!map.getLayer(pointLayerId)) {
      map.addLayer({
        id: pointLayerId,
        type: "circle",
        source: pointSourceId,
        paint: {
          "circle-radius": 8,
          "circle-color": ["get", "color"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
    }
    if (!map.getLayer(polygonFillId)) {
      map.addLayer({
        id: polygonFillId,
        type: "fill",
        source: polygonSourceId,
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.18 },
      });
      map.addLayer({
        id: polygonLineId,
        type: "line",
        source: polygonSourceId,
        paint: { "line-color": ["get", "color"], "line-width": 2 },
      });
    }
    for (const layerId of [pointLayerId, polygonFillId, polygonLineId]) {
      map.setLayoutProperty(layerId, "visibility", layers.evidence ? "visible" : "none");
    }

    const handleEvidenceClick = (event: maplibregl.MapLayerMouseEvent) => {
      const id = String(event.features?.[0]?.properties?.["id"] ?? "");
      const item = evidence.find((candidate) => candidate.id === id);
      if (!item) return;
      const coordinates =
        item.lng !== null && item.lat !== null
          ? ([item.lng, item.lat] as [number, number])
          : ([event.lngLat.lng, event.lngLat.lat] as [number, number]);
      popupRef.current?.setLngLat(coordinates).setDOMContent(evidencePopup(item)).addTo(map);
    };
    map.on("click", pointLayerId, handleEvidenceClick);
    map.on("click", polygonFillId, handleEvidenceClick);
    return () => {
      map.off("click", pointLayerId, handleEvidenceClick);
      map.off("click", polygonFillId, handleEvidenceClick);
    };
  }, [evidence, layers.evidence, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const markers = events.filter((e) => e.lat !== null && e.lng !== null);
    markerRef.current.forEach((marker) => marker.remove());
    markerRef.current = markers.map((e) => {
      const color = MAP_COLORS[e.severity];
      const marker = new maplibregl.Marker({
        element: buildPinElement(color, TYPE_GLYPH[e.type] ?? "E", e.id === selectedId),
        anchor: "center",
      }).setLngLat([e.lng!, e.lat!]);
      marker.getElement().addEventListener("click", () => {
        selectRef.current?.(e);
        const popupEl = popup(e, () => {
          if (viewRef.current) viewRef.current(e);
          else navigate({ to: "/events/$eventId", params: { eventId: e.id } });
        });
        popupRef.current?.setLngLat([e.lng!, e.lat!]).setDOMContent(popupEl).addTo(map);
      });
      marker.addTo(map);
      return marker;
    });
  }, [events, navigate, ready, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    selectedLocationMarkerRef.current?.remove();
    selectedLocationMarkerRef.current = null;
    if (!selectedWeatherLocation) return;
    const marker = new maplibregl.Marker({ color: "#facc15" })
      .setLngLat([selectedWeatherLocation.longitude, selectedWeatherLocation.latitude])
      .setPopup(
        new maplibregl.Popup({ closeButton: false, offset: 20 }).setText(
          `${selectedWeatherLocation.name} · ${selectedWeatherLocation.latitude.toFixed(4)}, ${selectedWeatherLocation.longitude.toFixed(4)}`,
        ),
      )
      .addTo(map);
    selectedLocationMarkerRef.current = marker;
    map.flyTo({
      center: [selectedWeatherLocation.longitude, selectedWeatherLocation.latitude],
      zoom: Math.max(map.getZoom(), 6),
    });
  }, [ready, selectedWeatherLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const e = events.find((x) => x.id === selectedId);
    if (e && e.lat !== null && e.lng !== null) {
      map.flyTo({ center: [e.lng, e.lat], zoom: Math.max(map.getZoom(), 6) });
    }
  }, [events, ready, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const ids = [
      "rainfall-layer",
      "flood-layer",
      "heat-layer",
      "wind-layer",
      "cyclone-layer",
      "official-layer",
      "citizen-layer",
    ];
    ids.forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
    });
    if (layers.rainfall) {
      const rainfall = {
        type: "FeatureCollection",
        features: rainfallCells.map((c) => ({
          type: "Feature",
          properties: {
            radius: c.radiusKm * 1000,
            color: MAP_COLORS.rain,
            opacity: Math.min(0.32, c.mm / 400),
          },
          geometry: { type: "Point", coordinates: [c.lng, c.lat] },
        })),
      };
      if (map.getSource("rainfall-source"))
        (map.getSource("rainfall-source") as maplibregl.GeoJSONSource).setData(rainfall);
      else {
        map.addSource("rainfall-source", { type: "geojson", data: rainfall });
        map.addLayer({
          id: "rainfall-layer",
          type: "circle",
          source: "rainfall-source",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 4, 6, 12],
            "circle-color": ["get", "color"],
            "circle-opacity": ["get", "opacity"],
          },
        });
      }
      map.setLayoutProperty("rainfall-layer", "visibility", "visible");
    }
    if (layers.flood) {
      const flood = {
        type: "FeatureCollection",
        features: floodZones.map((c) => ({
          type: "Feature",
          properties: { radius: c.radiusKm * 1000, color: MAP_COLORS.flood },
          geometry: { type: "Point", coordinates: [c.lng, c.lat] },
        })),
      };
      if (map.getSource("flood-source"))
        (map.getSource("flood-source") as maplibregl.GeoJSONSource).setData(flood);
      else {
        map.addSource("flood-source", { type: "geojson", data: flood });
        map.addLayer({
          id: "flood-layer",
          type: "circle",
          source: "flood-source",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 6, 6, 20],
            "circle-color": ["get", "color"],
            "circle-opacity": 0.25,
          },
        });
      }
      map.setLayoutProperty("flood-layer", "visibility", "visible");
    }
    if (layers.heat) {
      const heat = {
        type: "FeatureCollection",
        features: heatZones.map((c) => ({
          type: "Feature",
          properties: { radius: c.radiusKm * 1000, color: MAP_COLORS.heat },
          geometry: { type: "Point", coordinates: [c.lng, c.lat] },
        })),
      };
      if (map.getSource("heat-source"))
        (map.getSource("heat-source") as maplibregl.GeoJSONSource).setData(heat);
      else {
        map.addSource("heat-source", { type: "geojson", data: heat });
        map.addLayer({
          id: "heat-layer",
          type: "circle",
          source: "heat-source",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 4, 6, 18],
            "circle-color": ["get", "color"],
            "circle-opacity": 0.12,
          },
        });
      }
      map.setLayoutProperty("heat-layer", "visibility", "visible");
    }
    if (layers.wind) {
      const wind = {
        type: "FeatureCollection",
        features: windVectors.map((w) => ({
          type: "Feature",
          properties: { heading: w.heading, kmh: w.kmh },
          geometry: {
            type: "LineString",
            coordinates: [
              [w.lng, w.lat],
              [
                w.lng + Math.sin((w.heading * Math.PI) / 180) * 0.12,
                w.lat + Math.cos((w.heading * Math.PI) / 180) * 0.12,
              ],
            ],
          },
        })),
      };
      if (map.getSource("wind-source"))
        (map.getSource("wind-source") as maplibregl.GeoJSONSource).setData(wind);
      else {
        map.addSource("wind-source", { type: "geojson", data: wind });
        map.addLayer({
          id: "wind-layer",
          type: "line",
          source: "wind-source",
          paint: { "line-color": MAP_COLORS.wind, "line-width": 1.5, "line-opacity": 0.7 },
        });
      }
      map.setLayoutProperty("wind-layer", "visibility", "visible");
    }
    if (layers.cyclone) {
      const cyclone = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: cycloneTrack.map((p) => [p.lng, p.lat]) },
          },
        ],
      };
      if (map.getSource("cyclone-source"))
        (map.getSource("cyclone-source") as maplibregl.GeoJSONSource).setData(cyclone);
      else {
        map.addSource("cyclone-source", { type: "geojson", data: cyclone });
        map.addLayer({
          id: "cyclone-layer",
          type: "line",
          source: "cyclone-source",
          paint: { "line-color": MAP_COLORS.critical, "line-width": 2, "line-dasharray": [2, 1] },
        });
      }
      map.setLayoutProperty("cyclone-layer", "visibility", "visible");
    }
    if (layers.official) {
      const official = {
        type: "FeatureCollection",
        features: officialStations.map((s) => ({
          type: "Feature",
          properties: { label: "O" },
          geometry: { type: "Point", coordinates: [s.lng, s.lat] },
        })),
      };
      if (map.getSource("official-source"))
        (map.getSource("official-source") as maplibregl.GeoJSONSource).setData(official);
      else {
        map.addSource("official-source", { type: "geojson", data: official });
        map.addLayer({
          id: "official-layer",
          type: "circle",
          source: "official-source",
          paint: { "circle-radius": 5, "circle-color": MAP_COLORS.info, "circle-opacity": 0.8 },
        });
      }
      map.setLayoutProperty("official-layer", "visibility", "visible");
    }
    if (layers.citizen && reports.length) {
      const citizen = {
        type: "FeatureCollection",
        features: reports
          .filter((r) => r.lat !== null && r.lng !== null)
          .map((r) => ({
            type: "Feature",
            properties: { label: "C" },
            geometry: { type: "Point", coordinates: [r.lng!, r.lat!] },
          })),
      };
      if (map.getSource("citizen-source"))
        (map.getSource("citizen-source") as maplibregl.GeoJSONSource).setData(citizen);
      else {
        map.addSource("citizen-source", { type: "geojson", data: citizen });
        map.addLayer({
          id: "citizen-layer",
          type: "circle",
          source: "citizen-source",
          paint: { "circle-radius": 4, "circle-color": MAP_COLORS.citizen, "circle-opacity": 0.8 },
        });
      }
      map.setLayoutProperty("citizen-layer", "visibility", "visible");
    }
    if (map.getLayer("hs-events-source-circle")) map.moveLayer("hs-events-source-circle");
  }, [layers, ready, reports]);

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div ref={ref} className="h-full w-full" />
      {!ready && !error && (
        <div className="absolute inset-0 grid place-items-center bg-panel">
          <LoadingState label="Loading map…" />
        </div>
      )}
      {error && <MapUnavailable message={error} onRetry={() => window.location.reload()} />}
      <span className="pointer-events-none absolute left-2 top-2 rounded-sm border border-sev-medium/40 bg-background/85 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-widest text-sev-medium">
        Basemap: MapLibre · Overlays: {overlayLabel}
      </span>
      {showLayerControl && ready && (
        <div className="absolute bottom-6 left-2 w-48 rounded-sm border border-border bg-background/92 text-[11px] backdrop-blur">
          <button
            onClick={() => setPanelOpen((o) => !o)}
            className="flex w-full items-center gap-2 px-2 py-1.5 font-display text-[12px] font-semibold uppercase tracking-wider hover:bg-accent"
          >
            <Layers className="h-3.5 w-3.5 text-primary" />
            Layers
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
              {Object.values(layers).filter(Boolean).length}/{MAP_LAYERS.length}
            </span>
          </button>
          {panelOpen && (
            <div className="border-t border-border p-1">
              {MAP_LAYERS.map((l) => (
                <label
                  key={l.id}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 hover:bg-accent"
                >
                  <input
                    type="checkbox"
                    checked={layers[l.id]}
                    onChange={() => setLayers((s) => ({ ...s, [l.id]: !s[l.id as MapLayerId] }))}
                    className="accent-primary"
                  />
                  <span className={cn("h-2 w-2 rounded-full", l.swatch)} />
                  {l.label}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
