import { Router } from "express";
import { z } from "zod";

import { findStationsNear, listActiveDisruptions, listNoticeEvidence } from "@daily-route/db";
import { PLACE_CONFIDENCE_THRESHOLD } from "@daily-route/semantic";
import {
  bestAccess,
  blocksJourney,
  FARE_OPERATOR_LABELS,
  linesUsedBy,
  matchDisruptions,
  planRoutes,
  routeIsClear,
  fareLegsOf,
  quoteFare,
  removesService,
  stopsWithinWalk,
  diversionsFromMetadata,
  isActiveAt,
  isDemonstration,
  patternActiveAt,
  noticeScopeOf,
  type DiversionDetail,
  walkingMinutes,
  haversineKm,
  formatRupiah,
  directionSummary,
  type Disruption,
  type FareRules,
  type Itinerary,
  type NoticeScope,
  type RoadRef,
  type Station,
  type TransitNetwork,
} from "@daily-route/transit";

import { storedMark } from "@daily-route/agent";

import type { ApiDeps } from "../deps.js";
import { fetchWalkingRoute } from "./walk.js";

/**
 * The route-planning endpoint.
 *
 * It answers the same question the agent answers, but without a model in the
 * loop: the caller supplies two places, the API resolves them and returns
 * the itineraries together with the disruptions that affect them.
 */

/** A query coordinate. Missing and blank both mean "the rider named a stop". */
const optionalCoordinate = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === "") return undefined;
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) ? number : undefined;
  });

const planSchema = z.object({
  origin: z.string().min(1).max(200),
  destination: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(5).default(3),
  originLatitude: optionalCoordinate,
  originLongitude: optionalCoordinate,
  destinationLatitude: optionalCoordinate,
  destinationLongitude: optionalCoordinate,
  at: z.string().datetime({ offset: true }).optional(),
  nightSafe: z.coerce.boolean().optional(),
});

/**
 * The legs of a journey, in the shape the interface reads.
 *
 * The alternative routes are read exactly like the main one, so they
 * carry the same fields: the stops, the mode, the class of service.
 * A route that is shown but cannot be examined is not an alternative.
 */
function patternVariants(
  network: TransitNetwork,
  leg: Itinerary["legs"][number],
  at: Date,
) {
  if (!leg.lineId || leg.kind !== "ride") return [];
  const patterns = (network.patterns ?? []).filter(
    (pattern) => pattern.lineId === leg.lineId && pattern.direction === leg.direction,
  );
  if (patterns.length === 0) return [];
  const base = patterns.find((pattern) => pattern.isDefault) ?? patterns[0];
  const baseStops = new Set(base?.stopIds ?? []);
  const nameOf = (stationId: string) =>
    network.stations.find((station) => station.id === stationId)?.name ?? stationId;
  return patterns.map((pattern) => ({
    id: pattern.id,
    headsign: pattern.headsign,
    direction: pattern.direction,
    patternType: pattern.patternType,
    serviceLabel: pattern.serviceLabel,
    serviceDays: pattern.serviceDays,
    situational: pattern.metadata["situational"] === true,
    serviceNote: typeof pattern.metadata["serviceNote"] === "string" ? pattern.metadata["serviceNote"] : null,
    toll: pattern.toll,
    isDefault: pattern.id === base?.id,
    activeNow: patternActiveAt(pattern, at),
    holidayService: pattern.metadata["holidays"] === true,
    stops: pattern.stopIds.map(nameOf),
    skipped: [...baseStops]
      .filter((stationId) => !pattern.stopIds.includes(stationId))
      .map(nameOf),
    extra: pattern.stopIds
      .filter((stationId) => !baseStops.has(stationId))
      .map(nameOf),
  }));
}

function detourForLeg(
  leg: Itinerary["legs"][number],
  disruptions: readonly Disruption[],
  network: TransitNetwork,
  at: Date,
): DiversionDetail | null {
  if (!leg.lineId || leg.kind !== "ride") return null;
  for (const disruption of disruptions) {
    if (!isActiveAt(disruption, at)) continue;
    const stopIds = new Set(leg.stops.map((stop) => stop.stationId));
    const diversion = (disruption.diversions ?? []).find(
      (entry) =>
        entry.lineId === leg.lineId &&
        entry.direction === leg.direction &&
        (stopIds.has(entry.fromStationId) || stopIds.has(entry.toStationId)),
    );
    if (!diversion) continue;
    return {
      via: diversion.via,
      viaLineCodes: diversion.viaLineCodes ?? [],
      skipped: (diversion.skippedStationIds ?? [])
        .map((stationId) => network.stations.find((station) => station.id === stationId)?.name)
        .filter((name): name is string => Boolean(name)),
      approximate: diversion.approximate,
    };
  }
  return null;
}

function legsOf(
  itinerary: Itinerary,
  network: TransitNetwork,
  disruptions: readonly Disruption[] = [],
  at: Date = new Date(),
) {
  const matches = disruptions.length > 0 ? matchDisruptions(itinerary, disruptions, { at }) : [];
  const skipped = new Map<string, string>();
  for (const match of matches) {
    if (match.legIndex === null) continue;
    const leg = itinerary.legs[match.legIndex];
    if (!leg) continue;
    for (const stationId of match.stationIds) {
      if (leg.stops.some((stop) => stop.stationId === stationId)) {
        skipped.set(`${match.legIndex}:${stationId}`, match.disruption.title);
      }
    }
  }
  return itinerary.legs.map((leg, legIndex) => ({
    kind: leg.kind,
    mode: leg.mode,
    lineId: leg.lineId,
    lineName: leg.lineName,
    lineCode: leg.lineCode,
    serviceClass: leg.serviceClass,
    temporary: leg.temporary === true,
    fromStationId: leg.fromStationId,
    toStationId: leg.toStationId,
    fromName: leg.fromName,
    toName: leg.toName,
    durationMinutes: leg.durationMinutes,
    distanceKm: Number(leg.distanceKm.toFixed(2)),
    walkReason: leg.walkReason,
    nextLineName: leg.nextLineName,
    waitMinutes: leg.waitMinutes,
    serviceLabel: leg.serviceLabel ?? null,
    headwayMinMinutes: leg.headwayMinMinutes ?? null,
    headwayMaxMinutes: leg.headwayMaxMinutes ?? null,
    outsideService: leg.outsideService === true,
    serviceDetail: leg.serviceDetail ?? null,
    changedFrom: leg.changedFrom,
    changedAt: leg.changedAt,
    // The side of the road and the direction of travel, when this is a ride.
    direction: leg.direction,
    directionLabel:
      leg.direction && leg.lineId
        ? (directionSummary(network, leg.lineId, leg.direction)?.label ?? null)
        : null,
    fromPlatform: leg.fromPlatform,
    toPlatform: leg.toPlatform,
    // The scheduled pattern, and the other patterns a rider could see.
    patternId: leg.patternId ?? null,
    patternLabel: leg.patternLabel ?? null,
    patternType: leg.patternType ?? null,
    patternService: leg.patternService ?? null,
    variants: patternVariants(network, leg, at),
    // A borrowed path, when this ride is a diversion rather than the
    // ordinary alignment.
    detour: detourForLeg(leg, disruptions, network, at),
    // The path of this leg, so the map can draw it in its own colour.
    geometry: leg.coordinates,
    stops: leg.stops.map((stop) => {
      const notice = skipped.get(`${legIndex}:${stop.stationId}`);
      return {
        stationId: stop.stationId,
        name: stop.name,
        latitude: stop.latitude,
        longitude: stop.longitude,
        ...(notice ? { skipped: true, skippedNotice: notice } : {}),
      };
    }),
  }));
}

export function createRoutesRouter(deps: ApiDeps): Router {
  const router = Router();

  router.get("/plan", async (request, response) => {
    const parsed = planSchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid parameters", detail: parsed.error.issues });
      return;
    }

    const { origin, destination, limit } = parsed.data;
    const nightSafe = parsed.data.nightSafe === true;
    const originPin = pinOf(parsed.data.originLatitude, parsed.data.originLongitude);
    const destinationPin = pinOf(
      parsed.data.destinationLatitude,
      parsed.data.destinationLongitude,
    );

    const { network, disruptions, fareRules } = await deps.cache.get();
    const quotedAt = parsed.data.at ? new Date(parsed.data.at) : new Date();

    const namedOrigin = originPin ? null : await resolveNamedStop(deps, origin);
    const namedDestination = destinationPin ? null : await resolveNamedStop(deps, destination);

    if (!originPin && !namedOrigin) {
      response.status(404).json({ error: "That place was not found, or the name is ambiguous" });
      return;
    }
    if (!destinationPin && !namedDestination) {
      response.status(404).json({ error: "That place was not found, or the name is ambiguous" });
      return;
    }

    const boarded = await chooseStops(deps, network, {
      origin: namedOrigin,
      destination: namedDestination,
      originPin,
      destinationPin,
    });
    if (!boarded) {
      response.status(404).json({
        error: "No stop within 1.5 km of that place",
      });
      return;
    }

    /**
     * A closed halte is not a closed journey.
     *
     * When the stop the rider named is out of service, the journey is
     * planned from the nearest stop they can walk to instead, and the walk
     * becomes the first (or last) leg. The corridor itself is not avoided:
     * the vehicle still runs past the closed stop.
     */
    const closedStops = closedStopIds(disruptions, quotedAt);
    let originStop = boarded.origin;
    let destinationStop = boarded.destination;
    let boardedFrom: Pin | null = originPin;
    let alightedAt: Pin | null = destinationPin;
    // The place the rider named, before a closed stop moves the boarding or
    // alighting point; the walk at the end must lead back to this place.
    const wantedOrigin: Pin = originPin ?? pointOfStop(boarded.origin);
    const wantedDestination: Pin = destinationPin ?? pointOfStop(boarded.destination);

    if (closedStops.has(originStop.stationId)) {
      const from = originPin ?? pointOfStop(originStop);
      const best = pickAccess(network, from, closedStops, (station) =>
        planRoutes(network, station.id, destinationStop.stationId, { maxAlternatives: 1, at: quotedAt })[0]?.cost ?? null,
      );
      if (best) {
        originStop = asStopChoice(best.access.station);
        boardedFrom = wantedOrigin;
      }
    }
    if (closedStops.has(destinationStop.stationId)) {
      const to = destinationPin ?? pointOfStop(destinationStop);
      const best = pickAccess(network, to, closedStops, (station) =>
        planRoutes(network, originStop.stationId, station.id, { maxAlternatives: 1, at: quotedAt })[0]?.cost ?? null,
      );
      if (best) {
        destinationStop = asStopChoice(best.access.station);
        alightedAt = wantedDestination;
      }
    }

    const closedLines = closedLineIds(disruptions, quotedAt);
    const planned = planRoutes(network, originStop.stationId, destinationStop.stationId, {
      maxAlternatives: limit,
      at: quotedAt,
      nightSafe,
      avoidLineIds: [...closedLines],
    });
    if (planned.length === 0) {
      response.status(404).json({
        error: "No journey is scheduled at that time. Try another hour, or plan for now.",
        code: "no-service-at-time",
      });
      return;
    }

    const primary = planned[0];
    const matches = primary
      ? matchDisruptions(primary, disruptions, { at: quotedAt })
      : [];
    const blocking = matches.filter(blocksJourney);
    // Anything the rider sees as a choice must be clear of every active
    // closure, not just the one that hit the primary. A candidate that still
    // changes at a closed stop is dropped.
    let itineraries = planned.filter((itinerary) =>
      routeIsClear(itinerary, disruptions, quotedAt),
    );
    if (blocking.length > 0) {
      const avoidLineIds = new Set(closedLines);
      const avoidStationIds = new Set(closedStops);
      for (const match of blocking) {
        for (const lineId of match.lineIds) avoidLineIds.add(lineId);
        for (const stationId of match.stationIds) avoidStationIds.add(stationId);
      }
      const safeInitial = planned
        .slice(1)
        .filter((itinerary) => routeIsClear(itinerary, disruptions, quotedAt));
      const replanned = planRoutes(network, originStop.stationId, destinationStop.stationId, {
        maxAlternatives: 2,
        at: quotedAt,
        nightSafe,
        avoidLineIds: [...avoidLineIds],
        avoidStationIds: [...avoidStationIds],
      }).filter((itinerary) => routeIsClear(itinerary, disruptions, quotedAt));
      itineraries = dedupeItineraries([...safeInitial, ...replanned]);
    }

    // The stop the rider named is no longer on the itinerary — they walked
    // from it — so the notice that closed it would fall out of the matches.
    // It still has to be on the answer: it is why the first leg is a walk.
    const endpointNotices = closedStops.size === 0
      ? []
      : disruptions.filter((disruption) => {
          if (!isActiveAt(disruption, quotedAt) || !removesService(disruption)) return false;
          const ids = [disruption.stationId, ...disruption.affectedStationIds].filter(
            (id): id is string => typeof id === "string",
          );
          return (
            ids.includes(boarded.origin.stationId) || ids.includes(boarded.destination.stationId)
          );
        });

    const [accessWalk, egressWalk] = await Promise.all([
      boardedFrom
        ? walkBetween(boardedFrom, originStop, origin, "access", originStop)
        : Promise.resolve(null),
      alightedAt
        ? walkBetween(destinationStop, alightedAt, destination, "egress", destinationStop)
        : Promise.resolve(null),
    ]);

    const present = (itinerary: Itinerary) =>
      presentItinerary(
    itinerary,
    fareOf(itinerary, fareRules, quotedAt),
    accessWalk,
    egressWalk,
    network,
    disruptions,
    quotedAt,
  );

    const presentedItineraries = await Promise.all(
      itineraries.map((itinerary) => followStreets(present(itinerary))),
    );

    response.json({
      origin: {
        text: origin,
        stationId: boarded.origin.stationId,
        name: originPin ? origin : boarded.origin.name,
        systemId: boarded.origin.systemId,
        latitude: originPin?.latitude ?? boarded.origin.latitude,
        longitude: originPin?.longitude ?? boarded.origin.longitude,
        score: boarded.origin.score,
      },
      destination: {
        text: destination,
        stationId: boarded.destination.stationId,
        name: destinationPin ? destination : boarded.destination.name,
        systemId: boarded.destination.systemId,
        latitude: destinationPin?.latitude ?? boarded.destination.latitude,
        longitude: destinationPin?.longitude ?? boarded.destination.longitude,
        score: boarded.destination.score,
      },
      // A blocked primary itinerary is not a choice. The rider sees the
      // alternatives that avoid the closed line, not the corridor that the
      // notice just removed.
      itineraries: presentedItineraries,
      alternatives: [],
      disruptions: [
        ...matches.map((match) => summarize(match.disruption, match.impact, network)),
        ...endpointNotices
          .filter((notice) => !matches.some((match) => match.disruption.id === notice.id))
          .map((notice) => summarize(notice, "station", network)),
      ],
      watch: disruptions
        .filter((disruption) => isDemonstration(disruption) && !matches.some((match) => match.disruption.id === disruption.id))
        .map((disruption) => summarize(disruption, "line", network)),
      routeBlocked: blocking.length > 0,
      quotedAt: quotedAt.toISOString(),
      scheduled: parsed.data.at !== undefined,
      nightSafe,
      computedAt: new Date().toISOString(),
    });
  });

  router.get("/disruptions/:id/sources", async (request, response) => {
    const evidence = await listNoticeEvidence(deps.db, request.params.id ?? "");
    if (!evidence) {
      response.status(404).json({ error: "Notice not found" });
      return;
    }
    response.json(evidence);
  });

  router.get("/disruptions", async (request, response) => {
    const since = typeof request.query["since"] === "string" ? new Date(request.query["since"]) : undefined;
    const sinceIsValid = since !== undefined && !Number.isNaN(since.getTime());
    const [{ network }, rows] = await Promise.all([
      deps.cache.get(),
      listActiveDisruptions(deps.db, {
        limit: 100,
        ...(sinceIsValid ? { since } : {}),
      }),
    ]);
    let list = rows.map(rowToDisruption);
    if (sinceIsValid && since) {
      const cutoff = since.getTime();
      list = list.filter((disruption) => new Date(disruption.publishedAt).getTime() >= cutoff);
    }
    // The board is what is in force now. A notice whose window starts later
    // is kept in the table but is not on the board yet.
    list = list.filter((disruption) => isActiveAt(disruption));
    response.json(
      list.map((disruption) => summarize(disruption, "direct", network)),
    );
  });

  return router;
}

function rowToDisruption(row: {
  id: string;
  source: string;
  sourceType: string;
  systemId: string | null;
  lineId: string | null;
  stationId: string | null;
  stationGroupId: string | null;
  severity: string;
  status: string;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  confidence: number;
  publishedAt: Date;
  observedAt: Date;
  lastSeenAt?: Date;
  resolvedAt: Date | null;
  eventKey?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  reviewAt?: Date | null;
  reviewState?: string | null;
  lastVerifiedAt?: Date | null;
  validityWindows?: unknown;
  affectedStationIds: unknown;
  affectedLineIds: unknown;
  scope?: string | null;
  lineCodes?: unknown;
  roads?: unknown;
  metadata?: unknown;
}): Disruption {
  return {
    id: row.id,
    source: row.source,
    sourceType: row.sourceType as Disruption["sourceType"],
    systemId: row.systemId,
    lineId: row.lineId,
    stationId: row.stationId,
    stationGroupId: row.stationGroupId,
    severity: row.severity as Disruption["severity"],
    status: row.status as Disruption["status"],
    kind: row.kind as Disruption["kind"],
    title: row.title,
    body: row.body,
    url: row.url,
    confidence: row.confidence,
    publishedAt: row.publishedAt.toISOString(),
    observedAt: row.observedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    eventKey: row.eventKey ?? null,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    reviewAt: row.reviewAt?.toISOString() ?? null,
    reviewState: row.reviewState ?? null,
    lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
    validityWindows: validityWindowsOf(row.validityWindows),
    ...(row.lastSeenAt ? { lastSeenAt: row.lastSeenAt.toISOString() } : {}),
    affectedStationIds: Array.isArray(row.affectedStationIds)
      ? row.affectedStationIds.filter((id): id is string => typeof id === "string")
      : [],
    affectedLineIds: Array.isArray(row.affectedLineIds)
      ? row.affectedLineIds.filter((id): id is string => typeof id === "string")
      : [],
    scope: scopeOf(row.scope),
    lineCodes: stringList(row.lineCodes),
    roads: roadsOf(row.roads),
    direction: directionOf(row.metadata),
    towards: towardsOf(row.metadata),
    platforms: platformsOf(row.metadata),
    viaToll: viaTollOf(row.metadata),
    diversions: diversionsFromMetadata(
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as { diversions?: unknown }).diversions
        : undefined,
    ),
    ...(diversionDescriptionOf(row.metadata)
      ? { diversionDescription: diversionDescriptionOf(row.metadata) }
      : {}),
    mark: storedMark(row.metadata),
  };
}

function diversionDescriptionOf(value: unknown): Disruption["diversionDescription"] {
  if (!value || typeof value !== "object") return null;
  const metadata = value as { diversion?: unknown };
  const entry = metadata.diversion;
  if (!entry || typeof entry !== "object") return null;
  const diversion = entry as Record<string, unknown>;
  const from = typeof diversion["from"] === "string" ? diversion["from"] : null;
  const to = typeof diversion["to"] === "string" ? diversion["to"] : null;
  const via = Array.isArray(diversion["via"])
    ? diversion["via"].filter((name): name is string => typeof name === "string")
    : [];
  const follows = Array.isArray(diversion["follows"])
    ? diversion["follows"].filter((name): name is string => typeof name === "string")
    : [];
  return { from, to, via, follows };
}

function viaTollOf(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && (value as { viaToll?: unknown }).viaToll === true);
}

function directionOf(value: unknown): "forward" | "backward" | null {
  if (!value || typeof value !== "object") return null;
  const direction = (value as { direction?: unknown }).direction;
  return direction === "forward" || direction === "backward" ? direction : null;
}

function platformsOf(value: unknown): { lineId: string; direction: "forward" | "backward" }[] {
  if (!value || typeof value !== "object") return [];
  const platforms = (value as { platforms?: unknown }).platforms;
  if (!Array.isArray(platforms)) return [];
  return platforms.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const lineId = (entry as { lineId?: unknown }).lineId;
    const direction = (entry as { direction?: unknown }).direction;
    if (typeof lineId !== "string" || (direction !== "forward" && direction !== "backward")) {
      return [];
    }
    const stationId = (entry as { stationId?: unknown }).stationId;
    const platformId = (entry as { platformId?: unknown }).platformId;
    return [
      {
        lineId,
        direction,
        ...(typeof stationId === "string" ? { stationId } : {}),
        ...(typeof platformId === "string" ? { platformId } : {}),
      },
    ];
  });
}

function towardsOf(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const towards = (value as { towards?: unknown }).towards;
  return typeof towards === "string" ? towards : null;
}

function scopeOf(value: string | null | undefined): NoticeScope | null {
  return value === "stop" || value === "line" || value === "network" ? value : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function roadsOf(value: unknown): RoadRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const road = entry as Partial<RoadRef>;
    if (typeof road.name !== "string" || typeof road.osmId !== "number") return [];
    return [
      {
        name: road.name,
        osmType: road.osmType ?? "way",
        osmId: road.osmId,
        latitude: typeof road.latitude === "number" ? road.latitude : 0,
        longitude: typeof road.longitude === "number" ? road.longitude : 0,
        stationIds: stringList(road.stationIds),
      },
    ];
  });
}

function validityWindowsOf(value: unknown): NonNullable<Disruption["validityWindows"]> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is NonNullable<Disruption["validityWindows"]>[number] =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as { startsAt?: unknown }).startsAt === "string" &&
      typeof (entry as { endsAt?: unknown }).endsAt !== "undefined",
  );
}

/**
 * One notice, as the board and the map read it.
 *
 * A notice is about a stop, a corridor, or an operator's whole service.
 * `stations` and `lines` carry the grounded records, so the interface never
 * has to look an id up to draw the row, and `scope` says which of them the
 * notice is about.
 */
function summarize(
  disruption: Disruption,
  impact: "direct" | "station" | "line",
  network: TransitNetwork,
): Record<string, unknown> {
  const stations = stationsOf(network, disruption);
  const lines = linesOf(network, disruption);
  const first = stations[0];
  return {
    scope: noticeScopeOf(disruption),
    stations,
    lines,
    lineCodes: disruption.lineCodes ?? lines.map((line) => line.code),
    roads: (disruption.roads ?? []).map((road) => ({
      name: road.name,
      latitude: road.latitude,
      longitude: road.longitude,
      osmId: road.osmId,
    })),
    id: disruption.id,
    title: disruption.title,
    body: disruption.body,
    severity: disruption.severity,
    kind: disruption.kind,
    status: disruption.status,
    systemId: disruption.systemId,
    source: disruption.source,
    sourceType: disruption.sourceType,
    url: disruption.url,
    lineId: disruption.lineId,
    stationId: disruption.stationId,
    direction: disruption.direction ?? null,
    towards: disruption.towards ?? null,
    affectedStationIds: disruption.affectedStationIds,
    affectedLineIds: disruption.affectedLineIds,
    publishedAt: disruption.publishedAt,
    observedAt: disruption.observedAt,
    startsAt: disruption.startsAt ?? null,
    endsAt: disruption.endsAt ?? null,
    validityWindows: disruption.validityWindows ?? [],
    activeNow: isActiveAt(disruption),
    eventKey: disruption.eventKey ?? null,
    lastSeenAt: disruption.lastSeenAt ?? null,
    reviewAt: disruption.reviewAt ?? null,
    reviewState: disruption.reviewState ?? null,
    lastVerifiedAt: disruption.lastVerifiedAt ?? null,
    impact,
    demonstration: isDemonstration(disruption),
    blocksService: removesService(disruption) && noticeScopeOf(disruption) !== "stop",
    viaToll: disruption.viaToll === true,
    diversionDescription: disruption.diversionDescription ?? null,
    diversions: (disruption.diversions ?? []).map((diversion) => ({
      lineId: diversion.lineId,
      direction: diversion.direction,
      fromStationId: diversion.fromStationId,
      toStationId: diversion.toStationId,
      via: diversion.via,
      viaLineCodes: diversion.viaLineCodes ?? [],
      skippedStationIds: diversion.skippedStationIds ?? [],
      skippedNames: (diversion.skippedStationIds ?? [])
        .map((stationId) => network.stations.find((station) => station.id === stationId)?.name)
        .filter((name): name is string => Boolean(name)),
      approximate: diversion.approximate,
      sourceUrl: diversion.sourceUrl ?? null,
      quote: diversion.quote ?? null,
    })),
    mark: disruption.mark ?? null,
    latitude: first?.latitude ?? null,
    longitude: first?.longitude ?? null,
    stationName: first?.name ?? null,
  };
}

/** The stops that are out of service right now, from a closure about them. */
function closedStopIds(disruptions: readonly Disruption[], at: Date): Set<string> {
  const ids = new Set<string>();
  for (const disruption of disruptions) {
    if (!isActiveAt(disruption, at)) continue;
    if (noticeScopeOf(disruption) !== "stop") continue;
    if (!removesService(disruption)) continue;
    // A platform-scoped closure does not close the whole station. Moving
    // the boarding point would strand the direction that still runs; the
    // planner's direction-aware matching decides whether this journey uses
    // the platform.
    if (disruption.platforms && disruption.platforms.length > 0) continue;
    if (disruption.stationId) ids.add(disruption.stationId);
    for (const stationId of disruption.affectedStationIds) ids.add(stationId);
  }
  return ids;
}

/** The corridors that are out of service right now. */
function closedLineIds(disruptions: readonly Disruption[], at: Date): Set<string> {
  const ids = new Set<string>();
  for (const disruption of disruptions) {
    if (!isActiveAt(disruption, at)) continue;
    if (noticeScopeOf(disruption) === "stop") continue;
    if (!removesService(disruption)) continue;
    if (disruption.lineId) ids.add(disruption.lineId);
    for (const lineId of disruption.affectedLineIds) ids.add(lineId);
  }
  return ids;
}

/**
 * The stop to walk to when the one the rider named is closed.
 *
 * The closest stop is not always the right one. Every candidate is planned
 * against, and the one whose journey plus walk is quickest wins.
 */
function pickAccess(
  network: TransitNetwork,
  from: { latitude: number; longitude: number },
  closed: ReadonlySet<string>,
  costOf: (station: Station) => number | null,
): ReturnType<typeof bestAccess> {
  // Three nearest is not enough: the nearest stops can be poorly connected
  // while a stop four hundred metres away is on the same corridor. Plan
  // against a wider ring and let the total cost choose.
  const candidates = stopsWithinWalk(network, from, { exclude: closed, maxKm: 1.2, limit: 8 });
  return bestAccess(candidates, costOf);
}

function dedupeItineraries(itineraries: readonly Itinerary[]): Itinerary[] {
  const seen = new Set<string>();
  const unique: Itinerary[] = [];
  for (const itinerary of itineraries) {
    const key = itinerary.legs
      .map(
        (leg) =>
          `${leg.kind}:${leg.lineId ?? "walk"}:${leg.fromStationId ?? "-"}:${leg.toStationId ?? "-"}`,
      )
      .join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(itinerary);
  }
  return unique;
}

function pointOfStop(stop: { latitude: number; longitude: number }): Pin {
  return { latitude: stop.latitude, longitude: stop.longitude };
}

/** A station as the shape the walk helpers expect. */
function asStopChoice(station: Station): StopChoice {
  return {
    stationId: station.id,
    name: station.name,
    systemId: station.systemId,
    latitude: station.latitude,
    longitude: station.longitude,
    score: 1,
    distanceKm: 0,
  };
}

function stationsOf(network: TransitNetwork, disruption: Disruption) {
  const ids = [
    ...(disruption.stationId ? [disruption.stationId] : []),
    ...disruption.affectedStationIds,
  ];
  const seen = new Set<string>();
  const stations: { id: string; name: string; systemId: string; latitude: number; longitude: number }[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const station = network.stations.find((entry) => entry.id === id);
    if (!station) continue;
    stations.push({
      id: station.id,
      name: station.name,
      systemId: station.systemId,
      latitude: station.latitude,
      longitude: station.longitude,
    });
  }
  return stations;
}

function linesOf(network: TransitNetwork, disruption: Disruption) {
  const ids = [
    ...(disruption.lineId ? [disruption.lineId] : []),
    ...disruption.affectedLineIds,
  ];
  const seen = new Set<string>();
  const lines: { id: string; code: string; name: string; systemId: string }[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const line = network.lines.find((entry) => entry.id === id);
    if (!line) continue;
    lines.push({
      id: line.id,
      code: line.code,
      name: line.name,
      systemId: line.systemId,
    });
  }
  return lines;
}

type Pin = { latitude: number; longitude: number };

type StopChoice = {
  stationId: string;
  name: string;
  systemId: string;
  latitude: number;
  longitude: number;
  score: number;
  /** Kilometres from the pinned place. Zero when the rider named the stop. */
  distanceKm: number;
};

type WalkAttachment = {
  reason: "access" | "egress";
  durationMinutes: number;
  distanceKm: number;
  geometry: { latitude: number; longitude: number }[];
  placeLabel: string;
  stationId: string;
  stationName: string;
  stationLatitude: number;
  stationLongitude: number;
};

function pinOf(latitude: number | undefined, longitude: number | undefined): Pin | null {
  if (latitude === undefined || longitude === undefined) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

async function resolveNamedStop(deps: ApiDeps, text: string): Promise<StopChoice | null> {
  const candidates = await deps.resolver.resolve(text, { limit: 3 });
  const best = candidates[0];
  if (!best || best.score < PLACE_CONFIDENCE_THRESHOLD) return null;
  return {
    stationId: best.stationId,
    name: best.name,
    systemId: best.systemId,
    latitude: best.latitude,
    longitude: best.longitude,
    score: Number(best.score.toFixed(3)),
    distanceKm: 0,
  };
}

async function nearbyStops(deps: ApiDeps, pin: Pin, limit: number): Promise<StopChoice[]> {
  const rows = await findStationsNear(deps.db, pin, { radiusKm: 1.5, limit });
  return rows.map((row) => ({
    stationId: row.id,
    name: row.name,
    systemId: row.systemId,
    latitude: row.latitude,
    longitude: row.longitude,
    score: 1,
    distanceKm: Number(row.distanceKm),
  }));
}

/**
 * The stops the rider actually boards and alights at.
 *
 * A named halte is used as it is. A place that is not a stop is matched
 * to the nearby stop whose whole journey, walk included, is the shortest.
 */
async function chooseStops(
  deps: ApiDeps,
  network: TransitNetwork,
  input: {
    origin: StopChoice | null;
    destination: StopChoice | null;
    originPin: Pin | null;
    destinationPin: Pin | null;
  },
): Promise<{ origin: StopChoice; destination: StopChoice } | null> {
  if (input.origin && input.destination) {
    return { origin: input.origin, destination: input.destination };
  }

  if (input.origin && input.destinationPin) {
    const near = await nearbyStops(deps, input.destinationPin, 20);
    const destination = bestStop(network, near, input.origin.stationId, "to");
    return destination ? { origin: input.origin, destination } : null;
  }

  if (input.destination && input.originPin) {
    const near = await nearbyStops(deps, input.originPin, 20);
    const origin = bestStop(network, near, input.destination.stationId, "from");
    return origin ? { origin, destination: input.destination } : null;
  }

  if (!input.originPin || !input.destinationPin) return null;

  const origins = await nearbyStops(deps, input.originPin, 6);
  const destinations = await nearbyStops(deps, input.destinationPin, 6);
  let winner: { origin: StopChoice; destination: StopChoice; total: number } | null = null;

  for (const origin of origins) {
    for (const destination of destinations) {
      if (origin.stationId === destination.stationId) continue;
      const itinerary = planRoutes(network, origin.stationId, destination.stationId, {
        maxAlternatives: 1,
      })[0];
      if (!itinerary) continue;
      const total =
        itinerary.durationMinutes +
        walkingMinutes(origin.distanceKm) +
        walkingMinutes(destination.distanceKm);
      if (!winner || total < winner.total) winner = { origin, destination, total };
    }
  }

  return winner ? { origin: winner.origin, destination: winner.destination } : null;
}

/** The nearby stop that makes the whole journey shortest. */
function bestStop(
  network: TransitNetwork,
  options: readonly StopChoice[],
  otherId: string,
  direction: "from" | "to",
): StopChoice | null {
  let winner: { stop: StopChoice; total: number } | null = null;

  for (const stop of options) {
    if (stop.stationId === otherId) continue;
    const itinerary = (
      direction === "from"
        ? planRoutes(network, stop.stationId, otherId, { maxAlternatives: 1 })
        : planRoutes(network, otherId, stop.stationId, { maxAlternatives: 1 })
    )[0];
    if (!itinerary) continue;
    const total = itinerary.durationMinutes + walkingMinutes(stop.distanceKm);
    if (!winner || total < winner.total) winner = { stop, total };
  }

  return winner?.stop ?? null;
}

/**
 * The walk between a place and the stop that serves it.
 *
 * A place a few metres from the stop needs no directions. When the
 * pedestrian router has no path, the time is still the planner's own
 * estimate and the map is left without a line it would have to invent.
 */
async function walkBetween(
  from: Pin,
  to: Pin & { stationId?: string; name?: string },
  placeLabel: string,
  reason: "access" | "egress",
  station: StopChoice,
): Promise<WalkAttachment | null> {
  const straightKm = haversineKm(from, to);
  if (straightKm < 0.05) return null;

  const routed = await fetchWalkingRoute(from, to);
  return {
    reason,
    durationMinutes: routed?.durationMinutes ?? walkingMinutes(straightKm),
    distanceKm: routed?.distanceKm ?? Number(straightKm.toFixed(3)),
    geometry: routed?.geometry ?? [],
    placeLabel,
    stationId: station.stationId,
    stationName: station.name,
    stationLatitude: station.latitude,
    stationLongitude: station.longitude,
  };
}

type PresentedLeg = ReturnType<typeof legsOf>[number];

function walkLeg(walk: WalkAttachment): PresentedLeg {
  const stationStop = {
    stationId: walk.stationId,
    name: walk.stationName,
    latitude: walk.stationLatitude,
    longitude: walk.stationLongitude,
  };
  const towardStation = walk.reason === "access";

  return {
    kind: "walk",
    mode: "walk",
    lineId: null,
    lineName: null,
    lineCode: null,
    serviceClass: null,
    temporary: false,
    fromStationId: towardStation ? null : walk.stationId,
    toStationId: towardStation ? walk.stationId : null,
    fromName: towardStation ? walk.placeLabel : walk.stationName,
    toName: towardStation ? walk.stationName : walk.placeLabel,
    durationMinutes: walk.durationMinutes,
    distanceKm: Number(walk.distanceKm.toFixed(2)),
    walkReason: walk.reason,
    nextLineName: null,
    waitMinutes: 0,
    serviceLabel: null,
    headwayMinMinutes: null,
    headwayMaxMinutes: null,
    outsideService: false,
    serviceDetail: null,
    changedFrom: null,
    changedAt: null,
    direction: null,
    directionLabel: null,
    fromPlatform: null,
    toPlatform: null,
    patternId: null,
    patternLabel: null,
    patternType: null,
    patternService: null,
    variants: [],
    detour: null,
    geometry: walk.geometry,
    stops: [stationStop],
  };
}

/**
 * A walk the planner drew as a straight line is asked of the pedestrian
 * router, so the map follows the street between the two stops.
 *
 * The distance and the time stay the planner's. Only the line changes,
 * and only when the router has a path. A missing router leaves the
 * straight line, because dropping it would open a gap in the journey.
 */
async function followStreets<T extends { legs: { kind: string; geometry: { latitude: number; longitude: number }[]; distanceKm: number }[] }>(
  itinerary: T,
): Promise<T> {
  const legs = await Promise.all(
    itinerary.legs.map(async (leg) => {
      if (leg.kind !== "walk" || leg.geometry.length !== 2 || leg.distanceKm < 0.05) return leg;
      const from = leg.geometry[0];
      const to = leg.geometry[1];
      if (!from || !to) return leg;
      const routed = await fetchWalkingRoute(from, to);
      if (!routed || routed.geometry.length < 2) return leg;
      return { ...leg, geometry: routed.geometry };
    }),
  );
  return { ...itinerary, legs };
}

function presentItinerary(
  itinerary: Itinerary,
  fare: ReturnType<typeof fareOf>,
  access: WalkAttachment | null,
  egress: WalkAttachment | null,
  network: TransitNetwork,
  disruptions: readonly Disruption[],
  at: Date,
) {
  const legs = legsOf(itinerary, network, disruptions, at);
  const geometry = [...itinerary.coordinates];
  let durationMinutes = itinerary.durationMinutes;
  let walkingKm = itinerary.walkingKm;
  let distanceKm = itinerary.distanceKm;

  const add = (walk: WalkAttachment | null, where: "start" | "end"): void => {
    if (!walk) return;
    const leg = walkLeg(walk);
    if (where === "start") {
      legs.unshift(leg);
      geometry.unshift(...leg.geometry);
    } else {
      legs.push(leg);
      geometry.push(...leg.geometry);
    }
    durationMinutes += leg.durationMinutes;
    walkingKm += leg.distanceKm;
    distanceKm += leg.distanceKm;
  };

  add(access, "start");
  add(egress, "end");

  return {
    durationMinutes,
    transferCount: itinerary.transferCount,
    distanceKm: Number(distanceKm.toFixed(2)),
    walkingKm: Number(walkingKm.toFixed(2)),
    cost: itinerary.cost,
    lines: linesUsedBy(itinerary),
    fare,
    legs,
    geometry,
  };
}

/**
 * The price of a journey.
 *
 * The rules live in the database, next to the network they belong to, and
 * the moment of the day decides the hours the operators charge less.
 */
function fareOf(itinerary: Itinerary, rules: FareRules | null, at: Date) {
  if (!rules) {
    return {
      available: false,
      totalIdr: null,
      label: null,
      breakdown: [],
      alternatives: [],
      notes: ["The fare is not in the network data."],
    };
  }

  const quote = quoteFare({
    at,
    rules,
    labels: FARE_OPERATOR_LABELS,
    legs: fareLegsOf(itinerary),
  });

  return {
    available: true,
    totalIdr: quote.totalIdr,
    label: formatRupiah(quote.totalIdr),
    breakdown: quote.breakdown,
    alternatives: quote.alternatives,
    notes: quote.notes,
  };
}
