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
 * The widest break that is still the same road.
 *
 * A relation often lists a short platform way at the terminus before the
 * rest of the route, or leaves a few hundred metres of a street unmapped.
 * Bridging that with the road's own next way is right. Bridging several
 * kilometres draws a line across the city that no vehicle travels, so a
 * break wider than a kilometre starts a separate chain and the chain that
 * is not the route is left out.
 */
const MAX_BRIDGE_KM = 1;

/**
 * Stitch the way members of a relation into one polyline.
 *
 * The members are not always in an order that can be followed. A way that
 * starts more than a kilometre from the path so far is not the next stretch
 * of the same road, and it is not joined to it.
 */
export function stitchPolyline(
  ways: readonly { geometry: readonly Coordinate[] }[],
): Coordinate[] {
  return stitchRoutePath(ways.map((way) => ({ id: null, geometry: way.geometry }))).points;
}

/**
 * Stitch the ways, and remember which way each point of the path came from.
 *
 * The road name of a stop is the name of the way the path runs on at the
 * stop, so the point and the way have to stay paired.
 */
export function stitchRoutePath(
  ways: readonly { id: number | null; geometry: readonly Coordinate[] }[],
): { points: Coordinate[]; wayIds: (number | null)[] } {
  const chains: { points: Coordinate[]; wayIds: (number | null)[] }[] = [];
  let points: Coordinate[] = [];
  let wayIds: (number | null)[] = [];

  const flush = (): void => {
    if (points.length === 0) return;
    chains.push({ points, wayIds });
    points = [];
    wayIds = [];
  };

  for (const way of ways) {
    if (way.geometry.length === 0) continue;
    const end = points[points.length - 1];
    if (end && gapTo(end, way.geometry) > MAX_BRIDGE_KM) flush();
    const ordered = orientTo(points[points.length - 1], way.geometry);
    appendChain(
      points,
      wayIds,
      ordered,
      ordered.map(() => way.id),
    );
  }
  flush();

  if (chains.length === 0) return { points: [], wayIds: [] };

  const ranked = chains
    .map((chain, index) => ({ chain, index, length: polylineLengthKm(chain.points) }))
    .sort((left, right) => right.length - left.length);

  const first = ranked[0];
  if (!first) return { points: [], wayIds: [] };

  let result = {
    points: [...first.chain.points],
    wayIds: [...first.chain.wayIds],
  };
  const used = new Set<number>([first.index]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const entry of ranked) {
      if (used.has(entry.index)) continue;
      const joined = joinIfClose(result, entry.chain);
      if (!joined) continue;
      result = joined;
      used.add(entry.index);
      grew = true;
    }
  }

  return result;
}

/** How far the nearer end of a way is from a point. */
function gapTo(end: Coordinate, geometry: readonly Coordinate[]): number {
  const first = geometry[0];
  const last = geometry[geometry.length - 1];
  if (!first || !last) return Number.POSITIVE_INFINITY;
  return Math.min(haversineKm(end, first), haversineKm(end, last));
}

/** Turn a way around when its far end is the one that continues the path. */
function orientTo(
  end: Coordinate | undefined,
  geometry: readonly Coordinate[],
): Coordinate[] {
  const first = geometry[0];
  const last = geometry[geometry.length - 1];
  if (!end || !first || !last) return [...geometry];
  if (haversineKm(end, last) < haversineKm(end, first)) return [...geometry].reverse();
  return [...geometry];
}

/**
 * Add a chain to whichever end of the path it actually meets.
 *
 * A platform way listed at the beginning of a relation often belongs at
 * the end of the route. It is moved there when its end sits on the path,
 * and it is dropped when it sits on a different part of the city.
 */
function joinIfClose(
  base: { points: Coordinate[]; wayIds: (number | null)[] },
  extra: { points: Coordinate[]; wayIds: (number | null)[] },
): { points: Coordinate[]; wayIds: (number | null)[] } | null {
  const start = base.points[0];
  const end = base.points[base.points.length - 1];
  const extraStart = extra.points[0];
  const extraEnd = extra.points[extra.points.length - 1];
  if (!start || !end || !extraStart || !extraEnd) return null;

  const forward = extra;
  const backward = {
    points: [...extra.points].reverse(),
    wayIds: [...extra.wayIds].reverse(),
  };
  const options = [
    { gap: haversineKm(end, extraStart), mode: "append" as const, chain: forward },
    { gap: haversineKm(end, extraEnd), mode: "append" as const, chain: backward },
    { gap: haversineKm(start, extraEnd), mode: "prepend" as const, chain: forward },
    { gap: haversineKm(start, extraStart), mode: "prepend" as const, chain: backward },
  ];

  let best = options[0];
  if (!best) return null;
  for (const option of options) {
    if (option.gap < best.gap) best = option;
  }
  if (best.gap > MAX_BRIDGE_KM) return null;

  if (best.mode === "append") {
    const points = [...base.points];
    const wayIds = [...base.wayIds];
    appendChain(points, wayIds, best.chain.points, best.chain.wayIds);
    return { points, wayIds };
  }

  const points = [...best.chain.points];
  const wayIds = [...best.chain.wayIds];
  appendChain(points, wayIds, base.points, base.wayIds);
  return { points, wayIds };
}

/** Append points, dropping a point that repeats the one before it. */
function appendChain(
  points: Coordinate[],
  wayIds: (number | null)[],
  extraPoints: readonly Coordinate[],
  extraWayIds: readonly (number | null)[],
): void {
  for (let index = 0; index < extraPoints.length; index += 1) {
    const point = extraPoints[index];
    if (!point) continue;
    const previous = points[points.length - 1];
    if (previous && haversineKm(previous, point) <= DUPLICATE_TOLERANCE_KM) continue;
    points.push(point);
    wayIds.push(extraWayIds[index] ?? null);
  }
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


/** The distance along the path at each stop, using the projected offsets. */
function pathDistancesKm(
  path: readonly Coordinate[],
  offsets: readonly number[],
): number[] {
  const distances: number[] = [];
  let travelled = 0;
  for (let index = 0; index < offsets.length; index += 1) {
    const offset = offsets[index] ?? 0;
    const previous = offsets[index - 1];
    if (previous !== undefined && offset > previous) {
      travelled += polylineLengthKm(path.slice(previous, offset + 1));
    }
    distances.push(Number(travelled.toFixed(3)));
  }
  return distances;
}

/**
 * True when a long run of stops shares one offset and those stops are far
 * apart. That is the signature of a path that stops short of the route: the
 * projection has nowhere else to put them. Two stops at the same terminus
 * are not such a run.
 */
export function hasClampedRun(
  offsets: readonly number[],
  stops: readonly { latitude: number; longitude: number }[],
): boolean {
  if (offsets.length < 3) return false;
  let start = 0;
  for (let index = 1; index <= offsets.length; index += 1) {
    if (index < offsets.length && offsets[index] === offsets[start]) continue;
    const length = index - start;
    const ratio = length / offsets.length;
    // Half the stops on one point is never a real stop list: the path
    // either loops back through them or never reaches them.
    if (ratio >= 0.5) return true;
    if (ratio >= 0.25) {
      const first = stops[start];
      const last = stops[index - 1];
      if (first && last && haversineKm(first, last) > 0.5) return true;
    }
    start = index;
  }
  return false;
}

/** Cumulative straight-line distance between consecutive stops. */
export function stopChainDistancesKm(
  stops: readonly { latitude: number; longitude: number }[],
): number[] {
  const distances = [0];
  let travelled = 0;
  for (let index = 1; index < stops.length; index += 1) {
    const previous = stops[index - 1];
    const current = stops[index];
    if (previous && current) travelled += haversineKm(previous, current);
    distances.push(Number(travelled.toFixed(3)));
  }
  return distances;
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
   * The road is the path. A stop that stands away from it does not
   * replace the road with straight lines between the stops: those lines
   * cross the city where no vehicle travels. The offsets of a stray
   * stop sit on the nearest point of the road instead.
   */
  const path = simplified.length > 1 ? simplified : pathThroughStops(input.stops);
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
  //
  // When the path does not reach most of the stops, the offset of every
  // stop after the gap lands on the same point and the along-path distance
  // stops growing. The road is still drawn, but the distance then follows
  // the stops themselves; a straight line between two stops is a better
  // estimate than a row of zeros.
  const stopDistancesKm = hasClampedRun(stopOffsets, input.stops)
    ? stopChainDistancesKm(input.stops)
    : pathDistancesKm(path, stopOffsets);

  return {
    lineId: input.lineId,
    direction: input.direction,
    coordinates,
    stopOffsets,
    stopDistancesKm,
    lengthKm: Number(polylineLengthKm(path).toFixed(3)),
  };
}
