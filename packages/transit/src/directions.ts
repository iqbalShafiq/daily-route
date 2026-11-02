import type { TransitNetwork } from "./graph.js";
import { haversineKm } from "./geo.js";
import type { Direction } from "./types.js";

/**
 * One direction of one line, described the way a rider reads it.
 *
 * A line is not a single ordered list: each direction has its own stops and
 * its own path, and the two are not always the reverse of each other. The
 * label names the two ends so a rider knows which side to board.
 */
export type DirectionSummary = {
  lineId: string;
  direction: Direction;
  /** The first stop of this direction. */
  from: string;
  /** The last stop of this direction. */
  to: string;
  /** "Kali Besar → Blok M" */
  label: string;
  stopCount: number;
};

export function lineDirections(
  network: TransitNetwork,
  lineId: string,
): DirectionSummary[] {
  const directions: Direction[] = ["forward", "backward"];
  return directions
    .map((direction) => directionSummary(network, lineId, direction))
    .filter((entry): entry is DirectionSummary => entry !== null);
}

export function directionSummary(
  network: TransitNetwork,
  lineId: string,
  direction: Direction,
): DirectionSummary | null {
  const stops = network.lineStops
    .filter((stop) => stop.lineId === lineId && stop.direction === direction)
    .sort((a, b) => a.position - b.position);
  if (stops.length < 2) return null;
  const stationOf = (id: string) => network.stations.find((station) => station.id === id);
  const first = stationOf(stops[0]?.stationId ?? "");
  const last = stationOf(stops[stops.length - 1]?.stationId ?? "");
  if (!first || !last) return null;
  return {
    lineId,
    direction,
    from: first.name,
    to: last.name,
    label: `${first.name} → ${last.name}`,
    stopCount: stops.length,
  };
}

/**
 * The direction a notice means when it names the place the service heads to.
 *
 * "Arah Kota" on corridor 1 is the backward direction, because that is the
 * direction whose last stop is Kota. The answer is null when the named place
 * is not an end of any affected line, or when the lines disagree: a notice
 * that covers both directions must not be narrowed to one.
 */
export function directionTowards(
  network: TransitNetwork,
  lineIds: readonly string[],
  towards: string,
): Direction | null {
  const needle = normalizePlace(towards);
  if (!needle) return null;
  const found = new Set<Direction>();
  for (const lineId of lineIds) {
    for (const direction of ["forward", "backward"] as const) {
      if (endpointMatches(network, lineId, direction, needle)) found.add(direction);
    }
  }
  return found.size === 1 ? [...found][0] ?? null : null;
}

/**
 * The compass heading of the next stop from one station.
 *
 * A loop has no overall bearing, but at the station the notice names the
 * vehicle still leaves in one direction. This is the local test; it returns
 * null when the station is not on the line or the two directions disagree.
 */
export function directionAtStation(
  network: TransitNetwork,
  lineId: string,
  stationId: string,
  compass: Compass,
): Direction | null {
  const found = new Set<Direction>();
  for (const direction of ["forward", "backward"] as const) {
    const stops = network.lineStops
      .filter((stop) => stop.lineId === lineId && stop.direction === direction)
      .sort((a, b) => a.position - b.position);
    for (let index = 0; index < stops.length; index += 1) {
      const stop = stops[index];
      if (!stop || stop.stationId !== stationId) continue;
      // At the last stop the vehicle arrives from the previous one; the
      // heading is that arrival, not a reversal back down the line.
      const next = stops[index + 1];
      const previous = stops[index - 1];
      const fromStop = next ? stop : previous;
      const toStop = next ?? stop;
      if (!fromStop || !toStop) continue;
      const from = fromStop.platform ?? stationOf(network, fromStop.stationId);
      const to = toStop.platform ?? stationOf(network, toStop.stationId);
      if (!from || !to || haversineKm(from, to) < 0.1) continue;
      if (sectorOf(initialBearing(from, to)) === compass) found.add(direction);
    }
  }
  return found.size === 1 ? [...found][0] ?? null : null;
}

function endpointMatches(
  network: TransitNetwork,
  lineId: string,
  direction: Direction,
  needle: string,
): boolean {
  const stops = network.lineStops
    .filter((stop) => stop.lineId === lineId && stop.direction === direction)
    .sort((a, b) => a.position - b.position);
  const last = stops.at(-1);
  if (!last) return false;
  const station = stationOf(network, last.stationId);
  const names = [station?.name ?? "", ...(station?.aliases ?? [])];
  return names.some((name) => {
    const candidate = normalizePlace(stripGeneric(name));
    return (
      candidate.length > 0 &&
      (candidate === needle ||
        (candidate.length >= 3 && needle.includes(candidate)) ||
        (needle.length >= 3 && candidate.includes(needle)))
    );
  });
}

/** "Halte Harmoni" and "Harmoni" are the same place to a rider. */
function stripGeneric(value: string): string {
  return value.replace(/^(halte|stasiun|terminal|stop|station|bus stop)\s+/i, "").trim();
}

function sectorOf(bearing: number): Compass {
  return SECTORS[Math.round(bearing / 45) % 8] ?? "north";
}

function normalizePlace(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type Compass =
  | "north"
  | "south"
  | "east"
  | "west"
  | "northeast"
  | "northwest"
  | "southeast"
  | "southwest";

const SECTORS: readonly Compass[] = [
  "north",
  "northeast",
  "east",
  "southeast",
  "south",
  "southwest",
  "west",
  "northwest",
];

/**
 * The compass direction a line travels in one direction.
 *
 * Measured from the first stop to the last, not from the shape: a loop that
 * returns to where it started has no compass direction, and the caller gets
 * null rather than a guess.
 */
export function compassOfDirection(
  network: TransitNetwork,
  lineId: string,
  direction: Direction,
): Compass | null {
  const stops = network.lineStops
    .filter((stop) => stop.lineId === lineId && stop.direction === direction)
    .sort((a, b) => a.position - b.position);
  const firstStop = stops[0];
  const lastStop = stops.at(-1);
  if (!firstStop || !lastStop) return null;
  const first = firstStop.platform ?? stationOf(network, firstStop.stationId);
  const last = lastStop.platform ?? stationOf(network, lastStop.stationId);
  if (!first || !last) return null;
  const distance = haversineKm(first, last);
  if (distance < 0.3) return null;
  return sectorOf(initialBearing(first, last));
}

export function directionFromCompass(
  network: TransitNetwork,
  lineId: string,
  compass: Compass,
): Direction | null {
  const forward = compassOfDirection(network, lineId, "forward");
  const backward = compassOfDirection(network, lineId, "backward");
  if (forward === compass && backward !== compass) return "forward";
  if (backward === compass && forward !== compass) return "backward";
  return null;
}

/**
 * The platform each affected line is on, when the announcement names a
 * direction. A line whose direction cannot be read is left out: an unknown
 * platform must not narrow a notice.
 */
export function platformDirections(
  network: TransitNetwork,
  lineIds: readonly string[],
  input: {
    towards?: string | null;
    compass?: Compass | null;
    stationIds?: readonly string[];
  },
): { lineId: string; direction: Direction }[] {
  const resolved: { lineId: string; direction: Direction }[] = [];
  for (const lineId of lineIds) {
    let direction = input.towards
      ? directionTowards(network, [lineId], input.towards)
      : null;
    if (!direction && input.compass && input.stationIds?.length) {
      const local = new Set<Direction>();
      for (const stationId of input.stationIds) {
        const found = directionAtStation(network, lineId, stationId, input.compass);
        if (found) local.add(found);
      }
      direction = local.size === 1 ? [...local][0] ?? null : null;
    }
    if (!direction && input.compass) {
      direction = directionFromCompass(network, lineId, input.compass);
    }
    if (direction) resolved.push({ lineId, direction });
  }
  return resolved;
}

function stationOf(network: TransitNetwork, stationId: string) {
  return network.stations.find((station) => station.id === stationId) ?? null;
}

function initialBearing(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const delta = ((to.longitude - from.longitude) * Math.PI) / 180;
  const y = Math.sin(delta) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(delta);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
