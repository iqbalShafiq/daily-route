import { Router } from "express";
import { z } from "zod";
import { searchMapPlaces } from "@daily-route/db";

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
  limit: z.coerce.number().int().min(1).max(8).default(8),
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
    const [resolved, local] = await Promise.all([
      deps.resolver.resolve(q, { limit: 6 }),
      searchMapPlaces(deps.db, q, { limit: 8 }),
    ]);
    /*
     * The Overture extract is the directory. The geocoder is only a
     * fallback for a street, an address, or a name the extract does not
     * hold, so a normal search costs no external request.
     */
    const external =
      local.length >= 3
        ? []
        : await searchPlaces(q, { googleKey: deps.env.GOOGLE_MAPS_API_KEY });

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

    const stationNames = new Set(candidates.map((station) => normaliseName(station.name)));
    const localPlaces = dedupeNearby(
      local
        .filter((place) => !stationNames.has(normaliseName(place.name)))
        .filter((place) => !candidates.some((station) => near(station, place)))
        .map((place) => ({
          kind: "place" as const,
          id: `overture:${place.id}`,
          name: place.name,
          systemId: null,
          systemName: null,
          code: null,
          latitude: place.latitude,
          longitude: place.longitude,
          isInterchange: false,
          lineCount: 0,
          street: place.address ?? place.locality ?? null,
          detail: labelOfCategory(place.category),
          source: "overture" as const,
          matchedRanges: [],
        })),
    );

    const localNames = new Set(localPlaces.map((place) => normaliseName(place.name)));
    const landmarks = dedupeNearby(
      external
        .filter((place) => !stationNames.has(normaliseName(place.name)))
        .filter((place) => !localNames.has(normaliseName(place.name)))
        .filter((place) => !candidates.some((station) => near(station, place)))
        .filter((place) => !local.some((entry) => near(entry, place, 0.0015)))
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
          source: place.source,
          matchedRanges: [],
        })),
    );

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

    const ordered = [...stations, ...localPlaces, ...landmarks, ...looseStations]
      .map((row, index) => ({ row, index, rank: rankOf(row.name) }))
      .sort((left, right) => left.rank - right.rank || left.index - right.index)
      .slice(0, limit)
      .map((entry) => entry.row);

    response.json(ordered);
  });

  return router;
}

/** A category key as the label the suggestion list shows. */
function labelOfCategory(value: string | null): string | undefined {
  if (!value) return undefined;
  const label = value.replace(/_/g, " ").trim();
  if (!label) return undefined;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function normaliseName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The same name within a small box is one suggestion, not two. */
function dedupeNearby<T extends { name: string; latitude: number; longitude: number }>(
  rows: readonly T[],
  tolerance = 0.0015,
): T[] {
  const kept: T[] = [];
  for (const row of rows) {
    const name = normaliseName(row.name);
    if (
      kept.some(
        (other) => normaliseName(other.name) === name && near(other, row, tolerance),
      )
    ) {
      continue;
    }
    kept.push(row);
  }
  return kept;
}

/** Whether two points are closer than `tolerance` degrees on both axes. */
function near(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
  tolerance = 0.0008,
): boolean {
  return (
    Math.abs(left.latitude - right.latitude) < tolerance &&
    Math.abs(left.longitude - right.longitude) < tolerance
  );
}
