import type { Direction, ServiceClass } from "./types.js";
import type { TransitNetwork } from "./graph.js";
import { directionSummary } from "./directions.js";

/**
 * A line drawn on the idle map.
 *
 * The coordinates are a flat `[longitude, latitude, …]` list of the
 * road the vehicles travel. The planner uses the same path.
 */

export type OverviewLine = {
  id: string;
  systemId: string;
  /** Trunk services stay visible across the city. Feeders appear when the map is closer. */
  tier: "primary" | "local";
  coordinates: number[];
  /** The direction this path travels; the map offsets the two sides. */
  direction: Direction;
  /** "Kali Besar → Blok M", the two ends of this direction. */
  label: string | null;
  /** True when the line has no geometry for the other direction. */
  oneWay: boolean;
};

/** A halte or stasiun of an operating line, light enough to draw as a symbol. */
export type OverviewPlace = {
  id: string;
  systemId: string;
  name: string;
  longitude: number;
  latitude: number;
};

const PRIMARY_SERVICES = new Set<ServiceClass>([
  "brt",
  "royaltrans",
  "rapid-transit",
  "lrt",
  "commuter-rail",
]);

/**
 * Every operating line, per direction.
 *
 * The map draws the forward side and offsets the backward side when the
 * camera is close, so the two sides of a road are visible without making
 * the city view twice as dense. A line with one geometry is one-way: it
 * has no other side to offset.
 */
export function networkOverview(network: TransitNetwork): OverviewLine[] {
  const lines = new Map(network.lines.map((line) => [line.id, line]));
  const directionsOf = new Map<string, Set<Direction>>();
  for (const geometry of network.geometries ?? []) {
    const set = directionsOf.get(geometry.lineId) ?? new Set<Direction>();
    set.add(geometry.direction);
    directionsOf.set(geometry.lineId, set);
  }
  const overview: OverviewLine[] = [];
  for (const geometry of network.geometries ?? []) {
    const line = lines.get(geometry.lineId);
    if (!line || line.status !== "operating") continue;
    if (geometry.coordinates.length < 4) continue;
    const local = !PRIMARY_SERVICES.has(line.serviceClass);
    overview.push({
      id: geometry.lineId,
      systemId: line.systemId,
      tier: local ? "local" : "primary",
      coordinates: geometry.coordinates,
      direction: geometry.direction,
      label: directionSummary(network, geometry.lineId, geometry.direction)?.label ?? null,
      oneWay: (directionsOf.get(geometry.lineId)?.size ?? 0) < 2,
    });
  }
  return overview;
}

/**
 * Every halte and stasiun that an operating line actually serves.
 *
 * A place that only a planned line names is left out, and so is a station
 * that no line stops at. The idle map draws these; the planner does not.
 */
export function networkPlaces(network: TransitNetwork): OverviewPlace[] {
  const open = new Set(
    network.lines.filter((line) => line.status === "operating").map((line) => line.id),
  );
  const served = new Set<string>();
  for (const stop of network.lineStops) {
    if (open.has(stop.lineId)) served.add(stop.stationId);
  }
  const places: OverviewPlace[] = [];
  for (const station of network.stations) {
    if (!served.has(station.id)) continue;
    if (!Number.isFinite(station.longitude) || !Number.isFinite(station.latitude)) continue;
    places.push({
      id: station.id,
      systemId: station.systemId,
      name: station.name,
      longitude: station.longitude,
      latitude: station.latitude,
    });
  }
  return places;
}

/** Keep at most `maxPoints` vertices, including both ends. */
export function decimateFlat(flat: readonly number[], maxPoints: number): number[] {
  const count = Math.floor(flat.length / 2);
  if (count <= 1 || maxPoints < 2) return [];
  if (count <= maxPoints) return flat.slice(0, count * 2);
  const out: number[] = [];
  const last = count - 1;
  for (let step = 0; step < maxPoints; step += 1) {
    const index = Math.round((step * last) / (maxPoints - 1));
    out.push(flat[index * 2] ?? 0, flat[index * 2 + 1] ?? 0);
  }
  return out;
}

/**
 * The boarding points of the operating network, one per side of the road.
 *
 * A station is one place in the search; the map needs the platform when the
 * rider is close enough to see which side the vehicle stops on. Duplicates
 * (the same platform used by several lines) collapse to one point.
 */
export type OverviewPlatform = {
  id: string;
  systemId: string;
  name: string;
  code: string | null;
  lineCode: string;
  direction: Direction;
  longitude: number;
  latitude: number;
};

export function networkPlatforms(network: TransitNetwork): OverviewPlatform[] {
  const lineOf = new Map(network.lines.map((line) => [line.id, line]));
  const stationOf = new Map(network.stations.map((station) => [station.id, station]));
  const seen = new Set<string>();
  const platforms: OverviewPlatform[] = [];
  for (const stop of network.lineStops) {
    const platform = stop.platform;
    const line = lineOf.get(stop.lineId);
    const station = stationOf.get(stop.stationId);
    if (!platform || !line || !station || line.status !== "operating") continue;
    if (seen.has(platform.id)) continue;
    seen.add(platform.id);
    platforms.push({
      id: platform.id,
      systemId: line.systemId,
      name: platform.name,
      code: platform.code,
      lineCode: line.code,
      direction: stop.direction,
      longitude: platform.longitude,
      latitude: platform.latitude,
    });
  }
  return platforms;
}
