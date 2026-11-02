/**
 * A diversion that keeps the vehicle but moves the path.
 *
 * The operator still runs line 9; the bus leaves the ordinary alignment,
 * follows another corridor or a named street, and rejoins later. The notice
 * is evidence. This module builds the temporary pattern the planner uses:
 * the served stops, the borrowed geometry, and the stops that are passed
 * without opening the doors.
 */

import { haversineKm } from "./geo.js";
import {
  fromFlatCoordinates,
  geometryKey,
  polylineLengthKm,
  sliceGeometry,
  toFlatCoordinates,
  type Coordinate,
  type LineGeometry,
} from "./geometry.js";
import type { TransitNetwork } from "./graph.js";
import { isActiveAt } from "./types.js";
import type { Direction, Disruption, Diversion, DiversionVia, LineStop } from "./types.js";

/**
 * One piece of a borrowed shape.
 *
 * A corridor piece takes the OSM path already stored for another line, so a
 * diversion that follows 6A is the 6A road, not a straight chord. A road
 * piece is the connector a router returned between two named places.
 */
export type DiversionShapeSegment =
  | {
      kind: "corridor";
      lineId: string;
      direction: Direction;
      fromStationId: string;
      toStationId: string;
    }
  | { kind: "road"; coordinates: Coordinate[] };

/** Compose a borrowed path from corridor slices and routed connectors. */
export function composeDiversionGeometry(
  network: TransitNetwork,
  segments: readonly DiversionShapeSegment[],
): Coordinate[] | null {
  const points: Coordinate[] = [];
  for (const segment of segments) {
    if (segment.kind === "road") {
      points.push(...segment.coordinates);
      continue;
    }
    const stops = network.lineStops
      .filter((stop) => stop.lineId === segment.lineId && stop.direction === segment.direction)
      .sort((left, right) => left.position - right.position);
    const from = stops.find((stop) => stop.stationId === segment.fromStationId);
    const to = stops.find((stop) => stop.stationId === segment.toStationId);
    const geometry = network.geometries?.find(
      (entry) => entry.lineId === segment.lineId && entry.direction === segment.direction,
    );
    if (!from || !to || !geometry) return null;
    points.push(...sliceGeometry(geometry, from.position, to.position));
  }
  return dedupeCoordinates(points).length >= 2 ? dedupeCoordinates(points) : null;
}

/** Read the stored `metadata.diversions` array without trusting its shape. */
export function diversionsFromMetadata(value: unknown): Diversion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): Diversion[] => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const lineId = typeof item["lineId"] === "string" ? item["lineId"] : null;
    const direction =
      item["direction"] === "forward" || item["direction"] === "backward"
        ? item["direction"]
        : null;
    const fromStationId =
      typeof item["fromStationId"] === "string" ? item["fromStationId"] : null;
    const toStationId =
      typeof item["toStationId"] === "string" ? item["toStationId"] : null;
    const geometry = pointsOf(item["geometry"]);
    if (!lineId || !direction || !fromStationId || !toStationId || geometry.length < 2) {
      return [];
    }
    const via: DiversionVia[] = Array.isArray(item["via"])
      ? item["via"].flatMap((viaEntry): DiversionVia[] => {
          if (!viaEntry || typeof viaEntry !== "object") return [];
          const point = viaEntry as Record<string, unknown>;
          const stationId =
            typeof point["stationId"] === "string" ? point["stationId"] : null;
          const name = typeof point["name"] === "string" ? point["name"] : null;
          if (!stationId || !name) return [];
          return [{ stationId, name, served: point["served"] === true }];
        })
      : [];
    const skippedStationIds = stringsOf(item["skippedStationIds"]);
    const viaLineCodes = stringsOf(item["viaLineCodes"]);
    return [
      {
        lineId,
        direction,
        fromStationId,
        toStationId,
        via,
        geometry,
        ...(viaLineCodes.length > 0 ? { viaLineCodes } : {}),
        ...(skippedStationIds.length > 0 ? { skippedStationIds } : {}),
        approximate: item["approximate"] === true,
        ...(typeof item["sourceUrl"] === "string" ? { sourceUrl: item["sourceUrl"] } : {}),
        ...(typeof item["quote"] === "string" ? { quote: item["quote"] } : {}),
      },
    ];
  });
}

function pointsOf(value: unknown): Coordinate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): Coordinate[] => {
    if (!entry || typeof entry !== "object") return [];
    const point = entry as Record<string, unknown>;
    const latitude = point["latitude"];
    const longitude = point["longitude"];
    if (typeof latitude !== "number" || typeof longitude !== "number") return [];
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    return [{ latitude, longitude }];
  });
}

function stringsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

/**
 * Apply every active diversion to the network before the planner sees it.
 *
 * A diversion is one temporary pattern of the same line: it is not a new
 * line and it is not a transfer. The vehicle keeps its identity and fare.
 */
export function withDiversions(
  network: TransitNetwork,
  disruptions: readonly Disruption[],
  at: Date = new Date(),
): TransitNetwork {
  const active = disruptions.filter(
    (disruption) =>
      disruption.status === "active" &&
      isActiveAt(disruption, at) &&
      (disruption.diversions?.length ?? 0) > 0,
  );
  if (active.length === 0) return network;

  const stations = new Map(network.stations.map((station) => [station.id, station]));
  let lineStops = [...network.lineStops];
  let geometries = [...(network.geometries ?? [])];
  const applied = new Set<string>();

  for (const disruption of active) {
    for (const diversion of disruption.diversions ?? []) {
      const key = geometryKey(diversion.lineId, diversion.direction);
      if (applied.has(key)) continue;

      const baseStops = lineStops
        .filter((stop) => stop.lineId === diversion.lineId && stop.direction === diversion.direction)
        .sort((left, right) => left.position - right.position);
      const fromIndex = baseStops.findIndex((stop) => stop.stationId === diversion.fromStationId);
      const toIndex = baseStops.findIndex((stop) => stop.stationId === diversion.toStationId);
      const baseGeometry = geometries.find((geometry) => geometryKey(geometry.lineId, geometry.direction) === key);
      if (fromIndex < 0 || toIndex <= fromIndex || !baseGeometry) continue;

      const fromOffset = baseGeometry.stopOffsets[fromIndex];
      const toOffset = baseGeometry.stopOffsets[toIndex];
      if (fromOffset === undefined || toOffset === undefined) continue;

      const servedVia = diversion.via.filter(
        (via) => via.served && stations.has(via.stationId) && via.stationId !== diversion.fromStationId && via.stationId !== diversion.toStationId,
      );
      const viaIds = new Set(servedVia.map((via) => via.stationId));
      const tail = baseStops.slice(toIndex).filter((stop) => !viaIds.has(stop.stationId));
      const newStops: LineStop[] = [
        ...baseStops.slice(0, fromIndex + 1),
        ...servedVia.map((via) => ({
          lineId: diversion.lineId,
          stationId: via.stationId,
          direction: diversion.direction,
          position: 0,
          distanceFromOriginKm: null,
        })),
        ...tail,
      ];

      const basePoints = fromFlatCoordinates(baseGeometry.coordinates);
      const before = basePoints.slice(0, fromOffset + 1);
      const after = basePoints.slice(toOffset);
      const combined = dedupeCoordinates([...before, ...diversion.geometry, ...after]);
      if (combined.length < 2) continue;

      let previousOffset = 0;
      const stopOffsets = newStops.map((stop) => {
        const station = stations.get(stop.stationId);
        if (!station) return previousOffset;
        const offset = nearestVertexAtOrAfter(combined, station, previousOffset);
        previousOffset = offset;
        return offset;
      });
      const distances = cumulativeKm(combined);

      lineStops = [
        ...lineStops.filter(
          (stop) => !(stop.lineId === diversion.lineId && stop.direction === diversion.direction),
        ),
        ...newStops.map((stop, index) => ({
          ...stop,
          position: index + 1,
          distanceFromOriginKm: Number((distances[stopOffsets[index] ?? 0] ?? 0).toFixed(3)),
        })),
      ];
      const geometry: LineGeometry = {
        lineId: diversion.lineId,
        direction: diversion.direction,
        coordinates: toFlatCoordinates(combined),
        stopOffsets,
        lengthKm: Number(polylineLengthKm(combined).toFixed(3)),
      };
      geometries = [
        ...geometries.filter(
          (entry) => !(entry.lineId === diversion.lineId && entry.direction === diversion.direction),
        ),
        geometry,
      ];
      applied.add(key);
    }
  }

  if (applied.size === 0) return network;
  return {
    ...network,
    lineStops,
    geometries,
    // A scheduled pattern would bypass the diverted base path. While the
    // diversion is active, the diverted base pattern is the truth.
    patterns: (network.patterns ?? []).filter(
      (pattern) => !applied.has(geometryKey(pattern.lineId, pattern.direction)),
    ),
  };
}

function dedupeCoordinates(points: readonly Coordinate[]): Coordinate[] {
  const result: Coordinate[] = [];
  for (const point of points) {
    const last = result[result.length - 1];
    if (last && haversineKm(last, point) < 0.002) continue;
    result.push(point);
  }
  return result;
}

function nearestVertexAtOrAfter(
  points: readonly Coordinate[],
  target: Coordinate,
  start: number,
): number {
  let best = Math.min(Math.max(start, 0), Math.max(0, points.length - 1));
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = best; index < points.length; index += 1) {
    const point = points[index];
    if (!point) continue;
    const distance = haversineKm(point, target);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

function cumulativeKm(points: readonly Coordinate[]): number[] {
  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    distances.push((distances[index - 1] ?? 0) + (previous && point ? haversineKm(previous, point) : 0));
  }
  return distances;
}
