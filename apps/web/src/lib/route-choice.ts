import type { DisruptionSummary, Itinerary, PlanResult } from "./api.js";

/** The journeys the rider can choose, fastest first, then the ways around a closure. */
export function planChoices(data: PlanResult): Itinerary[] {
  return [...data.itineraries, ...data.alternatives];
}

/** Whether this journey uses a stop or a line that the disruption removes. */
export function routeIsBlocked(
  route: Itinerary,
  disruptions: readonly DisruptionSummary[],
): boolean {
  return disruptions.some(
    (disruption) => disruption.blocksService && touches(route, disruption),
  );
}

export function firstOpenIndex(
  routes: readonly Itinerary[],
  disruptions: readonly DisruptionSummary[],
): number {
  let best = -1;
  let bestDuration = Number.POSITIVE_INFINITY;
  routes.forEach((route, index) => {
    if (routeIsBlocked(route, disruptions)) return;
    if (route.durationMinutes < bestDuration) {
      best = index;
      bestDuration = route.durationMinutes;
    }
  });
  return best >= 0 ? best : 0;
}

/**
 * The rows the comparison shows.
 *
 * An open journey is not automatically the same choice as another open
 * journey that happens to use another corridor. 9 and 9A both end at Pluit,
 * but one of them may be the one that still stops near the rider. The
 * comparison keeps the fastest open ways with different primary lines, and
 * one closed way when there is one, so the reader can see the difference.
 */
export function visibleChoiceIndexes(
  routes: readonly Itinerary[],
  disruptions: readonly DisruptionSummary[],
): number[] {
  const blocked: number[] = [];
  const open: number[] = [];
  routes.forEach((route, index) => {
    if (routeIsBlocked(route, disruptions)) blocked.push(index);
    else open.push(index);
  });
  const byDuration = (left: number, right: number): number =>
    (routes[left]?.durationMinutes ?? 0) - (routes[right]?.durationMinutes ?? 0);
  const picked: number[] = [];
  const firstBlocked = blocked[0];
  if (firstBlocked !== undefined) picked.push(firstBlocked);

  const seenLines = new Set<string>();
  for (const index of [...open].sort(byDuration)) {
    if (picked.length >= 3) break;
    const line = primaryLine(routes[index]);
    if (line && seenLines.has(line)) continue;
    if (line) seenLines.add(line);
    picked.push(index);
  }
  return picked;
}

function primaryLine(route: Itinerary | undefined): string | null {
  const ride = route?.legs.find((leg) => leg.kind === "ride" && leg.lineId);
  return ride?.lineId ?? null;
}

export function closedStationIds(disruptions: readonly DisruptionSummary[]): Set<string> {
  const ids = new Set<string>();
  for (const disruption of disruptions) {
    if (!disruption.blocksService) continue;
    if (disruption.stationId) ids.add(disruption.stationId);
    for (const id of disruption.affectedStationIds) ids.add(id);
  }
  return ids;
}

function touches(route: Itinerary, disruption: DisruptionSummary): boolean {
  const stations = new Set<string>();
  if (disruption.stationId) stations.add(disruption.stationId);
  for (const id of disruption.affectedStationIds) stations.add(id);
  const lines = new Set<string>();
  if (disruption.lineId) lines.add(disruption.lineId);
  for (const id of disruption.affectedLineIds) lines.add(id);
  return route.legs.some((leg) => {
    if (leg.lineId && lines.has(leg.lineId)) return true;
    return leg.stops.some((stop) => stations.has(stop.stationId));
  });
}
