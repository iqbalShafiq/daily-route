/**
 * Walking to another stop when the one the rider wanted is closed.
 *
 * A closed halte is not a closed journey. The rider can walk to a stop a few
 * hundred metres away and board there, or alight one stop early and walk the
 * last stretch. This module answers the first half of that question — which
 * stops are close enough to walk to, and how long the walk takes — and
 * leaves the choice of journey to the planner.
 */

import { haversineKm, walkingMinutes } from "./geo.js";
import type { Station } from "./types.js";
import type { TransitNetwork } from "./graph.js";

export type WalkingAccess = {
  station: Station;
  distanceKm: number;
  minutes: number;
};

export type WalkingAccessOptions = {
  /** The furthest the rider should be asked to walk. */
  maxKm?: number;
  limit?: number;
  /** Stops the rider cannot use: closed, or the place they are walking from. */
  exclude?: ReadonlySet<string>;
  /** Only stops that at least one line serves. */
  servedOnly?: boolean;
};

/**
 * The stops within walking distance of a place.
 *
 * The nearest one is first. A stop that no line serves is not an option, so
 * it is left out unless the caller asks for every stop.
 */
export function stopsWithinWalk(
  network: TransitNetwork,
  from: { latitude: number; longitude: number },
  options: WalkingAccessOptions = {},
): WalkingAccess[] {
  const maxKm = options.maxKm ?? 1;
  const limit = options.limit ?? 4;
  const served = options.servedOnly ?? true;
  const servedIds = served ? new Set(network.lineStops.map((stop) => stop.stationId)) : null;

  const found: WalkingAccess[] = [];
  for (const station of network.stations) {
    if (options.exclude?.has(station.id)) continue;
    if (servedIds && !servedIds.has(station.id)) continue;
    const distanceKm = haversineKm(from, station);
    if (distanceKm > maxKm) continue;
    found.push({ station, distanceKm, minutes: walkingMinutes(distanceKm) });
  }

  return found
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .slice(0, limit);
}

/**
 * The stop a rider boards at when the one they named is closed.
 *
 * The closest stop is not always the right one: a stop two hundred metres
 * away on a line that does not go where the rider is going is worth less
 * than one four hundred metres away that does. The caller passes the cost
 * of the journey from each candidate and this chooses the total.
 */
export function bestAccess(
  accesses: readonly WalkingAccess[],
  costOf: (station: Station) => number | null,
): { access: WalkingAccess; cost: number } | null {
  let best: { access: WalkingAccess; cost: number } | null = null;
  for (const access of accesses) {
    const journeyCost = costOf(access.station);
    if (journeyCost === null) continue;
    const total = journeyCost + access.minutes;
    if (!best || total < best.cost) best = { access, cost: total };
  }
  return best;
}
