import {
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  type DataDrivenPropertyValueSpecification,
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
 * map draws the journey it is given, marks every stop along it, and lets
 * the rider look closer at any of them.
 *
 * The route is drawn one segment at a time, and every segment carries its
 * own colour, so a journey that changes mode is readable on the map
 * without reading a legend.
 */

export type MapLeg = {
  id: string;
  coordinates: { latitude: number; longitude: number }[];
  /** A CSS colour, usually a theme token. */
  color: string;
  /** The width of the line, in pixels. The width carries the mode too. */
  width?: number;
  /** Whether the reader is pointing at this leg of the journey. */
  highlighted?: boolean;
  /** What the segment is: a ride, or the walk between two vehicles. */
  kind: "ride" | "walk";
  /** The name of the vehicle, for the popover. */
  label: string;
  /** The order of the segment in the journey. */
  order: number;
  /** The alternative route is drawn apart from the one being followed. */
  dashed?: boolean;
};

export type MapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
  /** A second line: the operator, or what happens at this point. */
  detail?: string | undefined;
  kind: "origin" | "destination" | "stop" | "transfer";
  /** The order of the point in the journey. */
  order?: number | undefined;
};

export type RouteMapProps = {
  legs: MapLeg[];
  markers: MapMarker[];
  theme: "light" | "dark";
  className?: string;
  /** Called when a marker is clicked, so the interface can show its detail. */
  onMarkerClick?: (marker: MapMarker) => undefined | void;
};

const ROUTE_LAYER = "route-line";
const ROUTE_CASING_LAYER = "route-casing";
const ROUTE_HALO_LAYER = "route-halo";
const ALT_ROUTE_LAYER = "route-line-alt";
const WALK_LAYER = "route-line-walk";
const SOURCE_ID = "routes";
const MARKER_SOURCE_ID = "markers";
const MARKER_HIT_LAYER = "marker-hit";

export function RouteMap({ legs, markers, theme, className, onMarkerClick }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onMarkerClickRef = useRef(onMarkerClick);
  useEffect(() => {
    onMarkerClickRef.current = onMarkerClick;
  }, [onMarkerClick]);

  // The latest data and theme, so a style reload can repaint them without
  // the effect that triggered the reload having to know about them.
  const legsRef = useRef(legs);
  const markersRef = useRef(markers);
  const themeRef = useRef(theme);

  // --- Create the map once ---------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: mapStyleFor(themeRef.current),
      center: [JAKARTA_VIEW.center.longitude, JAKARTA_VIEW.center.latitude],
      zoom: JAKARTA_VIEW.zoom,
      attributionControl: { compact: true },
      cooperativeGestures: false,
    });

    map.addControl(new NavigationControl({ showCompass: false }), "top-right");

    // The popover of a point. It lives with the map, because the handlers
    // that show it belong to the map too.
    let popup: Popup | null = null;

    // The style is the only thing that is reloaded, and every reload wipes
    // the layers this component owns. One handler puts them back and
    // repaints whatever the latest data is.
    const onStyleReady = (): void => {
      addRouteLayers(map);
      addMarkerLayers(map);
      syncLegs(map, legsRef.current);
      syncMarkers(map, markersRef.current);
    };

    map.on("load", onStyleReady);
    map.on("styledata", onStyleReady);
    // The map settles once the tiles are in; the data that arrived in the
    // meantime is applied then.
    map.on("idle", onStyleReady);

    // --- The points on the map ------------------------------------------
    // Hovering a stop tells the rider what it is; clicking it brings the
    // map closer, so a long street of stops can be read one by one.
    map.on("mouseenter", MARKER_HIT_LAYER, (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      map.getCanvas().style.cursor = "pointer";
      showPopup(map, () => popup, (created) => {
        popup = created;
      }, feature, markersRef.current);
    });

    map.on("mouseleave", MARKER_HIT_LAYER, () => {
      map.getCanvas().style.cursor = "";
      popup?.remove();
      popup = null;
    });

    /*
     * The line under the pointer.
     *
     * The line grows a little and the cursor says it can be pointed at,
     * so the reader knows the map is not a picture but a thing to be
     * read.
     */
    let hoveredLine: number | string | null = null;
    map.on("mousemove", ROUTE_LAYER, (event) => {
      const feature = event.features?.[0];
      const id = feature?.id;
      if (id === undefined || id === hoveredLine) return;
      if (hoveredLine !== null) {
        map.setFeatureState({ source: SOURCE_ID, id: hoveredLine }, { hover: false });
      }
      hoveredLine = id;
      map.setFeatureState({ source: SOURCE_ID, id }, { hover: true });
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", ROUTE_LAYER, () => {
      if (hoveredLine !== null) {
        map.setFeatureState({ source: SOURCE_ID, id: hoveredLine }, { hover: false });
        hoveredLine = null;
      }
      map.getCanvas().style.cursor = "";
    });

    map.on("click", MARKER_HIT_LAYER, (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const id = feature.properties?.["id"];
      const marker = markersRef.current.find((candidate) => candidate.id === id);
      if (!marker) return;

      onMarkerClickRef.current?.(marker);

      // The map moves to the point. A straight, short move: the rider
      // keeps their sense of where they are, and the movement is skipped
      // when the reader asked for less motion.
      map.easeTo({
        center: [marker.longitude, marker.latitude],
        zoom: Math.max(map.getZoom(), 15),
        duration: 400,
        padding: { top: 80, bottom: 80, left: 40, right: 40 },
        essential: false,
      });
    });

    mapRef.current = map;
    if (import.meta.env.DEV) {
      (window as unknown as { __dailyRouteMap?: MapLibreMap }).__dailyRouteMap = map;
    }

    return () => {
      popup?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  /*
   * The reader points at one leg of the journey in the list; the map
   * keeps that leg bright and lets the rest fade, so the two are one
   * system rather than two pictures of the same journey.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer(ROUTE_LAYER)) return;
    const highlighted = legs.find((leg) => leg.highlighted);
    const opacity: DataDrivenPropertyValueSpecification<number> = highlighted
      ? ["case", ["==", ["get", "id"], highlighted.id], 1, 0.28]
      : 1;
    map.setPaintProperty(ROUTE_LAYER, "line-opacity", opacity);
    map.setPaintProperty(ROUTE_CASING_LAYER, "line-opacity", opacity);
    map.setPaintProperty(ROUTE_HALO_LAYER, "line-opacity", opacity);
  }, [legs]);

  // --- Follow the theme -------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (themeRef.current === theme) return;

    themeRef.current = theme;
    map.setStyle(mapStyleFor(theme));
  }, [theme]);

  // --- Draw the route ---------------------------------------------------
  useEffect(() => {
    legsRef.current = legs;
    const map = mapRef.current;
    if (!map) return;
    syncLegs(map, legs);
  }, [legs]);

  // --- Draw the markers -------------------------------------------------
  useEffect(() => {
    markersRef.current = markers;
    const map = mapRef.current;
    if (!map) return;
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
    origin: resolveColor("var(--accent)", "#0b6b4f"),
    destination: resolveColor("var(--ink)", "#17150f"),
    stop: resolveColor("var(--ink-2, var(--ink))", "#4b4a44"),
    transfer: resolveColor("var(--warn)", "#a85b00"),
    casing: resolveColor("var(--surface)", "#ffffff"),
    halo: resolveColor("var(--map-halo)", "rgb(23 21 15 / 0.14)"),
    alternative: resolveColor("var(--warn)", "#a85b00"),
  };
}

function addRouteLayers(map: MapLibreMap): void {
  if (map.getLayer(ROUTE_LAYER)) return;

  map.addSource(SOURCE_ID, { type: "geojson", data: emptyFeatureCollection() });
  const colors = themeColors();

  /*
   * Three layers under the route.
   *
   * A halo in the colour opposite the basemap separates the route from
   * the roads under it, a casing in the colour of the surface lifts the
   * route off the map, and the mode's own colour draws the line itself.
   * A white casing alone would do nothing: white on a light map is a
   * contrast of 1.14 to one.
   */
  map.addLayer({
    id: ROUTE_HALO_LAYER,
    type: "line",
    source: SOURCE_ID,
    filter: ["==", ["get", "kind"], "ride"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": colors.halo, "line-width": 12, "line-opacity": 1 },
  });

  map.addLayer({
    id: ROUTE_CASING_LAYER,
    type: "line",
    source: SOURCE_ID,
    filter: ["==", ["get", "kind"], "ride"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": colors.casing, "line-width": 10, "line-opacity": 1 },
  });

  map.addLayer({
    id: ROUTE_LAYER,
    type: "line",
    source: SOURCE_ID,
    filter: ["all", ["==", ["get", "variant"], 0], ["==", ["get", "kind"], "ride"]],
    // The identifier of the feature lets the map remember which leg of
    // the journey the pointer is over.
    promoteId: "id",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "color"],
      // The width carries the mode as well as the colour does, so the
      // route stays readable for a reader who cannot tell the colours
      // apart. The line the pointer is over grows a little.
      "line-width": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        ["+", ["get", "width"], 1.5],
        ["get", "width"],
      ],
    },
  } as never);

  // The walk between two vehicles is dashed and thin: it is not a ride,
  // and it should not look like one.
  map.addLayer({
    id: WALK_LAYER,
    type: "line",
    source: SOURCE_ID,
    filter: ["==", ["get", "kind"], "walk"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": 3,
      "line-dasharray": [1, 2],
      "line-opacity": 0.9,
    },
  });

  // The alternative route is dashed, so it reads as a second way even when
  // it runs along the same street.
  map.addLayer({
    id: ALT_ROUTE_LAYER,
    type: "line",
    source: SOURCE_ID,
    filter: ["==", ["get", "variant"], 1],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": 4,
      "line-dasharray": [2, 2],
      "line-opacity": 0.85,
    },
  });
}

function addMarkerLayers(map: MapLibreMap): void {
  if (map.getLayer(MARKER_SOURCE_ID)) return;

  map.addSource(MARKER_SOURCE_ID, { type: "geojson", data: emptyFeatureCollection() });
  const colors = themeColors();

  /*
   * The points of the journey.
   *
   * The two ends are filled and larger than the stops in between, a
   * transfer is a ring, and every stop has a small dot of its own. The
   * colours are the interface's own, not the modes': the origin is the
   * accent, the destination is the ink, and the transfer carries the
   * warning colour because it is where the rider has to pay attention.
   */
  map.addLayer({
    id: MARKER_SOURCE_ID,
    type: "circle",
    source: MARKER_SOURCE_ID,
    paint: {
      "circle-radius": [
        "match",
        ["get", "kind"],
        "origin",
        5,
        "destination",
        6.5,
        "transfer",
        4.5,
        2.5,
      ],
      "circle-color": [
        "match",
        ["get", "kind"],
        "origin",
        colors.origin,
        "destination",
        colors.destination,
        "transfer",
        colors.casing,
        colors.destination,
      ],
      "circle-stroke-width": ["match", ["get", "kind"], "transfer", 2.5, 1.5],
      "circle-stroke-color": [
        "match",
        ["get", "kind"],
        "origin",
        colors.casing,
        "destination",
        colors.origin,
        "transfer",
        colors.transfer,
        colors.casing,
      ],
      "circle-opacity": ["match", ["get", "kind"], "stop", 0.75, 1],
    },
  });

  // A ring around a transfer, so the point of changing vehicles is clear.
  map.addLayer({
    id: "transfer-ring",
    type: "circle",
    source: MARKER_SOURCE_ID,
    filter: ["==", ["get", "kind"], "transfer"],
    paint: {
      "circle-radius": 10,
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-width": 1.5,
      "circle-stroke-color": colors.transfer,
      "circle-stroke-opacity": 0.45,
    },
  });

  // The order of the journey, on the two ends and on the transfers.
  map.addLayer({
    id: "marker-order",
    type: "symbol",
    source: MARKER_SOURCE_ID,
    filter: ["!=", ["get", "kind"], "stop"],
    layout: {
      "text-field": ["get", "orderText"],
      "text-size": 10,
      "text-font": ["Noto Sans Regular"],
      "text-allow-overlap": true,
    },
    paint: {
      "text-color": [
        "match",
        ["get", "kind"],
        "origin",
        "#ffffff",
        "destination",
        "#ffffff",
        "#a85b00",
      ],
    },
  });

  // The touch area of a point is bigger than the point itself: a radius of
  // 22 pixels is a target of 44, which is the size a finger can find.
  map.addLayer({
    id: MARKER_HIT_LAYER,
    type: "circle",
    source: MARKER_SOURCE_ID,
    paint: {
      "circle-radius": 22,
      "circle-color": "rgba(0,0,0,0)",
      "circle-opacity": 0,
    },
  });
}

function syncLegs(map: MapLibreMap, legs: readonly MapLeg[]): void {
  const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
  if (!source) return;

  const colors = themeColors();

  const features = legs
    .filter((leg) => leg.coordinates.length > 1)
    .map((leg) => ({
      type: "Feature" as const,
      properties: {
        id: leg.id,
        color: resolveColor(leg.color, colors.origin),
        variant: leg.dashed ? 1 : 0,
        kind: leg.kind,
        label: leg.label,
        order: leg.order,
        width: leg.dashed ? 4 : leg.kind === "walk" ? 3 : leg.width ?? 5,
      },
      geometry: {
        type: "LineString" as const,
        coordinates: leg.coordinates.map((point) => [point.longitude, point.latitude]),
      },
    }));

  source.setData({ type: "FeatureCollection", features });

  // The map frames the whole journey that is being followed, not the
  // alternative and not one leg of it.
  const followed = legs
    .filter((leg) => !leg.dashed && leg.coordinates.length > 1)
    .flatMap((leg) => leg.coordinates);
  if (followed.length > 1) {
    map.fitBounds(boundsOf(followed), { padding: 56, maxZoom: 15, duration: 600 });
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
      "transfer",
      colors.casing,
      colors.stop,
    ]);
    map.setPaintProperty(MARKER_SOURCE_ID, "circle-stroke-color", [
      "match",
      ["get", "kind"],
      "origin",
      colors.casing,
      "destination",
      colors.casing,
      "transfer",
      colors.transfer,
      colors.casing,
    ]);
  }
  if (map.getLayer("transfer-ring")) {
    map.setPaintProperty("transfer-ring", "circle-stroke-color", colors.transfer);
  }

  source.setData({
    type: "FeatureCollection",
    features: markers.map((marker) => ({
      type: "Feature",
      properties: {
        id: marker.id,
        kind: marker.kind,
        label: marker.label,
        detail: marker.detail ?? "",
        order: marker.order ?? 0,
        orderText: marker.order === undefined ? "" : String(marker.order),
      },
      geometry: { type: "Point", coordinates: [marker.longitude, marker.latitude] },
    })),
  });
}

/**
 * The popover of a point.
 *
 * It is built as a DOM element rather than as HTML, so the text of a
 * station name can never become markup.
 */
function showPopup(
  map: MapLibreMap,
  current: () => Popup | null,
  remember: (popup: Popup) => void,
  feature: { properties?: Record<string, unknown> | null },
  markers: readonly MapMarker[],
): void {
  const id = feature.properties?.["id"];
  const marker = markers.find((candidate) => candidate.id === id);
  if (!marker) return;

  const container = document.createElement("div");
  container.className = "map-popup";

  const name = document.createElement("p");
  name.className = "map-popup-name";
  name.textContent = marker.label;
  container.append(name);

  if (marker.detail) {
    const detail = document.createElement("p");
    detail.className = "map-popup-detail";
    detail.textContent = marker.detail;
    container.append(detail);
  }

  const popup =
    current() ??
    new Popup({
      closeButton: false,
      closeOnClick: false,
      // The popover follows the camera: a popover left behind on the old
      // position would point at the wrong thing.
      closeOnMove: true,
      // A popover that takes the focus would take it away from the field
      // the reader is typing in.
      focusAfterOpen: false,
      maxWidth: "260px",
      offset: 14,
    });
  remember(popup);
  popup
    .setLngLat([marker.longitude, marker.latitude])
    .setDOMContent(container)
    .addTo(map);
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
