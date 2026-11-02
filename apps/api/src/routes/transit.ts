import { Router } from "express";
import { z } from "zod";

import { listLines, listSystems } from "@daily-route/db";
import {
  networkOverview,
  networkPlatforms,
  networkPlaces,
  serviceAt,
} from "@daily-route/transit";

import type { ApiDeps } from "../deps.js";

/**
 * Read-only endpoints over the transit network: the systems, their lines,
 * and the stations a rider might be looking for.
 */

/**
 * The lowest score a suggestion may have.
 *
 * Below it the result is noise. Between it and the planner's threshold it
 * is a weak match, and the interface says so.
 */
const MINIMUM_SUGGESTION_SCORE = 0.08;

const stationQuerySchema = z.object({
  q: z.string().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  systemId: z.string().optional(),
  /**
   * The lowest score a suggestion may have.
   *
   * The same rule the planner uses: a place that is not found well enough
   * to plan a route to is not worth offering either.
   */
  minScore: z.coerce.number().min(0).max(1).optional(),
});

export function createTransitRouter(deps: ApiDeps): Router {
  const router = Router();

  router.get("/network/overview", async (_request, response) => {
    const { network } = await deps.cache.get();
    response.json({
      lines: networkOverview(network),
      places: networkPlaces(network),
      platforms: networkPlatforms(network),
    });
  });

  router.get("/systems", async (_request, response) => {
    const systems = await listSystems(deps.db);
    const lines = await listLines(deps.db);
    const bySystem = new Map<string, number>();
    for (const line of lines) {
      bySystem.set(line.systemId, (bySystem.get(line.systemId) ?? 0) + 1);
    }
    response.json(
      systems.map((system) => ({
        id: system.id,
        name: system.name,
        mode: system.mode,
        operator: system.operator,
        description: system.description,
        color: system.color,
        website: system.website,
        lineCount: bySystem.get(system.id) ?? 0,
      })),
    );
  });

  router.get("/lines", async (request, response) => {
    const systemId = typeof request.query["systemId"] === "string" ? request.query["systemId"] : undefined;
    const lines = await listLines(deps.db, systemId);
    response.json(
      lines.map((line) => ({
        id: line.id,
        systemId: line.systemId,
        code: line.code,
        name: line.name,
        mode: line.mode,
        serviceClass: line.serviceClass,
        operator: line.operator,
        status: line.status,
        color: line.color,
        lengthKm: line.lengthKm,
      })),
    );
  });

  router.get("/stations", async (request, response) => {
    const parsed = stationQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid request", detail: parsed.error.issues });
      return;
    }

    const { q, limit, systemId, minScore } = parsed.data;

    if (!q) {
      const { network } = await deps.cache.get();
      const filtered = systemId
        ? network.stations.filter((station) => station.systemId === systemId)
        : network.stations;
      response.json(
        filtered.slice(0, limit).map((station) => ({
          id: station.id,
          name: station.name,
          systemId: station.systemId,
          code: station.code,
          latitude: station.latitude,
          longitude: station.longitude,
          isInterchange: station.isInterchange,
        })),
      );
      return;
    }

    const candidates = await deps.resolver.resolve(q, {
      limit,
      ...(systemId ? { systemId } : {}),
    });

    // The list of suggestions is more generous than the rule for planning
    // a route: a weaker match is still worth showing, as long as it is
    // marked as such.
    const floor = minScore ?? MINIMUM_SUGGESTION_SCORE;
    response.json(
      candidates
        .filter((candidate) => candidate.score >= floor)
        .map((candidate) => ({
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
        score: Number(candidate.score.toFixed(3)),
        matchedRanges: candidate.matchedRanges,
      })),
    );
  });

  /**
   * The scheduled departure board for one stop.
   *
   * It is a service-window answer, not a live vehicle: a line that is
   * outside its published hours is hidden, and each row says how often the
   * service is scheduled. The UI labels it as a schedule.
   */
  router.get("/stations/:id/departures", async (request, response) => {
    const atRaw = typeof request.query["at"] === "string" ? request.query["at"] : null;
    const at = atRaw ? new Date(atRaw) : new Date();
    if (Number.isNaN(at.getTime())) {
      response.status(400).json({ error: "Invalid at timestamp" });
      return;
    }
    const { network } = await deps.cache.get();
    const station = network.stations.find((candidate) => candidate.id === request.params["id"]);
    if (!station) {
      response.status(404).json({ error: "Station not found" });
      return;
    }

    const rows = [];
    const seen = new Set<string>();
    for (const stop of network.lineStops.filter((entry) => entry.stationId === station.id)) {
      const line = network.lines.find((candidate) => candidate.id === stop.lineId);
      if (!line) continue;
      const key = `${line.id}:${stop.direction}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const state = serviceAt(line, stop.direction, at);
      if (state && state.reliable && !state.active) continue;
      const direction = network.lineStops
        .filter((entry) => entry.lineId === line.id && entry.direction === stop.direction)
        .sort((a, b) => a.position - b.position);
      const first = direction[0]?.stationId;
      const last = direction[direction.length - 1]?.stationId;
      const nameOf = (stationId: string | undefined) =>
        network.stations.find((candidate) => candidate.id === stationId)?.name ?? null;
      rows.push({
        lineId: line.id,
        code: line.code,
        name: line.name,
        mode: line.mode,
        serviceClass: line.serviceClass,
        color: line.color,
        direction: stop.direction,
        headsign: nameOf(last),
        origin: nameOf(first),
        platform: stop.platform?.name ?? null,
        serviceLabel: state?.label ?? "Schedule not confirmed",
        detail: state?.detail ?? null,
        headwayMinMinutes: state?.headwayMinMinutes ?? null,
        headwayMaxMinutes: state?.headwayMaxMinutes ?? null,
        waitMinutes: state?.waitMinutes ?? null,
        reliable: state?.reliable ?? false,
        night: state?.night ?? false,
      });
    }
    rows.sort((a, b) => {
      const waitA = a.waitMinutes ?? 999;
      const waitB = b.waitMinutes ?? 999;
      return waitA - waitB || a.code.localeCompare(b.code);
    });
    response.json({
      station: {
        id: station.id,
        name: station.name,
        latitude: station.latitude,
        longitude: station.longitude,
      },
      at: at.toISOString(),
      lines: rows,
    });
  });

  router.get("/stations/:id", async (request, response) => {
    const { network } = await deps.cache.get();
    const station = network.stations.find((candidate) => candidate.id === request.params["id"]);
    if (!station) {
      response.status(404).json({ error: "Station not found" });
      return;
    }

    const lines = network.lines.filter((line) =>
      network.lineStops.some((stop) => stop.lineId === line.id && stop.stationId === station.id),
    );
    const group = network.stationGroups.find((candidate) => candidate.stationIds.includes(station.id));

    response.json({
      id: station.id,
      name: station.name,
      systemId: station.systemId,
      code: station.code,
      latitude: station.latitude,
      longitude: station.longitude,
      stationType: station.stationType,
      isInterchange: station.isInterchange,
      area: station.area,
      description: station.description,
      aliases: station.aliases,
      lines: lines.map((line) => ({
        id: line.id,
        code: line.code,
        name: line.name,
        serviceClass: line.serviceClass,
        mode: line.mode,
      })),
      interchangeWith: (group?.stationIds ?? [])
        .filter((id) => id !== station.id)
        .map((id) => {
          const other = network.stations.find((candidate) => candidate.id === id);
          return other
            ? { id: other.id, name: other.name, systemId: other.systemId }
            : null;
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
    });
  });

  return router;
}
