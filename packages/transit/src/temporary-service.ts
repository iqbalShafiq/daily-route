/**
 * Temporary service overlays.
 *
 * An operator can add a shuttle, a short-turn or a replacement corridor for
 * a bounded period. The announcement is evidence; the committed network is
 * not rewritten. This module turns a validated `TemporaryService` record into
 * a normal `Line` in a copied network, so the planner, the map and the agent
 * tools all see one kind of object.
 *
 * Stops must already exist in the network. A coordinate, a station id and a
 * headway are never invented here; an unresolved name is rejected before the
 * record reaches this function.
 */

import { geometryKey, polylineLengthKm, toFlatCoordinates, type LineGeometry } from "./geometry.js";
import { haversineKm } from "./geo.js";
import type { TransitNetwork } from "./graph.js";
import type {
  Direction,
  Line,
  LineService,
  LineServiceWindow,
  LineStop,
  Station,
  TemporaryService,
} from "./types.js";

/** A stable line id for a temporary service. */
export function temporaryLineId(serviceId: string): string {
  return `temp:${serviceId}`;
}

/** Whether a temporary service may be considered by the planner at all. */
export function temporaryServiceIsCurrent(service: TemporaryService, now = new Date()): boolean {
  if (service.status !== "active") return false;
  if (service.endsAt) {
    const end = Date.parse(service.endsAt);
    if (!Number.isNaN(end) && end < now.getTime()) return false;
  }
  return service.directions.length > 0;
}

/**
 * Apply every current temporary service to the network.
 *
 * This is deliberately additive: no permanent line is removed and no stop is
 * created. The service's own start/end validity is read by `serviceAt`, so a
 * journey planned for a future date can use it while a journey planned today
 * cannot.
 */
export function withTemporaryServices(
  network: TransitNetwork,
  services: readonly TemporaryService[],
  now = new Date(),
): TransitNetwork {
  const current = services.filter((service) => temporaryServiceIsCurrent(service, now));
  if (current.length === 0) return network;

  const stations = new Map(network.stations.map((station) => [station.id, station]));
  const lines = [...network.lines];
  const lineStops = [...network.lineStops];
  const geometries = [...(network.geometries ?? [])];
  const seenLines = new Set(lines.map((line) => line.id));

  for (const service of current) {
    const lineId = temporaryLineId(service.id);
    if (seenLines.has(lineId)) continue;

    const directions = buildDirections(service, stations);
    if (directions.length === 0) continue;

    const byDirection: Partial<Record<Direction, LineServiceWindow[]>> = {};
    const reliableByDirection: Partial<Record<Direction, boolean>> = {};
    const allStops: LineStop[] = [];
    let lengthKm = 0;
    for (const entry of directions) {
      byDirection[entry.direction] = entry.windows;
      reliableByDirection[entry.direction] = true;
      lengthKm += entry.lengthKm;
      allStops.push(...entry.stops);
      geometries.push(entry.geometry);
    }

    const serviceMetadata: LineService = {
      source: "temporary",
      timezone: "Asia/Jakarta",
      byDirection,
      reliableByDirection,
      validFrom: service.startsAt,
      ...(service.endsAt ? { validUntil: service.endsAt } : {}),
      updatedAt: new Date().toISOString(),
    };

    const line: Line = {
      id: lineId,
      systemId: service.systemId,
      code: service.code,
      name: service.name,
      mode: service.mode,
      serviceClass: service.serviceClass,
      operator: service.operator,
      status: "operating",
      color: service.color,
      lengthKm: Number(lengthKm.toFixed(2)),
      description: `Temporary service announced on ${service.source.publishedAt}.`,
      aliases: [service.code, service.name],
      metadata: {
        temporary: true,
        temporaryServiceId: service.id,
        eventKey: service.eventKey,
        startsAt: service.startsAt,
        ...(service.endsAt ? { endsAt: service.endsAt } : {}),
        ...(service.reviewAt ? { reviewAt: service.reviewAt } : {}),
        source: service.source,
        confidence: service.confidence,
        headwayEstimated: service.metadata["headwayEstimated"] === true,
        service: serviceMetadata,
      },
    };

    lines.push(line);
    lineStops.push(...allStops);
    seenLines.add(lineId);
  }

  return { ...network, lines, lineStops, geometries };
}

type BuiltDirection = {
  direction: Direction;
  stops: LineStop[];
  windows: LineServiceWindow[];
  geometry: LineGeometry;
  lengthKm: number;
};

function buildDirections(
  service: TemporaryService,
  stations: ReadonlyMap<string, Station>,
): BuiltDirection[] {
  const built: BuiltDirection[] = [];
  for (const direction of service.directions) {
    const stationIds = withoutConsecutiveDuplicates(direction.stationIds);
    if (stationIds.length < 2) continue;
    const points: Station[] = [];
    for (const stationId of stationIds) {
      const station = stations.get(stationId);
      if (!station) break;
      points.push(station);
    }
    if (points.length !== stationIds.length) continue;

    let distanceKm = 0;
    const stops: LineStop[] = points.map((station, index) => {
      if (index > 0) {
        const previous = points[index - 1];
        if (previous) distanceKm += haversineKm(previous, station);
      }
      return {
        lineId: temporaryLineId(service.id),
        stationId: station.id,
        direction: direction.direction,
        position: index + 1,
        distanceFromOriginKm: Number(distanceKm.toFixed(3)),
      };
    });
    const pointsOfLine = points.map((station) => ({
      latitude: station.latitude,
      longitude: station.longitude,
    }));
    const geometry: LineGeometry = {
      lineId: temporaryLineId(service.id),
      direction: direction.direction,
      coordinates: toFlatCoordinates(pointsOfLine),
      stopOffsets: points.map((_, index) => index),
      lengthKm: Number(polylineLengthKm(pointsOfLine).toFixed(3)),
    };
    built.push({
      direction: direction.direction,
      stops,
      windows: direction.windows,
      geometry,
      lengthKm: geometry.lengthKm,
    });
  }
  return built;
}

function withoutConsecutiveDuplicates(values: readonly string[]): string[] {
  const unique: string[] = [];
  for (const value of values) {
    if (unique[unique.length - 1] === value) continue;
    unique.push(value);
  }
  return unique;
}

/** The geometry keys a temporary line owns, for callers that prune old layers. */
export function temporaryGeometryKeys(service: TemporaryService): string[] {
  const lineId = temporaryLineId(service.id);
  return service.directions.map((direction) => geometryKey(lineId, direction.direction));
}
