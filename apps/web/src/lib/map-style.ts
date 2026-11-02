import type { StyleSpecification } from "maplibre-gl";

import baseStyle from "./map-style-base.json";

/**
 * The map style.
 *
 * OpenFreeMap serves OpenMapTiles vector tiles without an API key, with no
 * request limit and no registration. The basemap is recoloured from the
 * design tokens at runtime, so the map is the same paper as the panels and
 * follows the theme without a second style document.
 */

type MutableLayer = {
  id: string;
  type: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
};

type MutableStyle = {
  version: 8;
  sources: Record<string, unknown>;
  sprite?: string;
  glyphs?: string;
  layers: MutableLayer[];
};

const base = baseStyle as unknown as MutableStyle;

type MapTokens = {
  bg: string;
  park: string;
  water: string;
  wood: string;
  residential: string;
  building: string;
  buildingLine: string;
  road: string;
  roadCasing: string;
  roadMinor: string;
  roadSubtle: string;
  motorway: string;
  motorwayCasing: string;
  rail: string;
  boundary: string;
  label: string;
  halo: string;
  waterLabel: string;
  roadLabel: string;
};

function tokens(): MapTokens | null {
  if (typeof document === "undefined") return null;
  const style = getComputedStyle(document.documentElement);
  const read = (name: string): string => style.getPropertyValue(name).trim();
  const bg = read("--map-bg");
  if (!bg) return null;
  return {
    bg,
    park: read("--map-park"),
    water: read("--map-water"),
    wood: read("--map-wood"),
    residential: read("--map-residential"),
    building: read("--map-building"),
    buildingLine: read("--map-building-line"),
    road: read("--map-road"),
    roadCasing: read("--map-road-casing"),
    roadMinor: read("--map-road-minor"),
    roadSubtle: read("--map-road-subtle"),
    motorway: read("--map-motorway"),
    motorwayCasing: read("--map-motorway-casing"),
    rail: read("--map-rail"),
    boundary: read("--map-boundary"),
    label: read("--map-label"),
    halo: read("--map-label-halo"),
    waterLabel: read("--map-water-label"),
    roadLabel: read("--map-road-label"),
  };
}

function setPaint(layer: MutableLayer | undefined, property: string, value: unknown): void {
  if (!layer) return;
  layer.paint = { ...(layer.paint ?? {}), [property]: value };
}

function setLayout(layer: MutableLayer | undefined, property: string, value: unknown): void {
  if (!layer) return;
  layer.layout = { ...(layer.layout ?? {}), [property]: value };
}

/** The paper basemap, recoloured from the interface tokens. */
export function mapStyleFor(_theme: "light" | "dark"): StyleSpecification {
  const color = tokens();
  if (!color) return base as unknown as StyleSpecification;

  const style = structuredClone(base);
  const byId = new Map(style.layers.map((layer) => [layer.id, layer]));
  const layer = (id: string): MutableLayer | undefined => byId.get(id);

  setPaint(layer("background"), "background-color", color.bg);
  setPaint(layer("park"), "fill-color", color.park);
  setPaint(layer("water"), "fill-color", color.water);
  setPaint(layer("waterway"), "line-color", color.water);
  setPaint(layer("landcover_wood"), "fill-color", color.wood);
  setPaint(layer("landuse_residential"), "fill-color", color.residential);
  setPaint(layer("building"), "fill-color", color.building);
  setPaint(layer("building"), "fill-outline-color", color.buildingLine);
  setPaint(layer("road_area_pier"), "fill-color", color.road);
  setPaint(layer("road_pier"), "line-color", color.road);

  for (const id of [
    "tunnel_motorway_casing",
    "highway_motorway_casing",
    "highway_motorway_bridge_casing",
    "highway_major_casing",
  ]) {
    setPaint(layer(id), "line-color", color.motorwayCasing);
    setPaint(layer(id), "line-opacity", 1);
  }

  for (const id of [
    "tunnel_motorway_inner",
    "highway_motorway_inner",
    "highway_motorway_bridge_inner",
  ]) {
    setPaint(layer(id), "line-color", color.motorway);
  }

  setPaint(layer("highway_major_inner"), "line-color", color.road);
  setPaint(layer("highway_major_subtle"), "line-color", color.roadSubtle);
  setPaint(layer("highway_motorway_subtle"), "line-color", color.roadSubtle);
  setPaint(layer("highway_minor"), "line-color", color.roadMinor);
  setPaint(layer("highway_path"), "line-color", color.roadSubtle);

  for (const id of [
    "railway_transit",
    "railway_service",
    "railway",
  ]) {
    setPaint(layer(id), "line-color", color.rail);
  }
  for (const id of [
    "railway_transit_dashline",
    "railway_service_dashline",
    "railway_dashline",
  ]) {
    setPaint(layer(id), "line-color", color.halo);
  }

  for (const id of ["boundary_3", "boundary_2", "boundary_disputed"]) {
    setPaint(layer(id), "line-color", color.boundary);
  }

  setPaint(layer("aeroway-taxiway"), "line-color", color.roadCasing);
  setPaint(layer("aeroway-runway-casing"), "line-color", color.roadCasing);
  setPaint(layer("aeroway-runway"), "line-color", color.roadCasing);
  setPaint(layer("aeroway-area"), "fill-color", color.roadCasing);

  const labelLayers = [
    "waterway_line_label",
    "water_name_point_label",
    "water_name_line_label",
  ];
  for (const id of labelLayers) {
    setPaint(layer(id), "text-color", color.waterLabel);
    setPaint(layer(id), "text-halo-color", color.halo);
  }

  const roadLabels = ["highway-name-path", "highway-name-minor", "highway-name-major"];
  for (const id of roadLabels) {
    setPaint(layer(id), "text-color", color.roadLabel);
    setPaint(layer(id), "text-halo-color", color.halo);
    setPaint(layer(id), "text-halo-width", 1.2);
  }

  const placeLabels = [
    "airport",
    "label_other",
    "label_village",
    "label_town",
    "label_state",
    "label_city",
    "label_city_capital",
    "label_country_3",
    "label_country_2",
    "label_country_1",
  ];
  for (const id of placeLabels) {
    setPaint(layer(id), "text-color", color.label);
    setPaint(layer(id), "text-halo-color", color.halo);
    setPaint(layer(id), "text-halo-width", 1.4);
  }

  for (const id of ["label_city", "label_city_capital", "label_state", "label_other"]) {
    setLayout(layer(id), "text-transform", "uppercase");
    setLayout(layer(id), "text-letter-spacing", 0.08);
  }

  setLayout(layer("label_city"), "text-size", [
    "interpolate",
    ["exponential", 1.2],
    ["zoom"],
    4,
    11,
    7,
    13,
    11,
    16,
  ]);
  setLayout(layer("label_city_capital"), "text-size", [
    "interpolate",
    ["exponential", 1.2],
    ["zoom"],
    4,
    12,
    7,
    14,
    11,
    17,
  ]);
  setLayout(layer("label_town"), "text-letter-spacing", 0.02);
  setLayout(layer("label_village"), "text-letter-spacing", 0.02);

  return style as unknown as StyleSpecification;
}

/** The starting view: Greater Jakarta, centred between the city core and the east. */
export const JAKARTA_VIEW = {
  center: { longitude: 106.83, latitude: -6.21 },
  zoom: 10.5,
};

/** The bounding box of the whole network, used when a route is not focused. */
export const JAKARTA_BOUNDS = {
  minLongitude: 106.6,
  minLatitude: -6.42,
  maxLongitude: 107.25,
  maxLatitude: -5.95,
};
