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

/** How far the pedestrian router may snap a walk's end from the place it joins. */
const WALK_JOIN_KM = 0.12;

/** A gap below this is the same point; no join segment is added. */
const WALK_JOIN_EPSILON_KM = 0.002;

/**
 * Close a routed walk to the two places it joins.
 *
 * The pedestrian router snaps each end to the nearest footpath. A station
 * entrance that stands 40 m off that path leaves the walk line floating
 * away from the ride line it continues, and the rider reads a break in a
 * journey that has none. The gap is the forecourt between the platform and
 * the path, so the line is closed to the exact place: the first point is
 * the stop or the place, and the last is the other one.
 *
 * A router that answered from a street far away keeps its gap. A straight
 * line across a block is not a walk, and the map must not invent one.
 */
export function joinWalkEnds(
  geometry: readonly Coordinate[],
  from: Coordinate,
  to: Coordinate,
  maxKm: number = WALK_JOIN_KM,
): Coordinate[] {
  if (geometry.length < 2) return [];
  const first = geometry[0];
  const last = geometry[geometry.length - 1];
  if (!first || !last) return [];

  const points: Coordinate[] = [];
  const startGap = haversineKm(first, from);
  const endGap = haversineKm(last, to);
  if (startGap <= maxKm && startGap > WALK_JOIN_EPSILON_KM) {
    points.push({ latitude: from.latitude, longitude: from.longitude });
  }
  for (const point of geometry) {
    points.push({ latitude: point.latitude, longitude: point.longitude });
  }
  if (endGap <= maxKm && endGap > WALK_JOIN_EPSILON_KM) {
    points.push({ latitude: to.latitude, longitude: to.longitude });
  }
  return points;
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

/** Where a stop meets the path: the segment, how far along it, and the point. */
type PathFoot = {
  /** The index of the segment's first vertex. */
  index: number;
  /** How far along that segment the foot lies, from 0 to 1. */
  t: number;
  /** The foot itself, on the segment. */
  point: Coordinate;
  /** How far the stop stands from the path, in kilometres. */
  distanceKm: number;
};

/**
 * The part of a line between two stops, found on the path itself.
 *
 * The stored stop offsets are a single increasing index. On a loop whose
 * first stop is matched at the wrong end, that index pins every later
 * stop to the same place, and the leg drawn on the map is a short chord
 * that never reaches the station the rider gets off at. Cutting the path
 * at the two stops and keeping the stretch between them draws the rail
 * the vehicle actually travels.
 *
 * The cut is the foot of each stop on the nearest segment, not the
 * nearest vertex. A station often stands beside the path, between two
 * vertices, and the nearest vertex can be on the far side of it: the
 * Bundaran HI station is 91 m south of the first vertex of its rail, and
 * snapping to that vertex draws the train 91 m north of the platform
 * before it comes back. Cutting at the foot starts the line at the
 * station and leaves that vertex out.
 */
export function sliceGeometryNearStops(
  geometry: LineGeometry,
  from: Coordinate,
  to: Coordinate,
): Coordinate[] | null {
  const points = fromFlatCoordinates(geometry.coordinates);
  if (points.length < 2) return null;

  const fromFoot = footWithin(points, from, STOP_SNAP_KM);
  const toFoot = footWithin(points, to, STOP_SNAP_KM);
  if (!fromFoot || !toFoot) return null;

  const fromPosition = fromFoot.index + fromFoot.t;
  const toPosition = toFoot.index + toFoot.t;
  if (Math.abs(fromPosition - toPosition) < 1e-9) return null;

  const straightKm = haversineKm(from, to);
  const limitKm = Math.max(straightKm * 2.5, straightKm + 4);
  const isLoop = haversineKm(points[0] ?? from, points[points.length - 1] ?? to) <= STOP_SNAP_KM;

  // A ride that runs against the stored order is drawn back along the
  // same vertices; a loop whose joining station was passed continues
  // across the join instead, and that is the route the vehicle takes.
  const candidates: Coordinate[][] = [];
  if (isLoop && fromPosition > toPosition) {
    const wrap = wrapVertices(points, fromFoot, toFoot);
    if (wrap) candidates.push(joinFeet(from, fromFoot, wrap, toFoot, to));
  }
  const span =
    fromPosition < toPosition
      ? forwardVertices(points, fromFoot, toFoot)
      : backwardVertices(points, fromFoot, toFoot);
  candidates.push(joinFeet(from, fromFoot, span, toFoot, to));

  for (const candidate of candidates) {
    if (candidate.length < 2) continue;
    if (polylineLengthKm(candidate) > limitKm) continue;
    if (longestHopKm(candidate) > 2.5) continue;
    return candidate;
  }
  return null;
}

/**
 * Trim a path that is already ordered from one stop to the other.
 *
 * `ridePath` keeps the stored offset slice when its two ends land on the
 * stops, but that slice can still begin at a vertex past the boarding
 * stop. Trimming it with the same rule keeps the spur off the map and
 * makes the ends meet the stops exactly.
 */
export function clipSliceToStops(
  slice: readonly Coordinate[],
  from: Coordinate,
  to: Coordinate,
): Coordinate[] | null {
  if (slice.length < 2) return null;

  const fromFoot = footWithin(slice, from, STOP_SNAP_KM);
  const toFoot = footWithin(slice, to, STOP_SNAP_KM);
  if (!fromFoot || !toFoot) return null;

  const fromPosition = fromFoot.index + fromFoot.t;
  const toPosition = toFoot.index + toFoot.t;
  if (fromPosition >= toPosition) return null;

  return joinFeet(from, fromFoot, forwardVertices(slice, fromFoot, toFoot), toFoot, to);
}

/** The foot of a stop on the path, when it is close enough to be that stop. */
function footWithin(
  points: readonly Coordinate[],
  target: Coordinate,
  maxKm: number,
): PathFoot | null {
  const foot = footOnPolyline(points, target);
  return foot.distanceKm <= maxKm ? foot : null;
}

/**
 * The closest point of the path to a coordinate, on the segment itself.
 *
 * The foot is the point a rider would stand on, so the line is cut
 * there. Answering with the nearest vertex instead moves every cut to a
 * vertex that can be on the far side of the stop.
 */
function footOnPolyline(points: readonly Coordinate[], target: Coordinate): PathFoot {
  const lonScale = 111.32 * Math.cos((target.latitude * Math.PI) / 180);
  const latScale = 110.574;
  let best: PathFoot = {
    index: 0,
    t: 0,
    point: points[0] ?? target,
    distanceKm: Number.POSITIVE_INFINITY,
  };

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (!start || !end) continue;
    const ex = (end.longitude - start.longitude) * lonScale;
    const ey = (end.latitude - start.latitude) * latScale;
    const px = (target.longitude - start.longitude) * lonScale;
    const py = (target.latitude - start.latitude) * latScale;
    const lengthSquared = ex * ex + ey * ey;
    const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, (px * ex + py * ey) / lengthSquared));
    const distanceKm = Math.hypot(px - t * ex, py - t * ey);
    if (distanceKm < best.distanceKm) {
      best = {
        index,
        t,
        point: {
          latitude: start.latitude + (end.latitude - start.latitude) * t,
          longitude: start.longitude + (end.longitude - start.longitude) * t,
        },
        distanceKm,
      };
    }
  }

  return best;
}

/**
 * The vertices strictly between two feet, in the order the path runs.
 *
 * A vertex at a foot is not repeated: the foot itself is drawn there. A
 * station the vehicle passes without serving is between the two feet and
 * stays on the line.
 */
function forwardVertices(
  points: readonly Coordinate[],
  fromFoot: PathFoot,
  toFoot: PathFoot,
): Coordinate[] {
  const vertices: Coordinate[] = [];
  for (let index = fromFoot.index + 1; index <= toFoot.index; index += 1) {
    const point = points[index];
    if (point) vertices.push(point);
  }
  return vertices;
}

/** The vertices between two feet when the ride runs against the stored order. */
function backwardVertices(
  points: readonly Coordinate[],
  fromFoot: PathFoot,
  toFoot: PathFoot,
): Coordinate[] {
  const vertices: Coordinate[] = [];
  const start = fromFoot.t > 0 ? fromFoot.index : fromFoot.index - 1;
  for (let index = start; index >= toFoot.index + 1; index -= 1) {
    const point = points[index];
    if (point) vertices.push(point);
  }
  return vertices;
}

/**
 * The vertices that cross the join of a loop.
 *
 * The path of a loop is stored with its two ends at the same station, so
 * a ride that passes that station continues from the end back to the
 * start.
 */
function wrapVertices(
  points: readonly Coordinate[],
  fromFoot: PathFoot,
  toFoot: PathFoot,
): Coordinate[] | null {
  if (fromFoot.index + fromFoot.t <= toFoot.index + toFoot.t) return null;
  const vertices: Coordinate[] = [];
  for (let index = fromFoot.index + 1; index < points.length; index += 1) {
    const point = points[index];
    if (point) vertices.push(point);
  }
  for (let index = 0; index <= toFoot.index; index += 1) {
    const point = points[index];
    if (point) vertices.push(point);
  }
  return vertices;
}

/**
 * The drawn path: the boarding stop, the foot it stands beside, the road
 * between the two feet, the alighting foot, and the alighting stop.
 */
function joinFeet(
  from: Coordinate,
  fromFoot: PathFoot,
  vertices: readonly Coordinate[],
  toFoot: PathFoot,
  to: Coordinate,
): Coordinate[] {
  const path: Coordinate[] = [from];
  const push = (point: Coordinate): void => {
    const last = path[path.length - 1];
    if (last && haversineKm(last, point) < 0.001) return;
    path.push(point);
  };
  push(fromFoot.point);
  for (const vertex of vertices) push(vertex);
  push(toFoot.point);
  // The leg always ends on the alighting stop itself, not on the foot
  // beside it, so a ride line meets both of its stops.
  path.push(to);
  return path;
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

/**
 * The distance from a point to the closest place on a path.
 */
export function distanceToPathKm(
  path: readonly Coordinate[],
  point: Coordinate,
): number {
  const longitudeScale = 111.32 * Math.cos((point.latitude * Math.PI) / 180);
  let best = Number.POSITIVE_INFINITY;
  for (let index = 0; index < path.length - 1; index += 1) {
    const start = path[index];
    const end = path[index + 1];
    if (!start || !end) continue;
    const distance = distanceToSegmentKm(point, start, end, longitudeScale);
    if (distance < best) best = distance;
  }
  return best;
}
