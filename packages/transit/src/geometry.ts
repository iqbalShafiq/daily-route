import { haversineKm } from "./geo.js";

/**
 * Route geometry.
 *
 * A line's real path is stored once per direction: the flat list of
 * coordinates the vehicles travel, and the index of every stop along it.
 * The planner slices that path per leg, so the line drawn on the map is the
 * road the bus actually drives on.
 */

export type Coordinate = { latitude: number; longitude: number };

/** The geometry of one line in one direction. */
export type LineGeometry = {
  lineId: string;
  direction: "forward" | "backward";
  /** Flat `[longitude, latitude, …]` pairs. */
  coordinates: number[];
  /** The index in `coordinates` of every stop, parallel to the line's stops. */
  stopOffsets: number[];
  lengthKm: number;
};

/** The key a geometry is stored under. */
export function geometryKey(lineId: string, direction: string): string {
  return `${lineId}:${direction}`;
}

/** Convert a polyline into the flat array the database stores. */
export function toFlatCoordinates(points: readonly Coordinate[]): number[] {
  const flat: number[] = [];
  for (const point of points) {
    flat.push(Number(point.longitude.toFixed(6)), Number(point.latitude.toFixed(6)));
  }
  return flat;
}

/** Convert the flat array back into points. */
export function fromFlatCoordinates(flat: readonly number[]): Coordinate[] {
  const points: Coordinate[] = [];
  for (let index = 0; index + 1 < flat.length; index += 2) {
    const longitude = flat[index];
    const latitude = flat[index + 1];
    if (longitude === undefined || latitude === undefined) continue;
    points.push({ latitude, longitude });
  }
  return points;
}

/** The length of a polyline in kilometres. */
export function polylineLengthKm(points: readonly Coordinate[]): number {
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    if (!from || !to) continue;
    total += haversineKm(from, to);
  }
  return total;
}

/**
 * The part of a line between two of its stops.
 *
 * The stops are given as their position on the line, and the geometry is
 * sliced between the matching offsets. The result always contains the two
 * ends, so a leg is never a bare line.
 */
export function sliceGeometry(
  geometry: LineGeometry,
  fromPosition: number,
  toPosition: number,
): Coordinate[] {
  const points = fromFlatCoordinates(geometry.coordinates);
  if (points.length === 0) return [];

  const from = geometry.stopOffsets[fromPosition - 1];
  const to = geometry.stopOffsets[toPosition - 1];
  if (from === undefined || to === undefined) return points;

  const start = Math.min(from, to);
  const end = Math.max(from, to);
  const slice = points.slice(start, end + 1);

  return from <= to ? slice : [...slice].reverse();
}

/**
 * How far a stop may stand from the stored path and still be on it.
 *
 * A platform sits beside the rail, not on the centre of the track. Half a
 * kilometre is enough for that, and not enough to accept a vertex on a
 * different part of the line.
 */
const STOP_SNAP_KM = 0.5;

/**
 * The part of a line between two stops, found on the path itself.
 *
 * The stored stop offsets are a single increasing index. On a loop whose
 * first stop is matched at the wrong end, that index pins every later
 * stop to the same place, and the leg drawn on the map is a short chord
 * that never reaches the station the rider gets off at. Snapping the two
 * stops to the path and keeping the short stretch between them draws the
 * rail the vehicle actually travels.
 */
export function sliceGeometryNearStops(
  geometry: LineGeometry,
  from: Coordinate,
  to: Coordinate,
): Coordinate[] | null {
  const points = fromFlatCoordinates(geometry.coordinates);
  if (points.length < 2) return null;

  const fromIndex = vertexWithin(points, from, STOP_SNAP_KM);
  const toIndex = vertexWithin(points, to, STOP_SNAP_KM);
  if (fromIndex === null || toIndex === null || fromIndex === toIndex) return null;

  const straightKm = haversineKm(from, to);
  const limitKm = Math.max(straightKm * 2.5, straightKm + 4);
  const candidates = [sliceBetween(points, fromIndex, toIndex)];
  if (haversineKm(points[0] ?? from, points[points.length - 1] ?? to) <= STOP_SNAP_KM) {
    candidates.push(wrapBetween(points, fromIndex, toIndex));
  }

  let best: Coordinate[] | null = null;
  let bestMiss = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (candidate.length < 2) continue;
    const lengthKm = polylineLengthKm(candidate);
    if (lengthKm > limitKm) continue;
    if (longestHopKm(candidate) > 2.5) continue;
    const miss = haversineKm(candidate[0] ?? from, from) + haversineKm(candidate[candidate.length - 1] ?? to, to);
    if (miss > STOP_SNAP_KM * 2) continue;
    if (miss < bestMiss) {
      best = candidate;
      bestMiss = miss;
    }
  }
  if (!best) return null;

  const anchored = [...best];
  const start = anchored[0];
  const end = anchored[anchored.length - 1];
  if (start && haversineKm(start, from) > 0.02) anchored.unshift(from);
  if (end && haversineKm(end, to) > 0.02) anchored.push(to);
  return anchored;
}

/** The closest vertex, when it is close enough to be the same place. */
function vertexWithin(
  points: readonly Coordinate[],
  target: Coordinate,
  maxKm: number,
): number | null {
  const index = closestVertexIndexOnPolyline(points, target);
  const point = points[index];
  if (!point || haversineKm(point, target) > maxKm) return null;
  return index;
}

/** The stretch of a path from one vertex to another, in that direction. */
function sliceBetween(points: readonly Coordinate[], fromIndex: number, toIndex: number): Coordinate[] {
  if (fromIndex <= toIndex) return points.slice(fromIndex, toIndex + 1);
  return points.slice(toIndex, fromIndex + 1).reverse();
}

/**
 * The stretch that crosses the join of a loop.
 *
 * The path of a loop is stored with its two ends at the same station, so
 * a ride that passes that station continues from the end back to the start.
 */
function wrapBetween(points: readonly Coordinate[], fromIndex: number, toIndex: number): Coordinate[] {
  if (fromIndex <= toIndex) return [];
  return [...points.slice(fromIndex), ...points.slice(0, toIndex + 1)];
}

/** The longest single step of a path. A long step is a line across the city. */
function longestHopKm(points: readonly Coordinate[]): number {
  let longest = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (!start || !end) continue;
    const hop = haversineKm(start, end);
    if (hop > longest) longest = hop;
  }
  return longest;
}

/**
 * The perpendicular distance from a point to a segment, in kilometres.
 */
export function distanceToSegmentKm(
  point: Coordinate,
  start: Coordinate,
  end: Coordinate,
  longitudeScale: number,
): number {
  const latScale = 110.574;
  const lonScale = longitudeScale;

  const px = (point.longitude - start.longitude) * lonScale;
  const py = (point.latitude - start.latitude) * latScale;
  const ex = (end.longitude - start.longitude) * lonScale;
  const ey = (end.latitude - start.latitude) * latScale;

  const lengthSquared = ex * ex + ey * ey;
  if (lengthSquared === 0) return Math.hypot(px, py);

  const t = Math.min(1, Math.max(0, (px * ex + py * ey) / lengthSquared));
  return Math.hypot(px - t * ex, py - t * ey);
}

/**
 * The index of the point of the polyline that is closest to a coordinate.
 *
 * Unlike `nearestIndexOnPolyline`, which answers with the segment the
 * coordinate falls in, this answers with the point itself. A stop stands
 * on the road the vehicle travels, so the place where the line is cut
 * has to be the point of the path nearest to the stop, not the point
 * before it. Answering with the segment start shifts every cut one
 * point backwards, and the leg that is drawn starts at the wrong stop.
 */
export function nearestIndexOnPolyline(
  points: readonly Coordinate[],
  target: Coordinate,
): number {
  if (points.length === 0) return 0;
  if (points.length === 1) return 0;

  const lonScale = 111.32 * Math.cos((target.latitude * Math.PI) / 180);
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (!start || !end) continue;
    const distance = distanceToSegmentKm(target, start, end, lonScale);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
}

/**
 * The index of the vertex of the polyline that is closest to a coordinate.
 */
export function closestVertexIndexOnPolyline(
  points: readonly Coordinate[],
  target: Coordinate,
): number {
  if (points.length === 0) return 0;
  if (points.length === 1) return 0;

  const lonScale = 111.32 * Math.cos((target.latitude * Math.PI) / 180);
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (!point) continue;
    const dx = (point.longitude - target.longitude) * lonScale;
    const dy = (point.latitude - target.latitude) * 110.574;
    const distance = Math.hypot(dx, dy);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
}
