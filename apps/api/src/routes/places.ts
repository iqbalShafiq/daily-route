import { Router } from "express";
import { z } from "zod";

import { searchPlaces } from "../geocode.js";
import type { ApiDeps } from "../deps.js";

/**
 * Suggestions for the place field.
 *
 * A halte or a stasiun comes first, because that is what the planner
 * rides from. A landmark, a street or a building follows, so a rider can
 * start and finish somewhere that is not a stop. The walk between that
 * place and the stop is planned separately.
 */

const querySchema = z.object({
  q: z.string().trim().min(2).max(120),
  limit: z.coerce.number().int().min(1).max(8).default(6),
});

const MINIMUM_SUGGESTION_SCORE = 0.32;

export function createPlacesRouter(deps: ApiDeps): Router {
  const router = Router();

  router.get("/", async (request, response) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid request", detail: parsed.error.issues });
      return;
    }

    const { q, limit } = parsed.data;
    const [resolved, places] = await Promise.all([
      deps.resolver.resolve(q, { limit: 6 }),
      searchPlaces(q),
    ]);

    const stations = resolved
      .filter((candidate) => candidate.score >= MINIMUM_SUGGESTION_SCORE)
      .slice(0, 4)
      .map((candidate) => ({
        kind: "station" as const,
        id: candidate.stationId,
        name: candidate.name,
        systemId: candidate.systemId,
        systemName: candidate.systemName,
        code: candidate.code,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        isInterchange: candidate.isInterchange,
        lineCount: candidate.lineCount,
        street: candidate.street ?? null,
        matchedRanges: candidate.matchedRanges,
      }));

    const stationNames = new Set(stations.map((station) => station.name.toLowerCase()));
    const landmarks = places
      .filter((place) => !stationNames.has(place.name.toLowerCase()))
      .filter(
        (place) =>
          !stations.some(
            (station) =>
              Math.abs(station.latitude - place.latitude) < 0.0008 &&
              Math.abs(station.longitude - place.longitude) < 0.0008,
          ),
      )
      .map((place) => ({
        kind: "place" as const,
        id: place.id,
        name: place.name,
        systemId: null,
        systemName: null,
        code: null,
        latitude: place.latitude,
        longitude: place.longitude,
        isInterchange: false,
        lineCount: 0,
        street: place.detail,
        detail: "Place",
        matchedRanges: [],
      }));

    response.json([...stations, ...landmarks].slice(0, limit));
  });

  return router;
}
