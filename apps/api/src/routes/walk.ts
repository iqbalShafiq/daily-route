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
import { planRoutes, walkingMinutes } from "@daily-route/transit";

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

/**
 * How a journey is weighed.
 *
 * The numbers are the ones the research settled on, and they are
 * arguments rather than constants: the profiles below are the same
 * journeys weighed differently. A change of vehicle is worth three
 * minutes, the walk to the first stop is worth more than the walk in
 * the middle, because that is the walk the rider did not choose.
 */
export type OriginWeights = {
  /** Minutes added per change of vehicle. */
  transfer: number;
  /** Minutes added per kilometre walked anywhere in the journey. */
  walkPerKm: number;
  /** Minutes added per kilometre walked to the first stop. */
  accessWalkPerKm: number;
  /** Minutes added per kilometre of the whole journey. */
  distancePerKm: number;
};

const DEFAULT_WEIGHTS: OriginWeights = {
  transfer: 3,
  walkPerKm: 1,
  accessWalkPerKm: 2,
  distancePerKm: 0.4,
};

const ORIGIN_PROFILES: Record<string, OriginWeights> = {
  fastest: DEFAULT_WEIGHTS,
  "fewer-transfers": { ...DEFAULT_WEIGHTS, transfer: 8 },
  "less-walking": { ...DEFAULT_WEIGHTS, walkPerKm: 4, accessWalkPerKm: 4 },
};

const PROFILE_LABELS: Record<string, string> = {
  fastest: "Tercepat",
  "fewer-transfers": "Paling sedikit transit",
  "less-walking": "Paling sedikit jalan kaki",
};

type OriginCandidate = {
  stationId: string;
  stationName: string;
  latitude: number;
  longitude: number;
  accessWalkKm: number;
  accessWalkMinutes: number;
  totalMinutes: number;
  transferCount: number;
  walkingKm: number;
  distanceKm: number;
  itinerary: ReturnType<typeof planRoutes>[number];
};

/** The score of a candidate under a set of weights. */
function scoreOf(candidate: OriginCandidate, weights: OriginWeights): number {
  return (
    candidate.totalMinutes +
    weights.transfer * candidate.transferCount +
    weights.walkPerKm * candidate.walkingKm +
    weights.accessWalkPerKm * candidate.accessWalkKm +
    weights.distancePerKm * candidate.distanceKm
  );
}

/**
 * The pedestrian router.
 *
 * The public OpenStreetMap instance walks on footpaths, on walkways and
 * on crossings, and it names every street on the way. The driving
 * profile of the OSRM demo server is not used here: it answers with car
 * routes, and a rider needs feet.
 */
const VALHALLA_ENDPOINT = "https://valhalla1.openstreetmap.de";
const REQUEST_TIMEOUT_MS = 20_000;

type ValhallaResponse = {
  trip?: {
    summary?: { length?: number; time?: number };
    legs?: {
      shape?: string;
      maneuvers?: {
        instruction?: string;
        street_names?: string[];
        length?: number;
        time?: number;
        type?: number;
      }[];
    }[];
  };
  error?: string;
};

/**
 * Ask the pedestrian router for the walk from one place to another.
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
  const request = {
    locations: [
      { lat: from.latitude, lon: from.longitude },
      { lat: to.latitude, lon: to.longitude },
    ],
    costing: "pedestrian",
    directions_options: { units: "kilometers" },
  };
  const url = `${VALHALLA_ENDPOINT}/route?${new URLSearchParams({
    json: JSON.stringify(request),
  }).toString()}`;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "daily-route/0.1 (Jakarta transit planner)" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as ValhallaResponse;
    const trip = payload.trip;
    if (!trip) return null;

    const leg = trip.legs?.[0];
    const steps = (leg?.maneuvers ?? []).map((maneuver) => ({
      instruction: instructionOf(maneuver),
      street: maneuver.street_names?.[0] ?? null,
      distanceKm: Number((maneuver.length ?? 0).toFixed(3)),
    }));

    const geometry = decodeShape(leg?.shape ?? "");

    return {
      distanceKm: Number((trip.summary?.length ?? 0).toFixed(3)),
      durationMinutes: Math.max(1, Math.round((trip.summary?.time ?? 0) / 60)),
      steps,
      geometry,
    };
  } catch {
    return null;
  }
}

/**
 * Decode the path the router sends.
 *
 * The path is a polyline, the same encoding the map uses: a series of
 * numbers that stand for points, with the difference from one point to
 * the next.
 */
function decodeShape(shape: string): { latitude: number; longitude: number }[] {
  if (shape.length === 0) return [];
  const points: { latitude: number; longitude: number }[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < shape.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = shape.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    latitude += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = shape.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    longitude += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ latitude: latitude / 1e6, longitude: longitude / 1e6 });
  }
  return points;
}

/**
 * The instruction of a step, in the words of a rider.
 *
 * The router says what happens in its own words; the rider reads it in
 * Indonesian, and the street is named.
 */
function instructionOf(maneuver: {
  instruction?: string;
  street_names?: string[];
  type?: number;
}): string {
  const street = maneuver.street_names?.[0] ?? null;
  const onto = street ? ` ke ${street}` : "";
  switch (maneuver.type) {
    case 1:
      return street ? `Mulai di ${street}` : "Mulai berjalan";
    case 2:
      return `Berjalan ke kanan${onto}`;
    case 3:
      return `Berjalan ke kiri${onto}`;
    case 4:
    case 5:
    case 6:
      return "Tiba di tujuan";
    case 7:
      return `Berubah menjadi${onto}`;
    case 8:
      return `Lurus${onto}`;
    case 9:
      return `Belok sedikit ke kanan${onto}`;
    case 10:
      return `Belok kanan${onto}`;
    case 11:
      return `Belok tajam ke kanan${onto}`;
    case 12:
    case 13:
      return "Putar balik";
    case 14:
      return `Belok tajam ke kiri${onto}`;
    case 15:
      return `Belok kiri${onto}`;
    case 16:
      return `Belok sedikit ke kiri${onto}`;
    case 17:
      return `Naik ramp${onto}`;
    case 18:
      return `Ambil ramp kanan${onto}`;
    case 19:
      return `Ambil ramp kiri${onto}`;
    case 20:
      return `Keluar ke kanan${onto}`;
    case 21:
      return `Keluar ke kiri${onto}`;
    case 22:
      return `Tetap lurus${onto}`;
    case 23:
      return `Tetap ke kanan${onto}`;
    case 24:
      return `Tetap ke kiri${onto}`;
    case 25:
      return `Gabung${onto}`;
    case 26:
      return `Masuk bundaran${onto}`;
    case 27:
      return `Keluar bundaran${onto}`;
    case 28:
      return "Naik feri";
    case 29:
      return "Turun feri";
    default:
      return street ? `Lanjut ke ${street}` : "Lanjut jalan";
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

    const { network } = await deps.cache.get();
    const destinationCandidates = destination
      ? await deps.resolver.resolve(destination, { limit: 3 })
      : [];
    const destinationStation = destinationCandidates[0];

    /*
     * Every stop around the reader is a candidate.
     *
     * The nearest stop is not always the right one: a stop a little
     * further away may serve the line that goes straight to the
     * destination, while the nearest one may only lead the rider the
     * long way round. So no stop is ruled out before its journey has
     * been measured. On a real case in Jakarta the right answer was
     * twenty-fifth by distance.
     */
    const nearby = await findStationsNear(deps.db, { latitude, longitude }, {
      radiusKm: 1.5,
      limit: 60,
    });
    if (nearby.length === 0) {
      response.status(404).json({ error: "Tidak ada halte dalam radius 1,5 km" });
      return;
    }

    /*
     * Without a destination there is no journey to weigh, and ranking
     * the stops would only say which one is nearest. The reader is
     * asked for a destination first.
     */
    const nearest = nearby[0];
    if (!nearest) {
      response.status(404).json({ error: "Tidak ada halte dalam radius 1,5 km" });
      return;
    }
    if (!destinationStation) {
      response.json({
        needsDestination: true,
        nearest: {
          stationId: nearest.id,
          stationName: nearest.name,
          accessWalkKm: Number(nearest.distanceKm.toFixed(3)),
        },
        candidates: [],
        profiles: [],
      });
      return;
    }

    const evaluated: OriginCandidate[] = [];
    for (const candidate of nearby) {
      const itineraries = planRoutes(network, candidate.id, destinationStation.stationId, {
        maxAlternatives: 1,
      });
      const itinerary = itineraries[0];
      if (!itinerary) continue;

      // The walk to the first stop, estimated the way the planner
      // estimates every other walk.
      const accessWalkKm = Number(candidate.distanceKm.toFixed(3));
      const accessWalkMinutes = walkingMinutes(accessWalkKm);
      const totalMinutes = itinerary.durationMinutes + accessWalkMinutes;

      evaluated.push({
        stationId: candidate.id,
        stationName: candidate.name,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        accessWalkKm,
        accessWalkMinutes,
        totalMinutes,
        transferCount: itinerary.transferCount,
        walkingKm: itinerary.walkingKm,
        distanceKm: itinerary.distanceKm,
        itinerary,
      });
    }

    if (evaluated.length === 0) {
      response.status(404).json({ error: "Tidak ada perjalanan dari halte di sekitar situ" });
      return;
    }

    /*
     * The profiles.
     *
     * Each one asks a different question of the same journeys: the
     * soonest, the one with the fewest changes of vehicle, and the one
     * that asks the reader to walk the least. They often disagree about
     * which stop to start from, which is the point.
     */
    const profiles = Object.entries(ORIGIN_PROFILES).map(([id, weights]) => {
      const ranked = [...evaluated].sort(
        (a, b) => scoreOf(a, weights) - scoreOf(b, weights),
      );
      const winner = ranked[0];
      return {
        id,
        label: PROFILE_LABELS[id] ?? id,
        stationId: winner?.stationId ?? null,
        stationName: winner?.stationName ?? null,
        score: winner ? Math.round(scoreOf(winner, weights) * 10) / 10 : null,
        totalMinutes: winner?.totalMinutes ?? null,
        transferCount: winner?.transferCount ?? null,
        accessWalkKm: winner?.accessWalkKm ?? null,
      };
    });

    const fastest = profiles.find((profile) => profile.id === "fastest");
    const winner = evaluated.find((candidate) => candidate.stationId === fastest?.stationId);
    if (!winner) {
      response.status(404).json({ error: "Tidak ada perjalanan dari halte di sekitar situ" });
      return;
    }

    // The real path of the walk, for the map and for the directions.
    const walk = await fetchWalkingRoute(
      { latitude, longitude },
      { latitude: winner.latitude, longitude: winner.longitude },
    );

    response.json({
      needsDestination: false,
      stationId: winner.stationId,
      stationName: winner.stationName,
      totalMinutes: winner.totalMinutes,
      transferCount: winner.transferCount,
      distanceKm: winner.distanceKm,
      walkingKm: winner.walkingKm,
      accessWalkKm: winner.accessWalkKm,
      walk: walk
        ? {
            distanceKm: walk.distanceKm,
            durationMinutes: walk.durationMinutes,
            steps: walk.steps,
            geometry: walk.geometry,
          }
        : null,
      profiles,
      candidates: evaluated
        .map((candidate) => ({
          stationId: candidate.stationId,
          stationName: candidate.stationName,
          accessWalkKm: candidate.accessWalkKm,
          totalMinutes: candidate.totalMinutes,
          transferCount: candidate.transferCount,
          score: Math.round(scoreOf(candidate, DEFAULT_WEIGHTS) * 10) / 10,
        }))
        .sort((a, b) => a.score - b.score)
        .slice(0, 6),
    });
  });

  return router;
}
