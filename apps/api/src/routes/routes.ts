import { Router } from "express";
import { z } from "zod";

import { listActiveDisruptions } from "@daily-route/db";
import { PLACE_CONFIDENCE_THRESHOLD } from "@daily-route/semantic";
import {
  FARE_OPERATOR_LABELS,
  fareOperatorFor,
  linesUsedBy,
  matchDisruptions,
  planRoutes,
  quoteFare,
  removesService,
  formatRupiah,
  type Disruption,
  type FareRules,
  type Itinerary,
} from "@daily-route/transit";

import type { ApiDeps } from "../deps.js";

/**
 * The route-planning endpoint.
 *
 * It answers the same question the agent answers, but without a model in the
 * loop: the caller supplies two places, the API resolves them and returns
 * the itineraries together with the disruptions that affect them.
 */

const planSchema = z.object({
  origin: z.string().min(1).max(200),
  destination: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(5).default(3),
});

export function createRoutesRouter(deps: ApiDeps): Router {
  const router = Router();

  router.get("/plan", async (request, response) => {
    const parsed = planSchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ error: "Parameter tidak valid", detail: parsed.error.issues });
      return;
    }

    const { origin, destination, limit } = parsed.data;
    const [originCandidates, destinationCandidates] = await Promise.all([
      deps.resolver.resolve(origin, { limit: 3 }),
      deps.resolver.resolve(destination, { limit: 3 }),
    ]);

    const originStation = originCandidates[0];
    const destinationStation = destinationCandidates[0];

    // A low score means the place was not really found: answering with a
    // route to a half-matched station would be worse than asking again.
    const originConfident = originStation && originStation.score >= PLACE_CONFIDENCE_THRESHOLD;
    const destinationConfident =
      destinationStation && destinationStation.score >= PLACE_CONFIDENCE_THRESHOLD;

    if (!originConfident || !destinationConfident) {
      response.status(404).json({
        error: "Tempat tidak ditemukan atau terlalu ambigu",
        origin: originCandidates,
        destination: destinationCandidates,
      });
      return;
    }

    const { network, disruptions } = await deps.cache.get();
    const itineraries = planRoutes(network, originStation.stationId, destinationStation.stationId, {
      maxAlternatives: limit,
    });

    const primary = itineraries[0];
    const matches = primary ? matchDisruptions(primary, disruptions) : [];
    const blocking = matches.filter((match) => removesService(match.disruption));

    const alternatives = blocking.length
      ? planRoutes(network, originStation.stationId, destinationStation.stationId, {
          maxAlternatives: 2,
          avoidLineIds: [...new Set(blocking.flatMap((match) => match.lineIds))],
          avoidStationIds: [...new Set(blocking.flatMap((match) => match.stationIds))],
        })
      : [];

    const fareRules = (await deps.cache.get()).fareRules;
    const quotedAt = new Date();

    response.json({
      origin: {
        text: origin,
        stationId: originStation.stationId,
        name: originStation.name,
        systemId: originStation.systemId,
        latitude: originStation.latitude,
        longitude: originStation.longitude,
        score: Number(originStation.score.toFixed(3)),
      },
      destination: {
        text: destination,
        stationId: destinationStation.stationId,
        name: destinationStation.name,
        systemId: destinationStation.systemId,
        latitude: destinationStation.latitude,
        longitude: destinationStation.longitude,
        score: Number(destinationStation.score.toFixed(3)),
      },
      itineraries: itineraries.map((itinerary) => ({
        durationMinutes: itinerary.durationMinutes,
        transferCount: itinerary.transferCount,
        distanceKm: itinerary.distanceKm,
        walkingKm: itinerary.walkingKm,
        cost: itinerary.cost,
        lines: linesUsedBy(itinerary),
        fare: fareOf(itinerary, fareRules, quotedAt),
        legs: itinerary.legs.map((leg) => ({
          kind: leg.kind,
          mode: leg.mode,
          lineId: leg.lineId,
          lineName: leg.lineName,
          lineCode: leg.lineCode,
          serviceClass: leg.serviceClass,
          fromStationId: leg.fromStationId,
          toStationId: leg.toStationId,
          fromName: leg.fromName,
          toName: leg.toName,
          durationMinutes: leg.durationMinutes,
          distanceKm: Number(leg.distanceKm.toFixed(2)),
          walkReason: leg.walkReason,
          nextLineName: leg.nextLineName,
          waitMinutes: leg.waitMinutes,
          changedFrom: leg.changedFrom,
          changedAt: leg.changedAt,
          stops: leg.stops.map((stop) => ({
            stationId: stop.stationId,
            name: stop.name,
            latitude: stop.latitude,
            longitude: stop.longitude,
          })),
        })),
        geometry: itinerary.coordinates,
      })),
      alternatives: alternatives.map((itinerary) => ({
        durationMinutes: itinerary.durationMinutes,
        transferCount: itinerary.transferCount,
        distanceKm: itinerary.distanceKm,
        walkingKm: itinerary.walkingKm,
        cost: itinerary.cost,
        lines: linesUsedBy(itinerary),
        fare: fareOf(itinerary, fareRules, quotedAt),
        geometry: itinerary.coordinates,
        legs: itinerary.legs.map((leg) => ({
          kind: leg.kind,
          lineId: leg.lineId,
          lineName: leg.lineName,
          fromName: leg.fromName,
          toName: leg.toName,
          durationMinutes: leg.durationMinutes,
        })),
      })),
      disruptions: matches.map((match) => summarize(match.disruption, match.impact)),
    });
  });

  router.get("/disruptions", async (request, response) => {
    const since = typeof request.query["since"] === "string" ? new Date(request.query["since"]) : undefined;
    const rows = await listActiveDisruptions(deps.db, {
      limit: 100,
      ...(since && !Number.isNaN(since.getTime()) ? { since } : {}),
    });
    response.json(
      rows.map((row) =>
        summarize(
          {
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
            affectedStationIds: (row.affectedStationIds as string[]) ?? [],
            affectedLineIds: (row.affectedLineIds as string[]) ?? [],
          },
          "direct",
        ),
      ),
    );
  });

  return router;
}

function summarize(
  disruption: Disruption,
  impact: "direct" | "station" | "line",
): Record<string, unknown> {
  return {
    id: disruption.id,
    title: disruption.title,
    body: disruption.body,
    severity: disruption.severity,
    kind: disruption.kind,
    status: disruption.status,
    source: disruption.source,
    sourceType: disruption.sourceType,
    url: disruption.url,
    lineId: disruption.lineId,
    stationId: disruption.stationId,
    affectedStationIds: disruption.affectedStationIds,
    affectedLineIds: disruption.affectedLineIds,
    publishedAt: disruption.publishedAt,
    impact,
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
      notes: ["Tarif belum tersedia di data jaringan."],
    };
  }

  const quote = quoteFare({
    at,
    rules,
    labels: FARE_OPERATOR_LABELS,
    legs: itinerary.legs.map((leg) => ({
      kind: leg.kind,
      operator:
        leg.kind === "ride" && leg.lineId
          ? fareOperatorFor({
              systemId: leg.lineId.split(":")[0] ?? "",
              serviceClass: leg.serviceClass,
            })
          : null,
      distanceKm: leg.distanceKm,
      stopCount: leg.stops.length,
    })),
  });

  return {
    available: true,
    totalIdr: quote.totalIdr,
    label: formatRupiah(quote.totalIdr),
    breakdown: quote.breakdown,
    notes: quote.notes,
  };
}
