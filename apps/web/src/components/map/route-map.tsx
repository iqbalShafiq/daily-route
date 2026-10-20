import {
  Map as MapLibreMap,
  NavigationControl,
  type GeoJSONSource,
} from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { useEffect, useRef } from "react";

import { cn } from "../../lib/cn.js";
import { JAKARTA_BOUNDS, JAKARTA_VIEW, mapStyleFor } from "../../lib/map-style.js";

/**
 * The route map.
 *
 * MapLibre is driven directly rather than through a wrapper library: the
 * map only has to do two things here — draw the route it is given and keep
 * the viewport on it — and both are a handful of imperative calls.
 */

export type MapRoute = {
  id: string;
  coordinates: { latitude: number; longitude: number }[];
  color: string;
  dashed?: boolean;
};

export type MapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
  kind: "origin" | "destination" | "stop";
};

export type RouteMapProps = {
  routes: MapRoute[];
  markers: MapMarker[];
  theme: "light" | "dark";
  className?: string;
  /** Called when a marker is clicked, so the interface can show its detail. */
  onMarkerClick?: (marker: MapMarker) => void;
};

const ROUTE_LAYER = "route-line";
const ROUTE_CASING_LAYER = "route-casing";
const ALT_ROUTE_LAYER = "route-line-alt";
const SOURCE_ID = "routes";
const MARKER_SOURCE_ID = "markers";

export function RouteMap({ routes, markers, theme, className, onMarkerClick }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onMarkerClickRef = useRef(onMarkerClick);
  useEffect(() => {
    onMarkerClickRef.current = onMarkerClick;
  }, [onMarkerClick]);

  // --- Create the map once ---------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: mapStyleFor(theme),
      center: [JAKARTA_VIEW.center.longitude, JAKARTA_VIEW.center.latitude],
      zoom: JAKARTA_VIEW.zoom,
      attributionControl: { compact: true },
      cooperativeGestures: false,
    });

    map.addControl(new NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      addRouteLayers(map);
      addMarkerLayers(map);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // The map is created once; theme and data are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Follow the theme -------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(mapStyleFor(theme));
    map.once("styledata", () => {
      addRouteLayers(map);
      addMarkerLayers(map);
      syncRoutes(map, routes);
      syncMarkers(map, markers);
    });
  }, [theme, routes, markers]);

  // --- Draw the routes --------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    syncRoutes(map, routes);
  }, [routes]);

  // --- Draw the markers -------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    syncMarkers(map, markers);
  }, [markers]);

  return (
    <div
      ref={containerRef}
      className={cn("maplibregl-host", className)}
      // MapLibre injects its own `maplibregl-map` class, whose unlayered
      // stylesheet would otherwise win over a layered utility. The position
      // therefore belongs to the element itself.
      style={{ position: "absolute", inset: 0 }}
      aria-hidden
    />
  );
}

/**
 * Resolve a CSS custom property to a colour MapLibre understands.
 *
 * MapLibre paints with concrete colours and does not resolve `var()`, so a
 * theme token has to be read from the document before it reaches a layer.
 */
function resolveColor(value: string, fallback: string): string {
  if (!value.startsWith("var(")) return value;
  const name = value.slice(4, -1).trim();
  if (typeof document === "undefined") return fallback;
  const resolved = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return resolved.length > 0 ? resolved : fallback;
}

/** The colours the map paints with, read from the theme tokens. */
function themeColors() {
  return {
    origin: resolveColor("var(--mode-bus)", "#0b6b4f"),
    destination: resolveColor("var(--mode-metro)", "#1d4ed8"),
    stop: resolveColor("var(--ink)", "#17150f"),
    casing: resolveColor("var(--surface)", "#ffffff"),
    alternative: resolveColor("var(--warn)", "#a85b00"),
  };
}

function addRouteLayers(map: MapLibreMap): void {
  if (map.getLayer(ROUTE_LAYER)) return;

  map.addSource(SOURCE_ID, { type: "geojson", data: emptyFeatureCollection() });
  map.addSource(`${SOURCE_ID}-alt`, { type: "geojson", data: emptyFeatureCollection() });

  map.addLayer({
    id: ROUTE_CASING_LAYER,
    type: "line",
    source: SOURCE_ID,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#ffffff", "line-width": 9, "line-opacity": 0.85 },
  });

  map.addLayer({
    id: ROUTE_LAYER,
    type: "line",
    source: SOURCE_ID,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#0b6b4f", "line-width": 5 },
  });

  map.addLayer({
    id: ALT_ROUTE_LAYER,
    type: "line",
    source: `${SOURCE_ID}-alt`,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#a85b00",
      "line-width": 4,
      "line-dasharray": [2, 2],
    },
  });
}

function addMarkerLayers(map: MapLibreMap): void {
  if (map.getLayer(MARKER_SOURCE_ID)) return;

  map.addSource(MARKER_SOURCE_ID, { type: "geojson", data: emptyFeatureCollection() });
  map.addLayer({
    id: MARKER_SOURCE_ID,
    type: "circle",
    source: MARKER_SOURCE_ID,
    paint: {
      "circle-radius": ["case", ["==", ["get", "kind"], "stop"], 4, 7],
      "circle-color": [
        "match",
        ["get", "kind"],
        "origin",
        "#0b6b4f",
        "destination",
        "#1d4ed8",
        "#17150f",
      ],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
    },
  });
}

function syncRoutes(map: MapLibreMap, routes: readonly MapRoute[]): void {
  const primary = routes.find((route) => !route.dashed);
  const alternative = routes.find((route) => route.dashed);

  setSourceData(map, SOURCE_ID, primary);
  setSourceData(map, `${SOURCE_ID}-alt`, alternative);

  const colors = themeColors();
  const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
  if (source && primary && primary.coordinates.length > 1) {
    map.setPaintProperty(ROUTE_LAYER, "line-color", resolveColor(primary.color, colors.origin));
    map.setPaintProperty(ROUTE_CASING_LAYER, "line-color", colors.casing);
    map.fitBounds(boundsOf(primary.coordinates), { padding: 56, maxZoom: 15, duration: 600 });
  }
  if (alternative && map.getLayer(ALT_ROUTE_LAYER)) {
    map.setPaintProperty(ALT_ROUTE_LAYER, "line-color", colors.alternative);
  }
}

function syncMarkers(map: MapLibreMap, markers: readonly MapMarker[]): void {
  const source = map.getSource(MARKER_SOURCE_ID) as GeoJSONSource | undefined;
  if (!source) return;

  const colors = themeColors();
  if (map.getLayer(MARKER_SOURCE_ID)) {
    map.setPaintProperty(MARKER_SOURCE_ID, "circle-color", [
      "match",
      ["get", "kind"],
      "origin",
      colors.origin,
      "destination",
      colors.destination,
      colors.stop,
    ]);
    map.setPaintProperty(MARKER_SOURCE_ID, "circle-stroke-color", colors.casing);
  }

  source.setData({
    type: "FeatureCollection",
    features: markers.map((marker) => ({
      type: "Feature",
      properties: { kind: marker.kind, label: marker.label },
      geometry: { type: "Point", coordinates: [marker.longitude, marker.latitude] },
    })),
  });
}

function setSourceData(map: MapLibreMap, sourceId: string, route: MapRoute | undefined): void {
  const source = map.getSource(sourceId) as GeoJSONSource | undefined;
  if (!source) return;
  if (!route || route.coordinates.length < 2) {
    source.setData(emptyFeatureCollection());
    return;
  }
  source.setData({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { id: route.id },
        geometry: {
          type: "LineString",
          coordinates: route.coordinates.map((point) => [point.longitude, point.latitude]),
        },
      },
    ],
  });
}

function emptyFeatureCollection(): FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function boundsOf(coordinates: readonly { latitude: number; longitude: number }[]) {
  let minLongitude = Infinity;
  let minLatitude = Infinity;
  let maxLongitude = -Infinity;
  let maxLatitude = -Infinity;

  for (const point of coordinates) {
    minLongitude = Math.min(minLongitude, point.longitude);
    minLatitude = Math.min(minLatitude, point.latitude);
    maxLongitude = Math.max(maxLongitude, point.longitude);
    maxLatitude = Math.max(maxLatitude, point.latitude);
  }

  return (
    [
      [minLongitude, minLatitude],
      [maxLongitude, maxLatitude],
    ] as [[number, number], [number, number]]
  );
}

export { JAKARTA_BOUNDS };
