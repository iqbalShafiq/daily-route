/**
 * Walking from where the reader is.
 *
 * The distance to the nearest stop is not the distance along the street.
 * A rider needs to know which way to walk, how far it is, and what the
 * street is called, so the path is asked of a router that knows the
 * footpaths of the city.
 *
 * The router is a public service, and it answers with the geometry of
 * the walk, the name of every street on it, and the distance.
 */

import { Router } from "express";

import { findStationsNear } from "@daily-route/db";
import { planRoutes } from "@daily-route/transit";

import type { ApiDeps } from "../deps.js";

export type WalkStep = {
  /** What the reader has to do, in words. */
  instruction: string;
  /** The street the step is on. */
  street: string | null;
  /** The length of the step, in kilometres. */
  distanceKm: number;
};

export type WalkRoute = {
  /** The stop the walk leads to. */
  stationId: string;
  stationName: string;
  stationLatitude: number;
  stationLongitude: number;
  /** The straight-line distance to the stop, in kilometres. */
  straightDistanceKm: number;
  /** The distance along the footpaths, in kilometres. */
  distanceKm: number;
  /** How long the walk takes, in minutes. */
  durationMinutes: number;
  steps: WalkStep[];
  /** The path, for the map. */
  geometry: { latitude: number; longitude: number }[];
};

const OSRM_ENDPOINT = "https://router.project-osrm.org/route/v1/foot";
const REQUEST_TIMEOUT_MS = 20_000;

type OsrmResponse = {
  code: string;
  routes?: {
    distance: number;
    duration: number;
    geometry?: { coordinates?: [number, number][] };
    legs?: {
      steps?: {
        distance: number;
        name?: string;
        maneuver?: { type?: string; modifier?: string };
      }[];
    }[];
  }[];
};

/**
 * Ask the router for the walk from one place to another.
 *
 * Returns null when the router has no answer, so the caller can report
 * that instead of inventing a straight line.
 */
export async function fetchWalkingRoute(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): Promise<{
  distanceKm: number;
  durationMinutes: number;
  steps: WalkStep[];
  geometry: { latitude: number; longitude: number }[];
} | null> {
  const coordinates = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const url = `${OSRM_ENDPOINT}/${coordinates}?overview=full&geometries=geojson&steps=true`;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "daily-route/0.1 (Jakarta transit planner)" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as OsrmResponse;
    if (payload.code !== "Ok") return null;
    const route = payload.routes?.[0];
    if (!route) return null;

    const steps = (route.legs?.[0]?.steps ?? []).map((step) => ({
      instruction: instructionOf(step),
      street: step.name && step.name.length > 0 ? step.name : null,
      distanceKm: Number((step.distance / 1000).toFixed(3)),
    }));

    const geometry = (route.geometry?.coordinates ?? []).map(([longitude, latitude]) => ({
      latitude,
      longitude,
    }));

    return {
      distanceKm: Number((route.distance / 1000).toFixed(3)),
      durationMinutes: Math.max(1, Math.round(route.duration / 60)),
      steps,
      geometry,
    };
  } catch {
    return null;
  }
}

/** The instruction of a step, in the words of a rider. */
function instructionOf(step: {
  distance: number;
  name?: string;
  maneuver?: { type?: string; modifier?: string };
}): string {
  const modifier = step.maneuver?.modifier ?? "";
  const street = step.name && step.name.length > 0 ? ` ke ${step.name}` : "";
  switch (modifier) {
    case "left":
      return `Belok kiri${street}`;
    case "right":
      return `Belok kanan${street}`;
    case "slight left":
      return `Belok sedikit ke kiri${street}`;
    case "slight right":
      return `Belok sedikit ke kanan${street}`;
    case "straight":
      return `Lurus${street}`;
    case "uturn":
      return "Putar balik";
    default:
      return step.name && step.name.length > 0 ? `Lanjut ke ${step.name}` : "Lanjut jalan";
  }
}

/**
 * The walk from a place to the stop that serves it.
 *
 * The stop is the one the rider can board from; the walk to it is the
 * first part of the journey.
 */
export function createWalkRouter(deps: ApiDeps): Router {
  const router = Router();

  router.get("/", async (request, response) => {
    const latitude = Number(request.query["latitude"]);
    const longitude = Number(request.query["longitude"]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      response.status(400).json({ error: "Koordinat tidak lengkap" });
      return;
    }

    const nearby = await findStationsNear(deps.db, { latitude, longitude }, {
      radiusKm: 1.5,
      limit: 6,
    });
    if (nearby.length === 0) {
      response.status(404).json({ error: "Tidak ada halte dalam radius 1,5 km" });
      return;
    }

    /*
     * The stop to walk to.
     *
     * The closest one is not always the one: a stop that serves more
     * lines is the better one, and a footpath that detours around a
     * flyover can be longer than the walk to the next stop. The first
     * three stops are tried, and the one whose walk is reasonable wins.
     */
    const ranked = nearby
      .map((candidate) => ({
        candidate,
        score: candidate.distanceKm - (candidate.isInterchange ? 0.1 : 0),
      }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 3);

    const first = ranked[0]?.candidate;
    if (!first) {
      response.status(404).json({ error: "Tidak ada halte dalam radius 1,5 km" });
      return;
    }
    let stop = first;
    let walk = null;

    /*
     * A reader who is already at the stop does not need directions.
     *
     * The router may send them around a flyover to reach a stop that is
     * a few metres away, so the straight distance decides when the walk
     * is simply "you are there".
     */
    if (stop.distanceKm < 0.05) {
      response.json({
        stationId: stop.id,
        stationName: stop.name,
        stationLatitude: stop.latitude,
        stationLongitude: stop.longitude,
        straightDistanceKm: Number(stop.distanceKm.toFixed(3)),
        distanceKm: Number(stop.distanceKm.toFixed(3)),
        durationMinutes: 1,
        steps: [],
        geometry: [
          { latitude, longitude },
          { latitude: stop.latitude, longitude: stop.longitude },
        ],
      } satisfies WalkRoute);
      return;
    }
    for (const entry of ranked) {
      const candidate = entry.candidate;
      const attempt = await fetchWalkingRoute(
        { latitude, longitude },
        { latitude: candidate.latitude, longitude: candidate.longitude },
      );
      if (!attempt) continue;
      const limit = Math.max(candidate.distanceKm * 2.5 + 0.15, candidate.distanceKm + 0.3);
      if (attempt.distanceKm <= limit) {
        stop = candidate;
        walk = attempt;
        break;
      }
      if (!walk) {
        stop = candidate;
        walk = attempt;
      }
    }

    if (!walk) {
      response.status(503).json({
        error: "Rute jalan kaki belum bisa dihitung",
        station: {
          id: stop.id,
          name: stop.name,
          straightDistanceKm: Number(stop.distanceKm.toFixed(3)),
        },
      });
      return;
    }

    const route: WalkRoute = {
      stationId: stop.id,
      stationName: stop.name,
      stationLatitude: stop.latitude,
      stationLongitude: stop.longitude,
      straightDistanceKm: Number(stop.distanceKm.toFixed(3)),
      distanceKm: walk.distanceKm,
      durationMinutes: walk.durationMinutes,
      steps: walk.steps,
      geometry: walk.geometry,
    };
    response.json(route);
  });

  /*
   * The best journey from where the reader is.
   *
   * The nearest stop is not always the right one. A stop a little
   * further away may serve the line that goes straight to the
   * destination, while the nearest one may only lead the rider the long
   * way round. Every stop worth considering is therefore tried, the
   * whole journey is measured, and the best one wins.
   */
  router.get("/plan", async (request, response) => {
    const latitude = Number(request.query["latitude"]);
    const longitude = Number(request.query["longitude"]);
    const destination = typeof request.query["destination"] === "string"
      ? request.query["destination"]
      : "";

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      response.status(400).json({ error: "Koordinat tidak lengkap" });
      return;
    }

    const nearby = await findStationsNear(deps.db, { latitude, longitude }, {
      radiusKm: 1.2,
      limit: 8,
    });
    if (nearby.length === 0) {
      response.status(404).json({ error: "Tidak ada halte dalam radius 1,2 km" });
      return;
    }

    // A stop that serves more lines is worth a little more walking.
    const candidates = nearby
      .map((candidate) => ({
        candidate,
        score: candidate.distanceKm - (candidate.isInterchange ? 0.1 : 0),
      }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 4);

    const { network } = await deps.cache.get();
    const destinationCandidates = destination
      ? await deps.resolver.resolve(destination, { limit: 3 })
      : [];
    const destinationStation = destinationCandidates[0];

    const evaluated = [];
    for (const entry of candidates) {
      const walk = await fetchWalkingRoute(
        { latitude, longitude },
        { latitude: entry.candidate.latitude, longitude: entry.candidate.longitude },
      );
      if (!walk) continue;

      const itineraries = destinationStation
        ? planRoutes(network, entry.candidate.id, destinationStation.stationId, {
            maxAlternatives: 1,
          })
        : [];
      const itinerary = itineraries[0];

      // The journey is judged as a whole: the walk, the waiting and the
      // ride together. A change of vehicle is worth more than a minute
      // of walking, but not more than a good quarter of an hour.
      const totalMinutes = (itinerary?.durationMinutes ?? 0) + walk.durationMinutes;
      const transferCount = itinerary?.transferCount ?? 0;
      evaluated.push({
        stationId: entry.candidate.id,
        stationName: entry.candidate.name,
        walkDistanceKm: walk.distanceKm,
        walkDurationMinutes: walk.durationMinutes,
        totalMinutes,
        transferCount,
        score: Math.round(totalMinutes + transferCount * 3),
        walk,
        itinerary: itinerary ?? null,
      });
    }

    if (evaluated.length === 0) {
      response.status(503).json({ error: "Rute jalan kaki belum bisa dihitung" });
      return;
    }

    evaluated.sort((a, b) => a.score - b.score);
    const best = evaluated[0];
    if (!best) {
      response.status(503).json({ error: "Rute jalan kaki belum bisa dihitung" });
      return;
    }

    response.json({
      walk: {
        stationId: best.stationId,
        stationName: best.stationName,
        stationLatitude: best.walk.geometry[best.walk.geometry.length - 1]?.latitude ?? null,
        distanceKm: best.walkDistanceKm,
        durationMinutes: best.walkDurationMinutes,
        steps: best.walk.steps,
        geometry: best.walk.geometry,
      },
      totalMinutes: best.totalMinutes,
      transferCount: best.transferCount,
      candidates: evaluated.map((entry) => ({
        stationId: entry.stationId,
        stationName: entry.stationName,
        walkDistanceKm: entry.walkDistanceKm,
        walkDurationMinutes: entry.walkDurationMinutes,
        totalMinutes: entry.totalMinutes,
        transferCount: entry.transferCount,
        score: entry.score,
      })),
      destinationStationId: destinationStation?.stationId ?? null,
    });
  });

  return router;
}
