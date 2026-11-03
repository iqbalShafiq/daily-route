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

    /*
     * A stop whose name contains what was typed is a real answer. A stop
     * the resolver only reached by meaning is a fallback: it comes after
     * the landmarks, and only when the list is still short. Without that
     * split, "grand" offered two stops with "grand" in the name and then
     * two stops that merely sounded close, while the mall was pushed out.
     */
    const candidates = resolved.filter(
      (candidate) => candidate.score >= MINIMUM_SUGGESTION_SCORE,
    );
    const stationOf = (candidate: (typeof candidates)[number]) => ({
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
    });

    const stations = candidates
      .filter((candidate) => candidate.matchedRanges.length > 0)
      .slice(0, 3)
      .map(stationOf);
    const looseStations = candidates
      .filter((candidate) => candidate.matchedRanges.length === 0)
      .slice(0, 2)
      .map(stationOf);

    const stationNames = new Set(candidates.map((station) => station.name.toLowerCase()));
    const landmarks = places
      .filter((place) => !stationNames.has(place.name.toLowerCase()))
      .filter(
        (place) =>
          !candidates.some(
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
        detail: place.kind,
        matchedRanges: [],
      }));

    /*
     * The name that starts with what was typed is the better answer.
     * "grand indonesia" otherwise put two banks that contain "Indonesia"
     * above the mall of that name. The sort is stable, so a stop still
     * comes before a landmark when they match equally well.
     */
    const needle = q.trim().toLowerCase().replace(/\s+/g, " ");
    const leading = needle.split(" ").filter(Boolean).slice(0, 2).join(" ");
    const rankOf = (name: string): number => {
      const value = name.trim().toLowerCase().replace(/\s+/g, " ");
      if (value === needle) return 0;
      if (value.startsWith(needle)) return 1;
      // "grand indonesia mall" still finds Grand Indonesia: the name
      // owns the first two words, and the last one is a category.
      if (leading.length >= 4 && value.startsWith(leading)) return 1;
      if (value.includes(needle)) return 2;
      return 3;
    };

    const ordered = [...stations, ...landmarks, ...looseStations]
      .map((row, index) => ({ row, index, rank: rankOf(row.name) }))
      .sort((left, right) => left.rank - right.rank || left.index - right.index)
      .slice(0, limit)
      .map((entry) => entry.row);

    response.json(ordered);
  });

  return router;
}
