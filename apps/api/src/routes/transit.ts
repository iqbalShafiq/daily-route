import { Router } from "express";
import { z } from "zod";

import { listLines, listSystems } from "@daily-route/db";

import type { ApiDeps } from "../deps.js";

/**
 * Read-only endpoints over the transit network: the systems, their lines,
 * and the stations a rider might be looking for.
 */

const stationQuerySchema = z.object({
  q: z.string().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  systemId: z.string().optional(),
});

export function createTransitRouter(deps: ApiDeps): Router {
  const router = Router();

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
      response.status(400).json({ error: "Permintaan tidak valid", detail: parsed.error.issues });
      return;
    }

    const { q, limit, systemId } = parsed.data;

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

    response.json(
      candidates.map((candidate) => ({
        id: candidate.stationId,
        name: candidate.name,
        systemId: candidate.systemId,
        systemName: candidate.systemName,
        code: candidate.code,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        isInterchange: candidate.isInterchange,
        score: Number(candidate.score.toFixed(3)),
      })),
    );
  });

  router.get("/stations/:id", async (request, response) => {
    const { network } = await deps.cache.get();
    const station = network.stations.find((candidate) => candidate.id === request.params["id"]);
    if (!station) {
      response.status(404).json({ error: "Stasiun tidak ditemukan" });
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
