import type { DisruptionSummary, Itinerary } from "../../lib/api.js";
import { formatJakartaClock, formatJakartaSpan } from "../../lib/jakarta-time.js";
import { routeIsBlocked } from "../../lib/route-choice.js";

export {
  estimateArrivalIso,
  formatJakartaClock,
  formatJakartaSpan,
} from "../../lib/jakarta-time.js";

/**
 * The ways of ordering the journeys the planner returned.
 *
 * The order on the screen is the rider's choice, not a new plan: the
 * planner has already measured every route, and this module only decides
 * which one is read first. A journey that a notice removes is always read
 * after an open one, whatever the rider is sorting by, because a blocked
 * route is not a choice even when it is the fastest.
 */
export type RouteSortMode = "fastest" | "cheapest" | "fewest-transfers";

export const ROUTE_SORT_LABELS: Record<RouteSortMode, string> = {
  fastest: "Tercepat",
  cheapest: "Termurah",
  "fewest-transfers": "Sedikit transit",
};

function fareOf(route: Itinerary): number {
  const total = route.fare.totalIdr;
  return total === null || !Number.isFinite(total) ? Number.POSITIVE_INFINITY : total;
}

function compareByMode(
  routes: readonly Itinerary[],
  left: number,
  right: number,
  mode: RouteSortMode,
): number {
  const a = routes[left];
  const b = routes[right];
  if (!a || !b) return left - right;

  if (mode === "cheapest") {
    const fareA = fareOf(a);
    const fareB = fareOf(b);
    const knownA = Number.isFinite(fareA);
    const knownB = Number.isFinite(fareB);
    if (knownA !== knownB) return knownA ? -1 : 1;
    if (knownA && knownB && fareA !== fareB) return fareA - fareB;
    if (a.durationMinutes !== b.durationMinutes) return a.durationMinutes - b.durationMinutes;
  }

  if (mode === "fewest-transfers") {
    if (a.transferCount !== b.transferCount) return a.transferCount - b.transferCount;
    if (a.walkingKm !== b.walkingKm) return a.walkingKm - b.walkingKm;
    if (a.durationMinutes !== b.durationMinutes) return a.durationMinutes - b.durationMinutes;
  }

  if (a.durationMinutes !== b.durationMinutes) return a.durationMinutes - b.durationMinutes;
  if (a.transferCount !== b.transferCount) return a.transferCount - b.transferCount;
  if (a.walkingKm !== b.walkingKm) return a.walkingKm - b.walkingKm;
  return left - right;
}

/**
 * The indexes of the routes, in the order the rider asked for.
 *
 * The function returns indexes rather than new routes, so a caller keeps
 * the identity of every itinerary: the map, the watch key and the chosen
 * row all point at the same object.
 */
export function sortItineraries(
  routes: readonly Itinerary[],
  mode: RouteSortMode,
  notices: readonly DisruptionSummary[],
): number[] {
  const open: number[] = [];
  const blocked: number[] = [];

  routes.forEach((route, index) => {
    if (routeIsBlocked(route, notices)) blocked.push(index);
    else open.push(index);
  });

  const order = (a: number, b: number): number => compareByMode(routes, a, b, mode);
  return [...open.sort(order), ...blocked.sort(order)];
}

/** The clock of one instant, kept for callers that only need the time. */
export function jakartaTimeOf(iso: string | undefined): string {
  if (!iso) return "";
  return formatJakartaClock(iso);
}

/** The span of a journey, kept as a named helper for the route cards. */
export { formatJakartaSpan as jakartaSpanOf };
