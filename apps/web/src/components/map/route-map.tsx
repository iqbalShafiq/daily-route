import {
  Map as MapLibreMap,
  Popup,
  type DataDrivenPropertyValueSpecification,
  type ExpressionSpecification,
  type FilterSpecification,
  type GeoJSONSource,
} from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { useEffect, useRef } from "react";

import { cn } from "../../lib/cn.js";
import { JAKARTA_BOUNDS, JAKARTA_VIEW, mapStyleFor } from "../../lib/map-style.js";
import { INCIDENT_PULSE_IMAGE, installIncidentImages, installIncidentPulseImage } from "./incident-images.js";
import {
  NETWORK_SYSTEMS,
  operatorCompact,
  operatorImageId,
  operatorLabel,
  operatorLogo,
  operatorMark,
} from "./operator-mark.js";
import { routeFlowDash, routeFlowIndex } from "./route-flow.js";

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
  /** The station this marker stands for. */
  stationId?: string;
  /** Whether the reader is pointing at this leg of the journey. */
  highlighted?: boolean;
  /** What the segment is: a ride, or the walk between two vehicles. */
  kind: "ride" | "walk";
  /** The name of the vehicle, for the popover. */
  label: string;
  /** The service, so the legend can show its mark. */
  serviceClass?: string | null | undefined;
  /** The operator the line belongs to, for the official wordmark. */
  systemId?: string | null | undefined;
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
  kind: "origin" | "destination" | "stop" | "transfer" | "incident";
  /** The order of the point in the journey. */
  order?: number | undefined;
  /** The station the point stands for, so the map can point back at it. */
  stationId?: string | undefined;
  /** The operator, so a route stop can wear its official mark. */
  systemId?: string | null | undefined;
  /** The baked incident image, for a closure. */
  mark?: string | undefined;
  /** 1 when this notice is the one the reader opened. */
  selected?: number | undefined;
};

export type RouteMapProps = {
  legs: MapLeg[];
  markers: MapMarker[];
  /** The stop the reader is pointing at in the list. */
  highlightedStationId?: string | null | undefined;
  theme: "light" | "dark";
  className?: string;
  /** Called when a marker is clicked, so the interface can show its detail. */
  onMarkerClick?: (marker: MapMarker) => undefined | void;
  /**
   * Extra points the camera keeps with the way being followed.
   *
   * A closure the way avoids is not one of them: it stays a point, and
   * it does not pull the frame open.
   */
  frame?: readonly { latitude: number; longitude: number }[] | undefined;
  /**
   * The whole network, thinned, drawn under a chosen journey.
   *
   * Feeders carry `local` and fade in only as the map comes closer.
   */
  network?: readonly NetworkStroke[] | undefined;
  /** Halte and stasiun of operating lines. Symbols, not DOM markers. */
  places?: readonly NetworkPlace[] | undefined;
  platforms?: readonly NetworkPlatform[] | undefined;
  /**
   * Operators left on the idle map.
   *
   * An empty list hides every network line and every stop mark.
   */
  visibleSystems?: readonly string[] | undefined;
  /**
   * A stop the reader asked to see from the notice list.
   *
   * The token changes on every request, so choosing the same stop again
   * still moves the camera.
   */
  glance?: { token: string; longitude: number; latitude: number } | null | undefined;
  /**
   * A notice the reader followed.
   *
   * A stop notice brings the camera to its stops; a corridor notice lights
   * the corridor itself, so "corridor 4H is not operating" is something the
   * rider can see rather than a sentence with nowhere to go.
   */
  focus?:
    | {
        token: string;
        points: readonly { latitude: number; longitude: number }[];
        lineId: string | null;
      }
    | null
    | undefined;
};

export type NetworkPlace = {
  id: string;
  systemId: string;
  name: string;
  longitude: number;
  latitude: number;
};

const ALL_SYSTEMS: readonly string[] = NETWORK_SYSTEMS.map((entry) => entry.id);
const EMPTY_PLACES: readonly NetworkPlace[] = [];
const EMPTY_PLATFORMS: readonly NetworkPlatform[] = [];

export type NetworkPlatform = {
  id: string;
  systemId: string;
  name: string;
  code?: string | null;
  lineCode: string;
  direction: "forward" | "backward";
  longitude: number;
  latitude: number;
};

export type NetworkStroke = {
  id: string;
  systemId: string;
  tier: "primary" | "local";
  coordinates: number[];
  direction?: "forward" | "backward";
  label?: string | null;
  /** A line with one geometry has no other side to offset. */
  oneWay?: boolean;
};

const ROUTE_LAYER = "route-line";
const ROUTE_CASING_LAYER = "route-casing";
const ROUTE_HALO_LAYER = "route-halo";
const ALT_ROUTE_LAYER = "route-line-alt";
const WALK_LAYER = "route-line-walk";
const WALK_HALO_LAYER = "route-line-walk-halo";
const ROUTE_FLOW_LAYER = "route-flow";
const SOURCE_ID = "routes";
const MARKER_SOURCE_ID = "markers";
const MARKER_HIT_LAYER = "marker-hit";
const INCIDENT_PULSE_LAYER = "incident-pulse";
const INCIDENT_ICON_LAYER = "incident-icon";
const NETWORK_SOURCE = "network";
const NETWORK_BACK_SOURCE = "network-back";
const NETWORK_BACK_LAYER = "network-back";
const FOCUS_SOURCE = "focus-line";
const FOCUS_LAYER = "focus-line-body";
const FOCUS_HALO_LAYER = "focus-line-halo";
const PLACE_SOURCE = "network-places";
const PLACE_BUS = "network-place-bus";
const PLACE_RAIL = "network-place-rail";
const PLACE_LAYERS = [PLACE_BUS, PLACE_RAIL] as const;
const PLATFORM_SOURCE = "network-platforms";
const PLATFORM_LAYER = "network-platform";

export function RouteMap({
  legs,
  markers,
  theme,
  className,
  onMarkerClick,
  highlightedStationId,
  frame,
  network = [],
  places = EMPTY_PLACES,
  platforms = EMPTY_PLATFORMS,
  visibleSystems = ALL_SYSTEMS,
  glance = null,
  focus = null,
}: RouteMapProps) {
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
  const frameRef = useRef(frame);
  const focusRef = useRef(focus);
  const highlightedStationRef = useRef(highlightedStationId ?? "");
  // The journey the camera has already framed. Painting the same journey
  // again must not move the camera: the reader may have zoomed in.
  const framedKeyRef = useRef<string | null>(null);
  // The lines last sent to the map. A highlight does not change them,
  // and sending the same lines again blinks the route.
  const geometryKeyRef = useRef<string | null>(null);
  const networkRef = useRef(network);
  const networkKeyRef = useRef<string | null>(null);
  const placesRef = useRef(places);
  const placesKeyRef = useRef<string | null>(null);
  const platformsRef = useRef(platforms);
  const platformsKeyRef = useRef<string | null>(null);
  const systemsRef = useRef(visibleSystems);

  // --- Create the map once ---------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: mapStyleFor(themeRef.current),
      center: [JAKARTA_VIEW.center.longitude, JAKARTA_VIEW.center.latitude],
      zoom: JAKARTA_VIEW.zoom,
      attributionControl: false,
      cooperativeGestures: false,
    });

    // The popover of a point. It lives with the map, because the handlers
    // that show it belong to the map too.
    let popup: Popup | null = null;

    // The style is the only thing that is reloaded, and every reload wipes
    // the layers this component owns. One handler puts them back and
    // repaints whatever the latest data is.
    const onStyleReady = (): void => {
      // A style reload wipes the layers. Paint changes and the moment the
      // map goes idle do not: rebuilding the lines there blinks the route
      // every time a leg is chosen.
      const routesMissing = !map.getSource(SOURCE_ID);
      const markersMissing = !map.getSource(MARKER_SOURCE_ID);
      if (!routesMissing && !markersMissing) return;
      if (routesMissing) {
        addNetworkLayers(map);
        addRouteLayers(map);
      }
      if (markersMissing) addMarkerLayers(map);
      addFocusLayers(map);
      placeWalkAboveStops(map);
      geometryKeyRef.current = geometrySignature(legsRef.current);
      networkKeyRef.current = networkSignature(networkRef.current);
      placesKeyRef.current = placesSignature(placesRef.current);
      platformsKeyRef.current = platformSignature(platformsRef.current);
      syncNetwork(map, networkRef.current);
      syncFocusLine(map, focusRef.current, networkRef.current);
      syncPlaces(map, placesRef.current);
      syncPlatforms(map, platformsRef.current);
      applyNetworkSystems(map, systemsRef.current);
      syncLegs(map, legsRef.current);
      paintNetworkDim(map, legsRef.current.some((leg) => leg.kind === "ride"));
      syncMarkers(map, markersRef.current);
      paintLegEmphasis(map, legsRef.current);
      frameJourney(map, legsRef.current, frameRef.current ?? [], framedKeyRef);
    };

    map.on("load", onStyleReady);
    map.on("style.load", onStyleReady);

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

    const placeLayers = [...PLACE_LAYERS];
    map.on("mouseenter", placeLayers, (event) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;
      map.getCanvas().style.cursor = "pointer";
      const longitude = feature.geometry.coordinates[0];
      const latitude = feature.geometry.coordinates[1];
      if (longitude === undefined || latitude === undefined) return;
      const name = String(feature.properties?.["name"] ?? "");
      const systemId = String(feature.properties?.["systemId"] ?? "");
      showTextPopup(map, () => popup, (created) => {
        popup = created;
      }, longitude, latitude, name, operatorLabel(systemId));
    });
    map.on("mouseleave", placeLayers, () => {
      map.getCanvas().style.cursor = "";
      popup?.remove();
      popup = null;
    });
    map.on("click", placeLayers, (event) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;
      const longitude = feature.geometry.coordinates[0];
      const latitude = feature.geometry.coordinates[1];
      if (longitude === undefined || latitude === undefined) return;
      map.easeTo({
        center: [longitude, latitude],
        zoom: Math.max(map.getZoom(), 15),
        duration: 400,
        padding: paddingOf(map),
        essential: false,
      });
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
        padding: paddingOf(map),
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
    paintLegEmphasis(map, legs);
    paintNetworkDim(map, legs.some((leg) => leg.kind === "ride"));
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
    frameRef.current = frame;
    const map = mapRef.current;
    if (!map || !map.getSource(SOURCE_ID)) return;
    const signature = geometrySignature(legs);
    if (signature !== geometryKeyRef.current) {
      geometryKeyRef.current = signature;
      syncLegs(map, legs);
    }
    frameJourney(map, legs, frame ?? [], framedKeyRef);
    paintNetworkDim(map, legs.some((leg) => leg.kind === "ride"));
  }, [legs, frame]);

  useEffect(() => {
    networkRef.current = network;
    const map = mapRef.current;
    if (!map || !map.getSource(NETWORK_SOURCE)) return;
    const signature = networkSignature(network);
    if (signature === networkKeyRef.current) return;
    networkKeyRef.current = signature;
    syncNetwork(map, network);
    paintNetworkDim(map, legsRef.current.some((leg) => leg.kind === "ride"));
  }, [network]);

  useEffect(() => {
    placesRef.current = places;
    const map = mapRef.current;
    if (!map || !map.getSource(PLACE_SOURCE)) return;
    const signature = placesSignature(places);
    if (signature === placesKeyRef.current) return;
    placesKeyRef.current = signature;
    syncPlaces(map, places);
  }, [places]);

  useEffect(() => {
    platformsRef.current = platforms;
    const map = mapRef.current;
    if (!map) return;
    const signature = platformSignature(platforms);
    if (signature === platformsKeyRef.current) return;
    platformsKeyRef.current = signature;
    syncPlatforms(map, platforms);
  }, [platforms]);

  useEffect(() => {
    systemsRef.current = visibleSystems;
    const map = mapRef.current;
    if (!map || !map.getSource(NETWORK_SOURCE)) return;
    applyNetworkSystems(map, visibleSystems);
  }, [visibleSystems]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !glance) return;
    const move = (): void => {
      map.easeTo({
        center: [glance.longitude, glance.latitude],
        zoom: Math.max(map.getZoom(), 14),
        duration: 450,
        padding: paddingOf(map),
        essential: false,
      });
    };
    if (map.isStyleLoaded()) move();
    else map.once("idle", move);
  }, [glance]);

  useEffect(() => {
    focusRef.current = focus;
    const map = mapRef.current;
    if (!map) return;
    const run = (): void => {
      syncFocusLine(map, focus, networkRef.current);
      if (!focus) return;
      if (focus.points.length === 1) {
        const [point] = focus.points;
        if (!point) return;
        map.easeTo({
          center: [point.longitude, point.latitude],
          zoom: Math.max(map.getZoom(), 14),
          duration: 450,
          padding: paddingOf(map),
          essential: false,
        });
        return;
      }
      if (focus.points.length > 1) {
        map.fitBounds(boundsOf(focus.points), {
          padding: paddingOf(map),
          maxZoom: 14,
          duration: 600,
          easing: easeInOutStrong,
        });
      }
    };
    if (map.isStyleLoaded()) run();
    else map.once("idle", run);
  }, [focus]);

  // --- Draw the markers -------------------------------------------------
  useEffect(() => {
    markersRef.current = markers;
    const map = mapRef.current;
    if (!map) return;
    syncMarkers(map, markers);
  }, [markers]);

  /*
   * The stop the reader is pointing at grows on the map, so the list
   * and the map point at the same place.
   */
  useEffect(() => {
    const map = mapRef.current;
    const station = highlightedStationId ?? "";
    highlightedStationRef.current = station;
    if (!map || !map.getLayer(MARKER_SOURCE_ID)) return;
    map.setPaintProperty(MARKER_SOURCE_ID, "circle-radius", [
      "case",
      ["==", ["get", "stationId"], station],
      ["match", ["get", "kind"], "origin", 5, "destination", 6.5, "transfer", 4.5, "incident", 0, 2.5],
      ["match", ["get", "kind"], "incident", 0, 6],
    ]);
    map.setPaintProperty(MARKER_SOURCE_ID, "circle-stroke-width", [
      "case",
      ["==", ["get", "stationId"], station],
      ["match", ["get", "kind"], "transfer", 2.5, "incident", 0, 1.5],
      ["match", ["get", "kind"], "incident", 0, 3],
    ]);
    if (map.getLayer(INCIDENT_ICON_LAYER)) {
      map.setLayoutProperty(INCIDENT_ICON_LAYER, "icon-size", incidentBaseSize(station));
    }
  }, [highlightedStationId, markers]);

  /*
   * A closure keeps asking to be seen. The stop stays still; an outline
   * of its plate travels out and fades. The loop runs only while a closure
   * is on the map, and not at all when the reader asked for less motion.
   */
  const hasRide = legs.some((leg) => leg.kind === "ride" && !leg.dashed);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let stop = (): void => {};

    const sync = (): void => {
      stop();
      stop = () => {};
      if (!hasRide || media.matches) {
        quietRouteFlow(map);
        return;
      }
      stop = runRouteFlow(map);
    };

    sync();
    media.addEventListener("change", sync);
    return () => {
      media.removeEventListener("change", sync);
      stop();
      quietRouteFlow(map);
    };
  }, [hasRide]);

  const hasIncident = markers.some((marker) => marker.kind === "incident");
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // The notice plate is static. A travelling outline reads as an
    // activity indicator, and an announcement is not a live feed.
    quietIncidentPulse(map);
  }, [hasIncident]);

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
    origin: resolveColor("var(--accent)", "var(--accent)"),
    destination: resolveColor("var(--ink)", "var(--ink)"),
    danger: resolveColor("var(--danger)", "var(--danger)"),
    stop: resolveColor("var(--ink-2)", "var(--ink-2)"),
    transfer: resolveColor("var(--warn)", "var(--warn)"),
    casing: resolveColor("var(--surface)", "var(--surface)"),
    halo: resolveColor("var(--map-halo)", "var(--map-halo)"),
    alternative: resolveColor("var(--warn)", "var(--warn)"),
    onColour: resolveColor("var(--accent-ink)", "var(--accent-ink)"),
  };
}

/**
 * The side of the road a bus keeps in Jakarta.
 *
 * MapLibre's positive offset is to the right of the line direction, so a
 * left-hand-traffic bus needs a negative offset. It is in screen pixels:
 * at zoom 16, 1.3 px is roughly one lane. Rail and walk keep their own
 * alignment.
 */
const BUS_LEFT_OFFSET: ExpressionSpecification = [
  "case",
  ["==", ["get", "systemId"], "transjakarta"],
  -1.3,
  0,
];

const BUS_LEG_OFFSET: ExpressionSpecification = [
  "case",
  [
    "in",
    ["get", "serviceClass"],
    ["literal", ["brt", "non-brt", "minitrans", "mikrotrans", "royaltrans"]],
  ],
  -1.3,
  0,
];

const SYSTEM_COLOR: Record<string, string> = {
  transjakarta: "var(--mode-bus)",
  "mrt-jakarta": "var(--mode-metro)",
  "lrt-jakarta": "var(--mode-tram)",
  "lrt-jabodebek": "var(--mode-lrt-jabodebek)",
  "krl-jabodetabek": "var(--mode-rail)",
};

const networkBaseFilter = new Map<string, FilterSpecification>();
const networkRestOpacity = new Map<string, ExpressionSpecification | number>();

function addNetworkLayers(map: MapLibreMap): void {
  if (map.getSource(NETWORK_SOURCE)) return;
  installOperatorImages(map);
  map.addSource(NETWORK_SOURCE, { type: "geojson", data: emptyFeatureCollection() });
  map.addSource(NETWORK_BACK_SOURCE, { type: "geojson", data: emptyFeatureCollection() });
  map.addLayer({
    id: NETWORK_BACK_LAYER,
    type: "line",
    source: NETWORK_BACK_SOURCE,
    minzoom: 13.4,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 13.4, 2.4, 16, 4.4],
      "line-offset": BUS_LEFT_OFFSET,
      "line-opacity": 0.86,
    },
  });
  map.addSource(PLACE_SOURCE, { type: "geojson", data: emptyFeatureCollection() });
  const colors = themeColors();
  for (const tier of ["primary", "local"] as const) {
    const opacity = restOpacity(tier);
    const halo = span(tier, 11, 16);
    const casing = span(tier, 8, 12);
    const body = span(tier, 5.6, 8.5);
    addNetLine(map, `network-${tier}-halo`, tierOf(tier), {
      color: colors.halo,
      width: halo,
      opacity,
    });
    addNetLine(map, `network-${tier}-casing`, tierOf(tier), {
      color: colors.casing,
      width: casing,
      opacity,
    });
    // KRL is drawn as two rails on sleepers, so a solid body would hide the gaps.
    addNetLine(map, `network-${tier}-body`, tierExcept(tier, "krl-jabodetabek"), {
      color: ["get", "color"],
      width: body,
      opacity,
    });
    addNetLine(map, `network-${tier}-bus`, tierAnd(tier, "transjakarta"), {
      color: colors.casing,
      width: span(tier, 1.5, 2.2),
      opacity,
    });
    addNetLine(map, `network-${tier}-metro`, tierAnd(tier, "mrt-jakarta"), {
      color: colors.casing,
      width: span(tier, 2, 3),
      opacity,
    });
    addNetLine(map, `network-${tier}-lrt`, tierAnd(tier, "lrt-jakarta"), {
      color: colors.casing,
      width: span(tier, 1.8, 2.4),
      opacity,
      dash: [0.7, 1.15],
    });
    addNetLine(map, `network-${tier}-lrtj`, tierAnd(tier, "lrt-jabodebek"), {
      color: colors.casing,
      width: span(tier, 1.6, 2.2),
      opacity,
      dash: [2.2, 1.05],
    });
    addNetLine(map, `network-${tier}-ties`, tierAnd(tier, "krl-jabodetabek"), {
      color: ["get", "color"],
      width: span(tier, 6.4, 10),
      opacity,
      dash: [0.42, 1.65],
      cap: "butt",
    });
    const rail = span(tier, 1.8, 2.6);
    addNetLine(map, `network-${tier}-rail-a`, tierAnd(tier, "krl-jabodetabek"), {
      color: ["get", "color"],
      width: rail,
      opacity,
      offset: span(tier, -2.15, -3.4),
    });
    addNetLine(map, `network-${tier}-rail-b`, tierAnd(tier, "krl-jabodetabek"), {
      color: ["get", "color"],
      width: rail,
      opacity,
      offset: span(tier, 2.15, 3.4),
    });
  }
  // One zoom expression per layer. A halte is dense, so it waits until
  // the map is close. A stasiun is sparse enough to show across the city.
  addPlaceLayer(map, PLACE_BUS, ["==", ["get", "systemId"], "transjakarta"], 13.2);
  addPlaceLayer(map, PLACE_RAIL, ["!=", ["get", "systemId"], "transjakarta"], 12.2);
  addPlatformLayer(map, colors);
}

function addPlaceLayer(
  map: MapLibreMap,
  id: string,
  filter: FilterSpecification,
  minzoom: number,
): void {
  networkBaseFilter.set(id, filter);
  map.addLayer({
    id,
    type: "symbol",
    source: PLACE_SOURCE,
    minzoom,
    filter,
    layout: {
      "icon-image": ["get", "mark"],
      "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.36, 14, 0.5, 16, 0.66],
      "icon-allow-overlap": ["step", ["zoom"], false, 15, true],
      "icon-padding": 2,
    },
    paint: {
      "icon-opacity": 1,
      "icon-opacity-transition": { duration: 0, delay: 0 },
    },
  });
}

function installOperatorImages(map: MapLibreMap): void {
  const plate = resolveColor("var(--surface)", "var(--surface)");
  const line = resolveColor("var(--line)", "var(--line)");
  for (const entry of NETWORK_SYSTEMS) {
    const compact = operatorCompact(entry.id);
    const logo = compact ?? operatorLogo(entry.id);
    if (!logo) continue;
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) return;
      // A compact symbol sits on the same square plate as a notice.
      // A wordmark needs the wide plate, or the letters are crushed.
      if (compact) {
        canvas.width = 64;
        canvas.height = 64;
        context.scale(2, 2);
        context.beginPath();
        context.roundRect(1, 1, 30, 30, 8);
        context.fillStyle = plate;
        context.fill();
        context.lineWidth = 1;
        context.strokeStyle = line;
        context.stroke();
        const bounds = fitted(image.width, image.height, 22, 22);
        context.drawImage(image, 5 + bounds.x, 5 + bounds.y, bounds.width, bounds.height);
      } else {
        canvas.width = 128;
        canvas.height = 64;
        context.scale(2, 2);
        context.beginPath();
        context.roundRect(1, 1, 62, 30, 6);
        context.fillStyle = plate;
        context.fill();
        context.lineWidth = 1;
        context.strokeStyle = line;
        context.stroke();
        const bounds = fitted(image.width, image.height, 56, 24);
        context.drawImage(image, 4 + bounds.x, 4 + bounds.y, bounds.width, bounds.height);
      }
      const id = operatorImageId(entry.id);
      if (map.hasImage(id)) map.removeImage(id);
      map.addImage(id, context.getImageData(0, 0, canvas.width, canvas.height), { pixelRatio: 2 });
    };
    image.src = logo;
  }
}

/** Fit a logo inside a box without stretching it. */
function fitted(
  width: number,
  height: number,
  boxWidth: number,
  boxHeight: number,
): { x: number; y: number; width: number; height: number } {
  const scale = Math.min(boxWidth / Math.max(width, 1), boxHeight / Math.max(height, 1));
  const drawnWidth = width * scale;
  const drawnHeight = height * scale;
  return {
    x: (boxWidth - drawnWidth) / 2,
    y: (boxHeight - drawnHeight) / 2,
    width: drawnWidth,
    height: drawnHeight,
  };
}

function span(tier: "primary" | "local", atCity: number, atStreet: number): ExpressionSpecification {
  const scale = tier === "local" ? 0.72 : 1;
  return ["interpolate", ["linear"], ["zoom"], 10, atCity * scale, 16, atStreet * scale];
}

function restOpacity(tier: "primary" | "local"): ExpressionSpecification | number {
  if (tier === "primary") return 0.96;
  return ["interpolate", ["linear"], ["zoom"], 11.2, 0, 13.2, 0.9];
}

function tierOf(tier: "primary" | "local"): FilterSpecification {
  return ["==", ["get", "tier"], tier];
}

function tierAnd(tier: "primary" | "local", systemId: string): FilterSpecification {
  return ["all", ["==", ["get", "tier"], tier], ["==", ["get", "systemId"], systemId]];
}

function tierExcept(tier: "primary" | "local", systemId: string): FilterSpecification {
  return ["all", ["==", ["get", "tier"], tier], ["!=", ["get", "systemId"], systemId]];
}

function addNetLine(
  map: MapLibreMap,
  id: string,
  filter: FilterSpecification,
  paint: {
    color: DataDrivenPropertyValueSpecification<string> | string;
    width: ExpressionSpecification | number;
    opacity: ExpressionSpecification | number;
    dash?: number[];
    offset?: ExpressionSpecification;
    cap?: "round" | "butt";
  },
): void {
  networkBaseFilter.set(id, filter);
  networkRestOpacity.set(id, paint.opacity);
  map.addLayer({
    id,
    type: "line",
    source: NETWORK_SOURCE,
    filter,
    layout: { "line-cap": paint.cap ?? "round", "line-join": "round" },
    paint: {
      "line-color": paint.color,
      "line-width": paint.width,
      "line-opacity": paint.opacity,
      "line-opacity-transition": { duration: 0, delay: 0 },
      ...(paint.dash ? { "line-dasharray": paint.dash } : {}),
      "line-offset": paint.offset ?? BUS_LEFT_OFFSET,
    },
  });
}

function applyNetworkSystems(map: MapLibreMap, systems: readonly string[]): void {
  const allow: FilterSpecification =
    systems.length === 0
      ? ["==", ["get", "systemId"], "__none__"]
      : ["in", ["get", "systemId"], ["literal", [...systems]]];
  for (const [id, base] of networkBaseFilter) {
    if (!map.getLayer(id)) continue;
    map.setFilter(id, ["all", base, allow] as FilterSpecification);
  }
  for (const id of PLACE_LAYERS) {
    const base = networkBaseFilter.get(id);
    if (!base || !map.getLayer(id)) continue;
    map.setFilter(id, ["all", base, allow] as FilterSpecification);
  }
  if (map.getLayer(PLATFORM_LAYER)) map.setFilter(PLATFORM_LAYER, allow);
  if (map.getLayer(NETWORK_BACK_LAYER)) {
    map.setFilter(NETWORK_BACK_LAYER, ["all", ["==", ["get", "direction"], "backward"], allow]);
  }
}

function syncNetwork(map: MapLibreMap, lines: readonly NetworkStroke[]): void {
  const source = map.getSource(NETWORK_SOURCE) as GeoJSONSource | undefined;
  if (!source) return;
  const back = map.getSource(NETWORK_BACK_SOURCE) as GeoJSONSource | undefined;
  const fallback = resolveColor("var(--mode-bus)", "var(--mode-bus)");
  const features = [];
  const backFeatures = [];
  for (const line of lines) {
    if (line.coordinates.length < 4) continue;
    const feature = {
      type: "Feature" as const,
      properties: {
        id: line.id,
        systemId: line.systemId,
        tier: line.tier,
        direction: line.direction ?? null,
        oneWay: line.oneWay ?? false,
        label: line.label ?? null,
        color: resolveColor(SYSTEM_COLOR[line.systemId] ?? "var(--mode-bus)", fallback),
      },
      geometry: {
        type: "LineString" as const,
        coordinates: pairs(line.coordinates),
      },
    };
    // The return shares the road at city zoom and is drawn as an offset
    // when the camera is close enough to see the two sides.
    if (line.direction === "backward" && !line.oneWay) backFeatures.push(feature);
    else features.push(feature);
  }
  source.setData({ type: "FeatureCollection", features });
  back?.setData({ type: "FeatureCollection", features: backFeatures });
}

/** The corridor a notice is about, drawn above the rest of the network. */
function syncFocusLine(
  map: MapLibreMap,
  focus: { lineId: string | null } | null | undefined,
  network: readonly NetworkStroke[],
): void {
  const source = map.getSource(FOCUS_SOURCE) as GeoJSONSource | undefined;
  if (!source) return;
  const line = focus?.lineId ? network.find((entry) => entry.id === focus.lineId) : undefined;
  if (!line || line.coordinates.length < 4) {
    source.setData(emptyFeatureCollection());
    return;
  }
  source.setData({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { id: line.id, systemId: line.systemId },
        geometry: { type: "LineString", coordinates: pairs(line.coordinates) },
      },
    ],
  });
}

function addFocusLayers(map: MapLibreMap): void {
  if (map.getSource(FOCUS_SOURCE)) return;
  map.addSource(FOCUS_SOURCE, { type: "geojson", data: emptyFeatureCollection() });
  map.addLayer({
    id: FOCUS_HALO_LAYER,
    type: "line",
    source: FOCUS_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": resolveColor("var(--accent)", "var(--accent)"),
      "line-width": 7,
      "line-offset": BUS_LEFT_OFFSET,
      "line-opacity": 0.22,
    },
  });
  map.addLayer({
    id: FOCUS_LAYER,
    type: "line",
    source: FOCUS_SOURCE,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": resolveColor("var(--accent)", "var(--accent)"),
      "line-width": 3.5,
      "line-offset": BUS_LEFT_OFFSET,
      "line-opacity": 0.95,
    },
  });
}

function pairs(flat: readonly number[]): [number, number][] {
  const points: [number, number][] = [];
  for (let index = 0; index + 1 < flat.length; index += 2) {
    const longitude = flat[index];
    const latitude = flat[index + 1];
    if (longitude === undefined || latitude === undefined) continue;
    points.push([longitude, latitude]);
  }
  return points;
}

function addPlatformLayer(map: MapLibreMap, colors: { casing: string }): void {
  map.addSource(PLATFORM_SOURCE, { type: "geojson", data: emptyFeatureCollection() });
  map.addLayer({
    id: PLATFORM_LAYER,
    type: "circle",
    source: PLATFORM_SOURCE,
    minzoom: 14.6,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 14.6, 1.8, 16, 3],
      "circle-color": ["get", "color"],
      "circle-stroke-color": colors.casing,
      "circle-stroke-width": 1,
      "circle-opacity": 0.95,
    },
  });
}

function syncPlatforms(map: MapLibreMap, platforms: readonly NetworkPlatform[]): void {
  const source = map.getSource(PLATFORM_SOURCE) as GeoJSONSource | undefined;
  if (!source) return;
  const fallback = resolveColor("var(--mode-bus)", "var(--mode-bus)");
  const features = platforms
    .filter((platform) => Number.isFinite(platform.longitude) && Number.isFinite(platform.latitude))
    .map((platform) => ({
      type: "Feature" as const,
      properties: {
        id: platform.id,
        name: platform.name,
        code: platform.code ?? null,
        systemId: platform.systemId,
        lineCode: platform.lineCode,
        direction: platform.direction,
        color: resolveColor(SYSTEM_COLOR[platform.systemId] ?? "var(--mode-bus)", fallback),
      },
      geometry: {
        type: "Point" as const,
        coordinates: [platform.longitude, platform.latitude] as [number, number],
      },
    }));
  source.setData({ type: "FeatureCollection", features });
}

function platformSignature(platforms: readonly NetworkPlatform[]): string {
  const first = platforms[0];
  const last = platforms[platforms.length - 1];
  return `${platforms.length}:${first?.id ?? ""}:${last?.id ?? ""}`;
}

function syncPlaces(map: MapLibreMap, places: readonly NetworkPlace[]): void {
  const source = map.getSource(PLACE_SOURCE) as GeoJSONSource | undefined;
  if (!source) return;
  const features = [];
  for (const place of places) {
    if (!operatorMark(place.systemId)) continue;
    if (!Number.isFinite(place.longitude) || !Number.isFinite(place.latitude)) continue;
    features.push({
      type: "Feature" as const,
      properties: {
        id: place.id,
        name: place.name,
        systemId: place.systemId,
        mark: operatorImageId(place.systemId),
      },
      geometry: {
        type: "Point" as const,
        coordinates: [place.longitude, place.latitude] as [number, number],
      },
    });
  }
  source.setData({ type: "FeatureCollection", features });
}

function networkSignature(lines: readonly NetworkStroke[]): string {
  let total = 0;
  for (const line of lines) total += line.coordinates.length;
  return `${lines.length}:${total}`;
}

function placesSignature(places: readonly NetworkPlace[]): string {
  const first = places[0];
  const last = places[places.length - 1];
  return `${places.length}:${first?.id ?? ""}:${last?.id ?? ""}`;
}

function paintNetworkDim(map: MapLibreMap, dim: boolean): void {
  for (const [id, expression] of networkRestOpacity) {
    if (!map.getLayer(id)) continue;
    map.setPaintProperty(id, "line-opacity", dim ? (id.includes("-local-") ? 0.1 : 0.22) : expression);
  }
  for (const id of PLACE_LAYERS) {
    if (!map.getLayer(id)) continue;
    map.setPaintProperty(id, "icon-opacity", dim ? 0.3 : 1);
  }
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
    paint: {
      "line-color": colors.halo,
      "line-width": 12,
      "line-offset": BUS_LEG_OFFSET,
      "line-opacity": 1,
      "line-opacity-transition": { duration: 0, delay: 0 },
    },
  });

  map.addLayer({
    id: ROUTE_CASING_LAYER,
    type: "line",
    source: SOURCE_ID,
    filter: ["==", ["get", "kind"], "ride"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": colors.casing,
      "line-width": 10,
      "line-offset": BUS_LEG_OFFSET,
      "line-opacity": 1,
      "line-opacity-transition": { duration: 0, delay: 0 },
    },
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
      "line-offset": BUS_LEG_OFFSET,
      // The width carries the mode as well as the colour does, so the
      // route stays readable for a reader who cannot tell the colours
      // apart. The line the pointer is over grows a little.
      "line-width": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        ["+", ["get", "width"], 1.5],
        ["get", "width"],
      ],
      "line-opacity-transition": { duration: 0, delay: 0 },
      "line-width-transition": { duration: 0, delay: 0 },
    },
  } as never);

  // A dash that travels along the ride, so the direction can be read
  // without a legend. It starts invisible; the flow loop paints it, and
  // a reader who asked for less motion never sees it move.
  map.addLayer({
    id: ROUTE_FLOW_LAYER,
    type: "line",
    source: SOURCE_ID,
    filter: ["all", ["==", ["get", "variant"], 0], ["==", ["get", "kind"], "ride"]],
    layout: { "line-cap": "butt", "line-join": "round" },
    paint: {
      "line-color": colors.casing,
      "line-offset": BUS_LEG_OFFSET,
      "line-width": ["max", 1.5, ["-", ["get", "width"], 2.5]],
      "line-dasharray": [0, 4, 3, 0],
      // A transition here crossfades two dashes. Updating the dash while
      // that fade is running redraws the whole ride, which blinks.
      "line-dasharray-transition": { duration: 0, delay: 0 },
      "line-opacity": 0,
      "line-opacity-transition": { duration: 0, delay: 0 },
    },
  });

  // The body of a walk the reader is pointing at. It stays invisible
  // until then, and it is lifted above the stops so a short walk is
  // not hidden under the transfer ring.
  map.addLayer({
    id: WALK_HALO_LAYER,
    type: "line",
    source: SOURCE_ID,
    filter: ["all", ["==", ["get", "kind"], "walk"], ["==", ["get", "variant"], 0]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": colors.destination,
      "line-width": 0,
      "line-opacity": 0,
      "line-width-transition": { duration: 0, delay: 0 },
      "line-opacity-transition": { duration: 0, delay: 0 },
    },
  });

  // The walk between two vehicles is dashed and thin: it is not a ride,
  // and it should not look like one.
  map.addLayer({
    id: WALK_LAYER,
    type: "line",
    source: SOURCE_ID,
    filter: ["all", ["==", ["get", "kind"], "walk"], ["==", ["get", "variant"], 0]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": 3,
      "line-dasharray": [1, 2],
      "line-opacity": 0.9,
      "line-opacity-transition": { duration: 0, delay: 0 },
      "line-width-transition": { duration: 0, delay: 0 },
      "line-color-transition": { duration: 0, delay: 0 },
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
  installIncidentImages(map, {
    danger: colors.danger,
    surface: colors.casing,
    line: resolveColor("var(--line)", "var(--line)"),
  });
  installIncidentPulseImage(map, colors.danger);
  installRouteOperatorImages(map);

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
        "case",
        ["==", ["get", "stationId"], ""],
        ["match", ["get", "kind"], "origin", 5, "destination", 6.5, "transfer", 4.5, "incident", 0, 2.5],
        ["match", ["get", "kind"], "incident", 0, 6],
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
        "incident",
        colors.danger,
        colors.destination,
      ],
      "circle-stroke-width": ["match", ["get", "kind"], "transfer", 2.5, "incident", 0, 1.5],
      "circle-stroke-color": [
        "match",
        ["get", "kind"],
        "origin",
        colors.casing,
        "destination",
        colors.origin,
        "transfer",
        colors.transfer,
        "incident",
        colors.casing,
        colors.casing,
      ],
      "circle-opacity": [
        "case",
        ["!=", ["get", "operatorImage"], ""],
        0,
        ["match", ["get", "kind"], "stop", 0.75, 1],
      ],
    },
  });

  // The official operator mark is the stop itself. A ring carries the
  // origin/destination/transfer meaning around that mark; a plain stop is
  // just the mark, not another red dot.
  map.addLayer({
    id: "route-marker-ring",
    type: "circle",
    source: MARKER_SOURCE_ID,
    filter: [
      "all",
      ["!=", ["get", "operatorImage"], ""],
      ["!=", ["get", "kind"], "stop"],
      ["!=", ["get", "kind"], "incident"],
    ],
    paint: {
      "circle-radius": ["match", ["get", "kind"], "origin", 12, "destination", 13, "transfer", 11, 10],
      "circle-color": colors.casing,
      "circle-opacity": 0,
      "circle-stroke-width": 2,
      "circle-stroke-color": [
        "match",
        ["get", "kind"],
        "origin",
        colors.origin,
        "destination",
        colors.destination,
        "transfer",
        colors.transfer,
        colors.origin,
      ],
    },
  });

  map.addLayer({
    id: "route-marker-icon",
    type: "symbol",
    source: MARKER_SOURCE_ID,
    filter: ["!=", ["get", "operatorImage"], ""],
    layout: {
      "icon-image": ["get", "operatorImage"],
      "icon-size": ["match", ["get", "kind"], "origin", 0.62, "destination", 0.7, "transfer", 0.55, 0.5],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "icon-anchor": "center",
    },
  });

  // An outline of the notice plate. It starts under the icon and
  // travels outward. A reader who asked for less motion never sees it.
  map.addLayer({
    id: INCIDENT_PULSE_LAYER,
    type: "symbol",
    source: MARKER_SOURCE_ID,
    filter: ["==", ["get", "kind"], "incident"],
    layout: {
      "icon-image": INCIDENT_PULSE_IMAGE,
      "icon-size": 0.7,
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
    paint: {
      "icon-opacity": 0,
      "icon-opacity-transition": { duration: 0, delay: 0 },
    },
  });

  map.addLayer({
    id: INCIDENT_ICON_LAYER,
    type: "symbol",
    source: MARKER_SOURCE_ID,
    filter: ["==", ["get", "kind"], "incident"],
    layout: {
      "icon-image": ["get", "mark"],
      "icon-size": 0.7,
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
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
    filter: ["match", ["get", "kind"], "origin", true, "destination", true, "transfer", true, false],
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
        colors.onColour,
        "destination",
        colors.onColour,
        colors.transfer,
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
        serviceClass: leg.serviceClass ?? "",
      },
      geometry: {
        type: "LineString" as const,
        coordinates: leg.coordinates.map((point) => [point.longitude, point.latitude]),
      },
    }));

  source.setData({ type: "FeatureCollection", features });
}

/**
 * Frame what the reader is looking at, then leave the camera alone.
 *
 * The whole journey is framed when it is first shown. One part of it,
 * chosen in the list, is framed on its own. Painting the same thing
 * again must not move the camera: a zoom the reader made stays until
 * the choice changes.
 */
function frameJourney(
  map: MapLibreMap,
  legs: readonly MapLeg[],
  frame: readonly { latitude: number; longitude: number }[],
  framedKey: { current: string | null },
): void {
  const focus = focusedLeg(legs);
  const key = focus ? `focus:${focus.id}:${focus.coordinates.length}` : frameKey(legs, frame);
  if (key === framedKey.current) return;
  // A frame taken before the map has a size sticks, because the same
  // journey is not framed again. Wait until the canvas is on screen.
  const canvas = map.getCanvas();
  if (canvas.clientWidth < 10 || canvas.clientHeight < 10) return;
  framedKey.current = key;

  // One leg when the reader picked it, otherwise the whole way,
  // including the walk at either end. A closure the way avoids is a
  // point of its own and is not part of this frame.
  const followed = focus
    ? focus.coordinates
    : [
        ...legs
          .filter((leg) => !leg.dashed && leg.coordinates.length > 1)
          .flatMap((leg) => leg.coordinates),
        ...frame,
      ];
  if (followed.length > 1) {
    map.fitBounds(boundsOf(followed), {
      padding: paddingOf(map),
      // A journey across the city is framed by its own ends. One part
      // may come closer, and the cap stops a single stop from filling
      // the window.
      maxZoom: focus ? 17 : 15,
      duration: 600,
      easing: easeInOutStrong,
    });
  }
}

/** The part of the journey the reader picked in the list. */
function focusedLeg(legs: readonly MapLeg[]): MapLeg | undefined {
  return legs.find((leg) => leg.highlighted && !leg.dashed && leg.coordinates.length > 1);
}

/** Identity of the lines, ignoring which one is bright. */
function geometrySignature(legs: readonly MapLeg[]): string {
  return legs
    .map((leg) => {
      const first = leg.coordinates[0];
      const last = leg.coordinates[leg.coordinates.length - 1];
      return [
        leg.id,
        leg.coordinates.length,
        first ? `${first.longitude},${first.latitude}` : "",
        last ? `${last.longitude},${last.latitude}` : "",
        leg.color,
        leg.width ?? "",
        leg.dashed ? 1 : 0,
      ].join(":");
    })
    .join("|");
}

/** Identity of the journey the camera is responsible for. */
function frameKey(
  legs: readonly MapLeg[],
  frame: readonly { latitude: number; longitude: number }[],
): string {
  const parts: string[] = [];
  for (const leg of legs) {
    if (leg.dashed || leg.coordinates.length < 2) continue;
    const first = leg.coordinates[0];
    const last = leg.coordinates[leg.coordinates.length - 1];
    if (!first || !last) continue;
    parts.push(
      `${leg.id}:${leg.coordinates.length}:${first.longitude},${first.latitude}:${last.longitude},${last.latitude}`,
    );
  }
  for (const point of frame) {
    parts.push(`f:${point.longitude},${point.latitude}`);
  }
  return parts.join("|");
}

/**
 * The room the map leaves around what it shows.
 *
 * The values come from the stylesheet, because the room is a fact about
 * the layout: on a phone the search bar is above the map and the answer
 * is below it, and a journey that is framed in the whole window would
 * be hidden under both.
 */
function paddingOf(map: MapLibreMap): {
  top: number;
  bottom: number;
  left: number;
  right: number;
} {
  const style = getComputedStyle(map.getContainer());
  const read = (name: string, fallback: number): number => {
    const value = Number.parseFloat(style.getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    top: read("--map-pad-top", 56),
    bottom: read("--map-pad-bottom", 56),
    left: read("--map-pad-left", 56),
    right: read("--map-pad-right", 56),
  };
}

function routeOperatorImageId(systemId: string): string {
  return `route-op-${systemId}`;
}

/** Square plates around the official operator mark, for a route stop. */
function installRouteOperatorImages(map: MapLibreMap): void {
  const plate = resolveColor("var(--surface)", "var(--surface)");
  const line = resolveColor("var(--line)", "var(--line)");
  for (const entry of NETWORK_SYSTEMS) {
    const logo = operatorMark(entry.id);
    if (!logo) continue;
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.scale(2, 2);
      context.beginPath();
      context.roundRect(1, 1, 30, 30, 8);
      context.fillStyle = plate;
      context.fill();
      context.lineWidth = 1;
      context.strokeStyle = line;
      context.stroke();
      const bounds = fitted(image.width, image.height, 22, 22);
      context.drawImage(image, 5 + bounds.x, 5 + bounds.y, bounds.width, bounds.height);
      const id = routeOperatorImageId(entry.id);
      if (map.hasImage(id)) map.removeImage(id);
      map.addImage(id, context.getImageData(0, 0, canvas.width, canvas.height), { pixelRatio: 2 });
    };
    image.src = logo;
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
      "incident",
      colors.danger,
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
      "incident",
      colors.danger,
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
        stationId: marker.stationId ?? "",
        systemId: marker.systemId ?? "",
        operatorImage: marker.systemId ? routeOperatorImageId(marker.systemId) : "",
        mark: marker.mark ?? "",
        selected: marker.selected ?? 0,
        order: marker.order ?? 0,
        orderText: marker.order === undefined ? "" : String(marker.order),
      },
      geometry: { type: "Point", coordinates: [marker.longitude, marker.latitude] },
    })),
  });
}

/**
 * The popover of a network stop.
 *
 * The text is set as text, so a station name can never become markup.
 */
function showTextPopup(
  map: MapLibreMap,
  current: () => Popup | null,
  remember: (popup: Popup) => void,
  longitude: number,
  latitude: number,
  label: string,
  detail: string,
): void {
  const container = document.createElement("div");
  container.className = "map-popup";
  const name = document.createElement("p");
  name.className = "map-popup-name";
  name.textContent = label;
  container.append(name);
  if (detail) {
    const line = document.createElement("p");
    line.className = "map-popup-detail";
    line.textContent = detail;
    container.append(line);
  }
  const popup =
    current() ??
    new Popup({
      closeButton: false,
      closeOnClick: false,
      closeOnMove: true,
      focusAfterOpen: false,
      maxWidth: "260px",
      offset: 16,
    });
  remember(popup);
  popup.setLngLat([longitude, latitude]).setDOMContent(container).addTo(map);
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

/** Leave the travelling ring invisible. The still ring is untouched. */
/**
 * Keep the leg the reader is pointing at bright.
 *
 * A ride and a walk both answer. The others fade. A walk also grows
 * into an ink line and is drawn above the stops, because a thin dash
 * between two vehicles disappears under the transfer ring.
 */
function paintLegEmphasis(map: MapLibreMap, legs: readonly MapLeg[]): void {
  const active = legs.find((leg) => leg.highlighted);
  const highlighted = active?.id ?? "";
  // Always an expression. Switching between a plain number and an
  // expression rebuilds the line, and the ride blinks.
  const rideOpacity: DataDrivenPropertyValueSpecification<number> = [
    "case",
    ["==", ["get", "id"], highlighted],
    1,
    highlighted ? 0.28 : 1,
  ];
  if (map.getLayer(ROUTE_LAYER)) map.setPaintProperty(ROUTE_LAYER, "line-opacity", rideOpacity);
  if (map.getLayer(ROUTE_CASING_LAYER)) {
    map.setPaintProperty(ROUTE_CASING_LAYER, "line-opacity", rideOpacity);
  }
  if (map.getLayer(ROUTE_HALO_LAYER)) map.setPaintProperty(ROUTE_HALO_LAYER, "line-opacity", rideOpacity);
  if (map.getLayer(ROUTE_FLOW_LAYER)) {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.setPaintProperty(ROUTE_FLOW_LAYER, "line-opacity", still ? 0 : rideOpacity);
  }
  if (!map.getLayer(WALK_LAYER)) return;
  const colors = themeColors();
  if (map.getLayer(WALK_HALO_LAYER)) {
    map.setPaintProperty(WALK_HALO_LAYER, "line-color", colors.destination);
    map.setPaintProperty(WALK_HALO_LAYER, "line-width", [
      "case",
      ["==", ["get", "id"], highlighted],
      11,
      0,
    ]);
    map.setPaintProperty(WALK_HALO_LAYER, "line-opacity", [
      "case",
      ["==", ["get", "id"], highlighted],
      1,
      0,
    ]);
  }
  map.setPaintProperty(WALK_LAYER, "line-opacity", [
    "case",
    ["==", ["get", "id"], highlighted],
    1,
    highlighted ? 0.28 : 0.9,
  ]);
  map.setPaintProperty(WALK_LAYER, "line-width", [
    "case",
    ["==", ["get", "id"], highlighted],
    4,
    3,
  ]);
  map.setPaintProperty(WALK_LAYER, "line-color", [
    "case",
    ["==", ["get", "id"], highlighted],
    colors.casing,
    ["get", "color"],
  ]);
}

/**
 * A walk sits above the stops from the moment the layers exist.
 *
 * Moving it there when a leg is chosen reorders the style and the
 * route blinks. At rest the halo has no width, so it covers nothing.
 */
function placeWalkAboveStops(map: MapLibreMap): void {
  if (!map.getLayer(WALK_LAYER) || !map.getLayer(MARKER_SOURCE_ID)) return;
  const order = map.getStyle().layers?.map((layer) => layer.id) ?? [];
  const walkAt = order.indexOf(WALK_LAYER);
  const markerAt = order.indexOf(MARKER_SOURCE_ID);
  if (walkAt < 0 || markerAt < 0 || walkAt > markerAt) return;
  if (map.getLayer(WALK_HALO_LAYER)) map.moveLayer(WALK_HALO_LAYER);
  map.moveLayer(WALK_LAYER);
}

/** Move a dash along every ride until `stop` is called. */
function runRouteFlow(map: MapLibreMap): () => void {
  let frame = 0;
  let stopped = false;
  let lastStep = -1;
  const origin = performance.now();

  const tick = (now: number): void => {
    if (stopped || document.hidden) return;
    if (map.getLayer(ROUTE_FLOW_LAYER)) {
      const step = routeFlowIndex(now - origin);
      // A new array every frame re-tessellates the ride. The dash only
      // needs to move when the step changes.
      if (step !== lastStep) {
        lastStep = step;
        map.setPaintProperty(ROUTE_FLOW_LAYER, "line-dasharray", routeFlowDash(now - origin));
      }
    }
    frame = requestAnimationFrame(tick);
  };

  const onVisibility = (): void => {
    if (stopped || document.hidden) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(tick);
  };

  document.addEventListener("visibilitychange", onVisibility);
  frame = requestAnimationFrame(tick);

  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

/** Leave the travelling dash invisible. The route underneath stays. */
function quietRouteFlow(map: MapLibreMap): void {
  if (!map.getLayer(ROUTE_FLOW_LAYER)) return;
  map.setPaintProperty(ROUTE_FLOW_LAYER, "line-opacity", 0);
}

/** Strong ease-in-out, cubic-bezier(0.77, 0, 0.175, 1). The camera moves on screen. */
function easeInOutStrong(t: number): number {
  return bezierY(t, 0.77, 0, 0.175, 1);
}

function bezierY(t: number, x1: number, y1: number, x2: number, y2: number): number {
  const sample = (u: number, a: number, b: number): number => {
    const v = 1 - u;
    return 3 * v * v * u * a + 3 * v * u * u * b + u * u * u;
  };
  const slope = (u: number, a: number, b: number): number => {
    const v = 1 - u;
    return 3 * v * v * a + 6 * v * u * (b - a) + 3 * u * u * (1 - b);
  };
  let u = t;
  for (let i = 0; i < 6; i += 1) {
    const x = sample(u, x1, x2) - t;
    const dx = slope(u, x1, x2);
    if (Math.abs(dx) < 1e-4) break;
    u = Math.min(1, Math.max(0, u - x / dx));
  }
  return sample(u, y1, y2);
}

function quietIncidentPulse(map: MapLibreMap): void {
  if (!map.getLayer(INCIDENT_PULSE_LAYER)) return;
  map.setPaintProperty(INCIDENT_PULSE_LAYER, "icon-opacity", 0);
}

/** The notice plate at rest, and a little larger when it is the one being read. */
function incidentBaseSize(station: string): ExpressionSpecification {
  return [
    "case",
    [
      "any",
      ["==", ["get", "selected"], 1],
      [
        "all",
        ["==", ["get", "kind"], "incident"],
        ["==", ["get", "stationId"], station],
        ["!=", station, ""],
      ],
    ],
    0.92,
    0.7,
  ];
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
