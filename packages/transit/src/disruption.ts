/**
 * Matching disruptions against a planned itinerary.
 *
 * The engine never invents an alert: a disruption is attached to a route
 * only when it names a line, a station, an interchange group, or a station
 * that the route physically passes through.
 */

import {
  isActiveAt,
  noticeScopeOf,
  type Direction,
  type Disruption,
  type Itinerary,
  type NoticeScope,
} from "./types.js";

export type DisruptionMatch = {
  disruption: Disruption;
  /** The leg of the itinerary the disruption touches. */
  legIndex: number | null;
  stationIds: string[];
  lineIds: string[];
  /** How strongly the disruption is confirmed for this route. */
  impact: "direct" | "station" | "line";
  /**
   * What the affected stop is to this rider.
   *
   * A closed halte the rider only passes through is not a closed journey; a
   * closed halte they meant to board, alight or change at is.
   */
  role: JourneyRole;
  /** The direction of the affected ride, when the match is a ride. */
  direction: Direction | null;
  /** The direction the notice itself names, when it names one. */
  noticeDirection: Direction | null;
};

/** What the affected stop is to the rider who is looking at this journey. */
export type JourneyRole = "origin" | "destination" | "transfer" | "pass-through" | "line";

export type MatchContext = {
  /** Station ids that belong to the same interchange groups as the route. */
  groupStationIds?: ReadonlyMap<string, string[]>;
  /** Station ids the route stops at. */
  routeStationIds?: readonly string[];
  /** The instant to judge the windows at; defaults to now. */
  at?: Date;
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
    if (!isActiveAt(disruption, context.at)) continue;

    // A platform-scoped notice applies only to a ride that uses that
    // line in that direction. The station may still serve another line.
    const platforms = disruption.platforms ?? [];
    if (
      platforms.length > 0 &&
      !itinerary.legs.some(
        (leg) =>
          leg.lineId &&
          leg.direction &&
          platforms.some(
            (platform) =>
              platform.lineId === leg.lineId &&
              platform.direction === leg.direction &&
              (!platform.stationId ||
                leg.stops.some((stop) => stop.stationId === platform.stationId)),
          ),
      )
    ) {
      continue;
    }

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

    const leg = legIndex === null ? undefined : itinerary.legs[legIndex];
    matches.push({
      disruption,
      legIndex,
      stationIds: [...stationIds],
      lineIds: [...lineIds],
      impact,
      role: journeyRole(itinerary, stationIds, lineIds, noticeScopeOf(disruption)),
      direction: leg?.direction ?? null,
      noticeDirection: disruption.direction ?? null,
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

/**
 * Where the affected stops sit in this journey.
 *
 * The boarding point is the first stop of the first ride, the alighting
 * point the last stop of the last ride, and a change of vehicle the stop
 * where one ride ends and the next begins. Everything else is a place the
 * rider passes without getting off.
 */
export function journeyRole(
  itinerary: Itinerary,
  stationIds: ReadonlySet<string>,
  lineIds: ReadonlySet<string>,
  noticeScope: NoticeScope | null = null,
): JourneyRole {
  if (stationIds.size === 0) return "line";

  const rides = itinerary.legs.filter((leg) => leg.kind === "ride");
  const boarding = rides[0]?.stops[0]?.stationId ?? null;
  const alighting = rides[rides.length - 1]?.stops.at(-1)?.stationId ?? null;
  const changes = new Set<string>();
  for (let index = 0; index + 1 < rides.length; index += 1) {
    const before = rides[index]?.stops.at(-1)?.stationId;
    const after = rides[index + 1]?.stops[0]?.stationId;
    if (before) changes.add(before);
    if (after) changes.add(after);
  }

  if (boarding && stationIds.has(boarding)) return "origin";
  if (alighting && stationIds.has(alighting)) return "destination";
  if ([...stationIds].some((stationId) => changes.has(stationId))) return "transfer";
  // A stop-scoped notice is about a place, not the whole corridor. A rider
  // who only passes it does not have to board, alight or change there.
  if (noticeScope === "stop") return "pass-through";
  // A notice about a whole line that also names one of its stops is about
  // the line, not about that stop.
  if (lineIds.size > 0 && rides.some((ride) => ride.lineId && lineIds.has(ride.lineId))) {
    return "line";
  }
  return "pass-through";
}

/**
 * Whether the notice stops the rider from making this journey.
 *
 * A closed stop removes the journey only when the rider has to use that
 * stop. A diversion that removes the vehicle from the road removes it for
 * every journey on that line.
 */
export function blocksJourney(match: DisruptionMatch): boolean {
  if (!removesService(match.disruption)) return false;
  // A closure that names one direction does not close the other.
  if (
    match.noticeDirection &&
    match.direction &&
    match.noticeDirection !== match.direction
  ) {
    return false;
  }
  if (match.role === "pass-through") return false;
  if (match.role === "line") return true;
  // A stop-scoped closure closes the stop, not the corridor.
  return (
    match.role === "origin" ||
    match.role === "destination" ||
    match.role === "transfer" ||
    match.lineIds.length > 0
  );
}

/**
 * Whether every part of the itinerary is still open.
 *
 * An alternative that changes at a closed stop, or rides a closed line, is
 * not a choice. This is the one test the route handlers use before showing
 * a candidate.
 */
export function routeIsClear(
  itinerary: Itinerary,
  disruptions: readonly Disruption[],
  at?: Date,
): boolean {
  return !matchDisruptions(itinerary, disruptions, at ? { at } : {}).some(blocksJourney);
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
  // A path diversion keeps the line running on another road. It is a
  // modification, not a removal of service.
  if ((disruption.diversions?.length ?? 0) > 0 && noticeScopeOf(disruption) !== "stop") {
    return false;
  }
  if (noticeScopeOf(disruption) === "stop") {
    // A halte that is closed, or that a diverted route no longer calls at,
    // is out of service for this journey; the corridor itself is not.
    return disruption.kind === "closure" || disruption.kind === "diversion";
  }
  if (disruption.kind === "closure" || disruption.kind === "strike") return true;
  if (disruption.kind === "diversion" && disruption.severity === "critical") return true;
  return false;
}
