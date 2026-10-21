import { haversineKm } from "@daily-route/transit";
import {
  distanceToSegmentKm,
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
export { nearestIndexOnPolyline, polylineLengthKm, toFlatCoordinates };

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
  const coordinates = toFlatCoordinates(simplified);

  // The offsets are made monotonic: a stop that lies off the path (a
  // temporary terminus, for instance) is placed at the closest point the
  // path offers, and never before the stop before it.
  const rawOffsets = input.stops.map((stop) =>
    nearestIndexOnPolyline(simplified, { latitude: stop.latitude, longitude: stop.longitude }),
  );
  const stopOffsets: number[] = [];
  let previousOffset = 0;
  for (const offset of rawOffsets) {
    const clamped = Math.min(Math.max(offset, previousOffset), Math.max(0, simplified.length - 1));
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
      travelled += polylineLengthKm(simplified.slice(previous, offset + 1));
    }
    stopDistancesKm.push(Number(travelled.toFixed(3)));
  }

  return {
    lineId: input.lineId,
    direction: input.direction,
    coordinates,
    stopOffsets,
    stopDistancesKm,
    lengthKm: Number(polylineLengthKm(simplified).toFixed(3)),
  };
}
