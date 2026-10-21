import { haversineKm } from "@daily-route/transit";
import {
  distanceToSegmentKm,
  closestVertexIndexOnPolyline,
  nearestIndexOnPolyline,
  polylineLengthKm,
  toFlatCoordinates,
  type Coordinate,
  type LineGeometry,
} from "@daily-route/transit";

/**
 * Building a route's path from OpenStreetMap.
 *
 * A transit line is a route relation whose way members are the roads and
 * rails the vehicles actually travel on. Stitching those ways back together
 * produces the real path of the line, which is what makes the line drawn on
 * the map truthful rather than decorative.
 */

export type { Coordinate, LineGeometry };
export {
  closestVertexIndexOnPolyline,
  nearestIndexOnPolyline,
  polylineLengthKm,
  toFlatCoordinates,
};

/**
 * The distance below which two consecutive points are treated as one.
 *
 * A tenth of a metre is far below the accuracy of the source data and
 * removes the duplicates that a shared node creates.
 */
const DUPLICATE_TOLERANCE_KM = 0.0001;

/**
 * Stitch the way members of a relation into one polyline.
 */
export function stitchPolyline(
  ways: readonly { geometry: readonly Coordinate[] }[],
): Coordinate[] {
  const points: Coordinate[] = [];
  for (const way of ways) {
    appendWay(points, way.geometry);
  }
  return points;
}

/**
 * Append one way to a polyline, in whichever direction continues it.
 */
export function appendWay(points: Coordinate[], geometry: readonly Coordinate[]): void {
  if (geometry.length === 0) return;
  const first = geometry[0];
  const last = geometry[geometry.length - 1];
  if (!first || !last) return;

  let ordered = geometry;
  const current = points[points.length - 1];
  if (current) {
    const forwardGap = haversineKm(current, first);
    const backwardGap = haversineKm(current, last);
    if (backwardGap < forwardGap) {
      ordered = [...geometry].reverse();
    }
  }

  for (const point of ordered) {
    const previous = points[points.length - 1];
    if (previous && haversineKm(previous, point) <= DUPLICATE_TOLERANCE_KM) continue;
    points.push(point);
  }
}

/**
 * How far the stops of a line are from its path, at the worst.
 */
function missesStops(
  path: readonly Coordinate[],
  stops: readonly { latitude: number; longitude: number }[],
): boolean {
  if (path.length < 2) return true;
  for (const stop of stops) {
    if (distanceToPathKm(path, stop) > 0.5) return true;
  }
  return false;
}

/**
 * The distance from a point to the closest place on a path.
 */
export function distanceToPathKm(
  path: readonly Coordinate[],
  point: { latitude: number; longitude: number },
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

/**
 * The path through the stops themselves, in the order they are served.
 */
function pathThroughStops(
  stops: readonly { latitude: number; longitude: number }[],
): Coordinate[] {
  return stops.map((stop) => ({ latitude: stop.latitude, longitude: stop.longitude }));
}

/**
 * Simplify a polyline with the Douglas–Peucker algorithm.
 *
 * The tolerance is in kilometres. Three metres removes the zig-zag of a
 * city block without moving the line off the road it follows.
 */
export function simplifyPolyline(
  points: readonly Coordinate[],
  toleranceKm = 0.003,
): Coordinate[] {
  if (points.length < 3) return [...points];

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: [number, number][] = [[0, points.length - 1]];

  while (stack.length > 0) {
    const segment = stack.pop();
    if (!segment) break;
    const [start, end] = segment;
    if (end - start < 2) continue;

    const first = points[start];
    const last = points[end];
    if (!first || !last) continue;

    const lonScale = 111.32 * Math.cos((first.latitude * Math.PI) / 180);
    let farthestIndex = -1;
    let farthestDistance = 0;

    for (let index = start + 1; index < end; index += 1) {
      const point = points[index];
      if (!point) continue;
      const distance = distanceToSegmentKm(point, first, last, lonScale);
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthestIndex = index;
      }
    }

    if (farthestIndex !== -1 && farthestDistance > toleranceKm) {
      keep[farthestIndex] = 1;
      stack.push([start, farthestIndex], [farthestIndex, end]);
    }
  }

  return points.filter((_, index) => keep[index] === 1);
}

/**
 * Build the stored geometry of one direction of a line.
 *
 * Every stop is placed on the path by finding the closest point to it, so
 * the offsets hold even when the official stop list and the OpenStreetMap
 * relation disagree about the order.
 */
export function buildLineGeometry(input: {
  lineId: string;
  direction: "forward" | "backward";
  polyline: readonly Coordinate[];
  stops: readonly { latitude: number; longitude: number }[];
}): LineGeometry & { stopDistancesKm: number[] } {
  const simplified = simplifyPolyline(input.polyline);

  /*
   * A path that does not pass the stops is the wrong path.
   *
   * Some relations in OpenStreetMap are incomplete, or trace a stretch
   * that belongs to another line. A path whose stops are more than a
   * kilometre away from it is of no use: the line drawn on the map would
   * run on roads the vehicle never uses. The path is then the one
   * through the stops themselves, which is at least honest.
   */
  const path =
    missesStops(simplified, input.stops) ? pathThroughStops(input.stops) : simplified;
  const coordinates = toFlatCoordinates(path);

  /*
   * The offsets are made monotonic: a stop that lies off the path (a
   * temporary terminus, for instance) is placed at the closest point the
   * path offers, and never before the stop before it.
   *
   * The point itself is used, not the segment it falls in. The segment
   * start is one point before the stop, and a leg cut with it starts at
   * the stop before the one the rider boards at, and ends one point
   * short of the stop the rider gets off at.
   */
  const rawOffsets = input.stops.map((stop) =>
    closestVertexIndexOnPolyline(path, { latitude: stop.latitude, longitude: stop.longitude }),
  );
  const stopOffsets: number[] = [];
  let previousOffset = 0;
  for (const offset of rawOffsets) {
    const clamped = Math.min(Math.max(offset, previousOffset), Math.max(0, path.length - 1));
    stopOffsets.push(clamped);
    previousOffset = clamped;
  }

  // The distance a rider has travelled when the vehicle reaches a stop.
  // This is the distance along the real path, not through walls, so the
  // time the planner estimates is the time the vehicle actually needs.
  const stopDistancesKm: number[] = [];
  let travelled = 0;
  for (let index = 0; index < stopOffsets.length; index += 1) {
    const offset = stopOffsets[index] ?? 0;
    const previous = stopOffsets[index - 1];
    if (previous !== undefined && offset > previous) {
      // The stretch between the two stops. The next stop starts counting
      // from this one, so no stretch is counted twice.
      travelled += polylineLengthKm(path.slice(previous, offset + 1));
    }
    stopDistancesKm.push(Number(travelled.toFixed(3)));
  }

  return {
    lineId: input.lineId,
    direction: input.direction,
    coordinates,
    stopOffsets,
    stopDistancesKm,
    lengthKm: Number(polylineLengthKm(path).toFixed(3)),
  };
}
