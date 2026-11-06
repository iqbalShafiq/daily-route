import { distanceToPathKm, type Coordinate } from "./geometry.js";
import { haversineKm, walkingMinutes } from "./geo.js";

/**
 * A pedestrian bridge (JPO), skywalk, or an OpenStreetMap footbridge.
 *
 * The official DKI Jakarta dataset is a point per bridge; OpenStreetMap
 * holds the line. A record keeps the official point and the matched line
 * together, so the map can draw the crossing and the data can still say
 * where the official asset is.
 */
export type JpoStationLink = {
  stationId: string;
  stationName: string;
  distanceM: number;
  /** The end of the bridge nearest the stop. */
  end: "start" | "end";
};

export type Jpo = {
  id: string;
  name: string;
  kind: "jpo" | "skywalk" | "footbridge" | "underpass";
  source: "jakarta-bina-marga" | "osm";
  /** True only for the Dinas Bina Marga DKI Jakarta records. */
  official: boolean;
  city: string | null;
  address: string | null;
  remark: string | null;
  lengthM: number | null;
  geometry: Coordinate[];
  startsAt: Coordinate | null;
  endsAt: Coordinate | null;
  /** The official point, when the record comes from the city dataset. */
  officialPoint: Coordinate | null;
  stations: JpoStationLink[];
  confidence: "official-line" | "official-point" | "osm";
  updatedAt: string | null;
};

export type JpoDocument = {
  generatedAt: string;
  sources: {
    official: {
      name: string;
      url: string;
      retrievedAt: string;
      count: number;
    };
    osm: {
      name: string;
      licence: string;
      retrievedAt: string;
      count: number;
    };
  };
  jpos: Jpo[];
};

export type JpoNear = { jpo: Jpo; distanceKm: number };

/** How far a bridge is from a point, using the line when there is one. */
export function jpoDistanceKm(jpo: Jpo, point: Coordinate): number {
  if (jpo.geometry.length >= 2) return distanceToPathKm(jpo.geometry, point);
  if (jpo.officialPoint) return haversineKm(jpo.officialPoint, point);
  if (jpo.startsAt) return haversineKm(jpo.startsAt, point);
  return Number.POSITIVE_INFINITY;
}

/** The bridges whose line or official point is close to a place. */
export function jposNearPoint(
  jpos: readonly Jpo[],
  point: Coordinate,
  options: { radiusKm?: number; limit?: number } = {},
): JpoNear[] {
  const radiusKm = options.radiusKm ?? 0.15;
  const limit = options.limit ?? 5;
  return jpos
    .map((jpo) => ({ jpo, distanceKm: jpoDistanceKm(jpo, point) }))
    .filter((entry) => entry.distanceKm <= radiusKm)
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .slice(0, limit);
}

/** The bridges recorded beside a stop, closest first. */
export function jposAtStation(jpos: readonly Jpo[], stationId: string): Jpo[] {
  return jpos
    .filter((jpo) => jpo.stations.some((station) => station.stationId === stationId))
    .sort((left, right) => {
      const leftKm = Math.min(
        ...left.stations
          .filter((station) => station.stationId === stationId)
          .map((station) => station.distanceM),
      );
      const rightKm = Math.min(
        ...right.stations
          .filter((station) => station.stationId === stationId)
          .map((station) => station.distanceM),
      );
      return leftKm - rightKm;
    });
}

/**
 * The bridges a walked path crosses.
 *
 * A bridge is used when the walk passes within the tolerance of its line.
 * It is not enough for the bridge to be near the walk: the path must touch
 * it, or the rider is not using it.
 */
export function jposAlongPath(
  jpos: readonly Jpo[],
  path: readonly Coordinate[],
  options: { toleranceKm?: number; limit?: number } = {},
): JpoNear[] {
  if (path.length < 2) return [];
  const toleranceKm = options.toleranceKm ?? 0.025;
  const limit = options.limit ?? 3;
  return jpos
    .filter((jpo) => jpo.geometry.length >= 2)
    .map((jpo) => {
      let closest = Number.POSITIVE_INFINITY;
      for (const point of path) {
        const distance = distanceToPathKm(jpo.geometry, point);
        if (distance < closest) closest = distance;
        if (closest <= toleranceKm) break;
      }
      return { jpo, distanceKm: closest };
    })
    .filter((entry) => entry.distanceKm <= toleranceKm)
    .sort((left, right) => {
      // A named official bridge is more useful than three unnamed OSM
      // segments at the same crossing.
      const rank = (jpo: Jpo): number =>
        jpo.official ? 0 : jpo.name === "Footbridge" || jpo.name === "Underpass" ? 2 : 1;
      const byRank = rank(left.jpo) - rank(right.jpo);
      if (byRank !== 0) return byRank;
      return left.distanceKm - right.distanceKm;
    })
    .slice(0, limit);
}

export type JpoWalkEstimate = {
  jpo: Jpo;
  /** The walking distance when the path goes over the bridge. */
  km: number;
  minutes: number;
  /** The end the rider enters from. */
  entryEnd: "start" | "end";
};

/**
 * The walk to a stop when it can use a bridge.
 *
 * The bridge is a candidate only when the rider is near one end and the
 * stop is near the other. A bridge that is merely close to both is not used:
 * it does not take the rider across anything.
 *
 * The answer is an estimate for choosing between stops. The displayed walk
 * is still the one the pedestrian router returns, and a walk that the
 * router did not draw over the bridge is not described as one.
 */
export function jpoWalkEstimate(
  jpos: readonly Jpo[],
  from: Coordinate,
  to: Coordinate,
  options: { maxAccessKm?: number } = {},
): JpoWalkEstimate | null {
  const maxAccessKm = options.maxAccessKm ?? 0.3;
  let best: JpoWalkEstimate | null = null;

  for (const jpo of jpos) {
    if (jpo.geometry.length < 2) continue;
    const first = jpo.geometry[0];
    const last = jpo.geometry[jpo.geometry.length - 1];
    if (!first || !last) continue;
    const lengthKm = jpo.lengthM !== null ? jpo.lengthM / 1000 : pathLengthKm(jpo.geometry);

    const sides = [
      { entry: first, exit: last, entryEnd: "start" as const },
      { entry: last, exit: first, entryEnd: "end" as const },
    ];
    for (const side of sides) {
      const fromKm = haversineKm(from, side.entry);
      const toKm = haversineKm(to, side.exit);
      if (fromKm > maxAccessKm || toKm > maxAccessKm) continue;
      // The rider must be nearer the entry than the far end, and the stop
      // nearer the exit than the entry. Otherwise the bridge is beside the
      // walk, not on it.
      if (fromKm > haversineKm(from, side.exit)) continue;
      if (toKm > haversineKm(to, side.entry)) continue;
      // Both ends on the same side is not a crossing.
      if (haversineKm(side.entry, side.exit) < 0.015) continue;
      const km = fromKm + lengthKm + toKm;
      if (!best || km < best.km) {
        best = {
          jpo,
          km,
          minutes: walkingMinutes(km),
          entryEnd: side.entryEnd,
        };
      }
    }
  }

  return best;
}

function pathLengthKm(path: readonly Coordinate[]): number {
  let total = 0;
  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1];
    const current = path[index];
    if (!previous || !current) continue;
    total += haversineKm(previous, current);
  }
  return total;
}
