/**
 * Matching disruptions against a planned itinerary.
 *
 * The engine never invents an alert: a disruption is attached to a route
 * only when it names a line, a station, an interchange group, or a station
 * that the route physically passes through.
 */

import type { Disruption, Itinerary } from "./types.js";

export type DisruptionMatch = {
  disruption: Disruption;
  /** The leg of the itinerary the disruption touches. */
  legIndex: number | null;
  stationIds: string[];
  lineIds: string[];
  /** How strongly the disruption is confirmed for this route. */
  impact: "direct" | "station" | "line";
};

export type MatchContext = {
  /** Station ids that belong to the same interchange groups as the route. */
  groupStationIds?: ReadonlyMap<string, string[]>;
  /** Station ids the route stops at. */
  routeStationIds?: readonly string[];
};

/**
 * Attach every disruption that touches the itinerary.
 *
 * The result is ordered by impact, then by severity, then by recency, so the
 * most consequential alert leads.
 */
export function matchDisruptions(
  itinerary: Itinerary,
  disruptions: readonly Disruption[],
  context: MatchContext = {},
): DisruptionMatch[] {
  const routeStationIds = new Set(
    context.routeStationIds ?? itinerary.legs.flatMap((leg) => leg.stops.map((stop) => stop.stationId)),
  );
  const routeLineIds = new Set(
    itinerary.legs.flatMap((leg) => (leg.lineId ? [leg.lineId] : [])),
  );

  const matches: DisruptionMatch[] = [];

  for (const disruption of disruptions) {
    if (disruption.status !== "active") continue;

    const stationIds = new Set<string>();
    const lineIds = new Set<string>();

    if (disruption.lineId && routeLineIds.has(disruption.lineId)) {
      lineIds.add(disruption.lineId);
    }
    if (disruption.stationId && routeStationIds.has(disruption.stationId)) {
      stationIds.add(disruption.stationId);
    }
    for (const stationId of disruption.affectedStationIds) {
      if (routeStationIds.has(stationId)) stationIds.add(stationId);
      const siblings = context.groupStationIds?.get(stationId);
      for (const sibling of siblings ?? []) {
        if (routeStationIds.has(sibling)) stationIds.add(sibling);
      }
    }
    for (const lineId of disruption.affectedLineIds) {
      if (routeLineIds.has(lineId)) lineIds.add(lineId);
    }
    if (disruption.stationGroupId) {
      const members = context.groupStationIds?.get(disruption.stationGroupId);
      for (const member of members ?? []) {
        if (routeStationIds.has(member)) stationIds.add(member);
      }
    }

    if (stationIds.size === 0 && lineIds.size === 0) continue;

    const legIndex = findAffectedLeg(itinerary, stationIds, lineIds);

    const impact: DisruptionMatch["impact"] =
      lineIds.size > 0 && stationIds.size > 0
        ? "direct"
        : lineIds.size > 0
          ? "line"
          : "station";

    matches.push({
      disruption,
      legIndex,
      stationIds: [...stationIds],
      lineIds: [...lineIds],
      impact,
    });
  }

  return matches.sort((a, b) => {
    const impactRank = { direct: 0, station: 1, line: 2 } as const;
    if (impactRank[a.impact] !== impactRank[b.impact]) {
      return impactRank[a.impact] - impactRank[b.impact];
    }
    const severityRank = { critical: 0, severe: 1, warning: 2, info: 3 } as const;
    const severityDelta =
      severityRank[a.disruption.severity] - severityRank[b.disruption.severity];
    if (severityDelta !== 0) return severityDelta;
    return b.disruption.publishedAt.localeCompare(a.disruption.publishedAt);
  });
}

function findAffectedLeg(
  itinerary: Itinerary,
  stationIds: ReadonlySet<string>,
  lineIds: ReadonlySet<string>,
): number | null {
  for (let index = 0; index < itinerary.legs.length; index += 1) {
    const leg = itinerary.legs[index];
    if (!leg) continue;
    if (leg.lineId && lineIds.has(leg.lineId)) return index;
    if (leg.stops.some((stop) => stationIds.has(stop.stationId))) return index;
  }
  return null;
}

const SEVERITY_BY_IMPACT: Record<DisruptionMatch["impact"], Disruption["severity"]> = {
  direct: "critical",
  station: "severe",
  line: "warning",
};

/**
 * The severity a disruption carries *for this route*.
 *
 * A line-wide closure is critical on the line it closes and merely
 * informational for a route that only crosses it.
 */
export function severityForRoute(
  match: DisruptionMatch,
  routeDisrupted: boolean,
): Disruption["severity"] {
  if (routeDisrupted) return SEVERITY_BY_IMPACT[match.impact];
  return match.disruption.severity;
}

/**
 * Whether the disruption removes the line or stop from service entirely.
 *
 * Only a closure (or an explicit "route diverted" notice) actually removes
 * capacity; a delay or a maintenance warning does not.
 */
export function removesService(disruption: Disruption): boolean {
  if (disruption.kind === "closure" || disruption.kind === "strike") return true;
  if (disruption.kind === "diversion" && disruption.severity === "critical") return true;
  return false;
}
