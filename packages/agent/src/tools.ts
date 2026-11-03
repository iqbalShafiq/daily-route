import { createTool } from "@anvia/core/tool";

import { searchToll, tollRoads } from "./knowledge/toll.js";
import { z } from "zod";

import {
  bestAccess,
  blocksJourney,
  FARE_OPERATOR_LABELS,
  formatRupiah,
  isActiveAt,
  jakartaDayClock,
  matchDisruptions,
  noticeScopeOf,
  serviceAt,
  stopsWithinWalk,
  planRoutes,
  fareLegsOf,
  quoteFare,
  directionSummary,
  removesService,
  routeIsClear,
  type FareRules,
  type Itinerary,
  type TransitNetwork,
} from "@daily-route/transit";

import { insertObservation, labelsForPlaces, listNoticeHistory } from "@daily-route/db";
import { PLACE_CONFIDENCE_THRESHOLD } from "@daily-route/semantic";

import type { RoadLookup } from "@daily-route/semantic";

import type { NetworkCache, TransitAgentContext } from "./context.js";
import { createLookupTools } from "./lookup.js";
import type { NewsSearch } from "./news.js";
import { riderStore } from "./rider-context.js";
import { createRiderTools } from "./rider-tools.js";

/**
 * The agent's tools.
 *
 * Each tool answers one question the model cannot answer from the data it
 * already has: where a place is, how to get between two places, what is
 * disrupted right now, and what the operators are saying about it.
 *
 * Every tool is read-only. Nothing here writes to the database or calls an
 * operator's API that mutates state.
 */

const placeSchema = z.object({
  query: z.string().trim().min(2).max(160).describe("A place, stop, station, or landmark name"),
  limit: z.number().int().min(1).max(10).optional().describe("Jumlah kandidat"),
  systemId: z
    .enum(["transjakarta", "mrt-jakarta", "lrt-jakarta", "lrt-jabodebek", "krl-jabodetabek"])
    .optional()
    .describe("Batasi ke satu sistem"),
});

export type PlaceToolOutput = {
  query: string;
  candidates: {
    stationId: string;
    name: string;
    systemId: string;
    systemName: string;
    mode: string;
    code: string | null;
    latitude: number;
    longitude: number;
    isInterchange: boolean;
    score: number;
  }[];
};

export function createPlaceTool(context: TransitAgentContext) {
  return createTool({
    name: "resolve_place",
    description:
      "Resolve a place, stop, or station name the rider wrote to the network. " +
      "Call it whenever a place is not yet certain. Returns the top candidates " +
      "with coordinates and a match score.",
    inputSchema: placeSchema,
    execute: async (args): Promise<PlaceToolOutput> => {
      const candidates = await context.resolver.resolve(args.query, {
        limit: args.limit ?? 6,
        ...(args.systemId ? { systemId: args.systemId } : {}),
      });
      return {
        query: args.query,
        candidates: candidates.map((candidate) => ({
          stationId: candidate.stationId,
          name: candidate.name,
          systemId: candidate.systemId,
          systemName: candidate.systemName,
          mode: candidate.mode,
          code: candidate.code,
          latitude: candidate.latitude,
          longitude: candidate.longitude,
          isInterchange: candidate.isInterchange,
          score: Number(candidate.score.toFixed(3)),
        })),
      };
    },
  });
}

const routeSchema = z.object({
  origin: z.string().trim().min(2).max(160).describe("Where the rider starts"),
  destination: z.string().trim().min(2).max(160).describe("Where the rider is going"),
  maxAlternatives: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .describe("Berapa banyak rute yang dikembalikan"),
  departAt: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe("Waktu berangkat ISO-8601 dengan offset, bila rider menyebut hari/tanggal"),
  nightSafe: z.boolean().optional().describe("Prefer fewer walks and lines that run after dark"),
});

export type RouteToolOutput = {
  asal: { text: string; stationId: string | null; name: string | null };
  tujuan: { text: string; stationId: string | null; name: string | null };
  rute: RouteSummary[];
  gangguan: DisruptionSummary[];
  /**
   * Whether the recommended route is open.
   *
   * This is the question the rider is really asking, so it is answered
   * plainly: the route is open, it is obstructed, or nothing is known
   * about it.
   */
  status: "terbuka" | "terhalang" | "tidak-diketahui";
  /** Why the route is obstructed, when it is. */
  hambatan: string[];
  catatan: string[];
};

type FareSummary = {
  total: number;
  label: string;
  rincian: { label: string; jumlah: number }[];
};

type RouteSummary = {
  durasiMenit: number;
  /** The distance of the whole journey, along the roads. */
  jarakKm: number;
  /** The distance the rider covers on foot. */
  jarakJalanKakiKm: number;
  /** The planner's score: time, distance and changes in one number. */
  skor: number;
  /** What the journey costs. */
  tarif: { total: number; label: string; rincian: { label: string; jumlah: number }[] };
  jumlahTransfer: number;
  legs: {
    jenis: "walk" | "ride";
    mode: string;
    lineId: string | null;
    lineName: string | null;
    lineCode: string | null;
    serviceClass: string | null;
    /** This ride is on an announced temporary service. */
    sementara: boolean;
    dari: string;
  ke: string;
    durasiMenit: number;
    jarakKm: number;
    halte: string[];
    /** Why this leg is a walk: to the first vehicle, to the last, or a change. */
    alasanJalanKaki: "access" | "egress" | "transfer" | null;
    /** The line the rider was on before, when they have to change vehicle. */
    gantiDari: string | null;
    /** Where the rider changes vehicle. */
    gantiDi: string | null;
    /** The average wait for this vehicle. */
    tungguMenit: number;
    /** The direction of travel along the line, and its two ends. */
    arah: "forward" | "backward" | null;
    labelArah: string | null;
    /** The boarding and alighting platform, when the data has them. */
    platformNaik: string | null;
    platformTurun: string | null;
    /** The pattern is scheduled on national holidays as well. */
    polaHariLibur: boolean;
    /** The pattern's service-day label. */
    layananPola: string | null;
    /** The scheduled frequency at the boarding time. */
    frekuensi: string | null;
    headwayMinMenit: number | null;
    headwayMaxMenit: number | null;
    /** The line is outside its published service window. */
    diLuarLayanan: boolean;
    /** The published daily window. */
    detailLayanan: string | null;
  }[];
  peringatan: string[];
};

type DisruptionSummary = {
  id: string;
  judul: string;
  tingkat: string;
  jenis: string;
  sumber: string;
  url: string | null;
  publishedAt: string;
  latitude: number | null;
  longitude: number | null;
  memengaruhi: string;
  /** What the notice is about: a stop, a corridor, or the operator. */
  lingkup: "stop" | "line" | "network";
  /** The announcement says the bus diverts via a toll road. */
  viaToll: boolean;
  /** The place the notice heads to, and the direction it means. */
  tujuan: string | null;
  arah: "forward" | "backward" | null;
  /** Whether the notice applies to the direction this journey travels. */
  berlaku: boolean;
  /**
   * What the affected stop is to this rider.
   *
   * A closure the rider only passes does not change the journey; one at
   * the boarding or alighting stop does.
   */
  peran: string;
};

export function createRouteTool(context: TransitAgentContext, cache: NetworkCache) {
  return createTool({
    name: "plan_journey",
    description:
      "Plan a journey between two places on Transjakarta, MRT Jakarta, LRT Jakarta, " +
      "LRT Jabodebek and KRL Jabodetabek. Returns the legs, duration, number of " +
      "changes, fare and the notices that affect the journey. Announced temporary " +
      "services are included when their window covers the departure. It is the only " +
      "source of duration, distance and fare.",
    inputSchema: routeSchema,
    execute: async (args): Promise<RouteToolOutput> => {
      const planningAt = args.departAt ? new Date(args.departAt) : new Date();
      const [{ network, disruptions, fareRules }, originCandidates, destinationCandidates] = await Promise.all([
        cache.get(),
        context.resolver.resolve(args.origin, { limit: 5 }),
        context.resolver.resolve(args.destination, { limit: 5 }),
      ]);

      const notes: string[] = [];
      const origin = originCandidates[0];
      const destination = destinationCandidates[0];

      const confident =
        origin !== undefined &&
        destination !== undefined &&
        origin.score >= PLACE_CONFIDENCE_THRESHOLD &&
        destination.score >= PLACE_CONFIDENCE_THRESHOLD;

      if (!origin || !destination || !confident) {
        return {
          asal: { text: args.origin, stationId: origin?.stationId ?? null, name: origin?.name ?? null },
          tujuan: {
            text: args.destination,
            stationId: destination?.stationId ?? null,
            name: destination?.name ?? null,
          },
          rute: [],
          gangguan: [],
          status: "tidak-diketahui",
          hambatan: [],
          catatan: [
            !origin || origin.score < PLACE_CONFIDENCE_THRESHOLD
              ? `Tidak menemukan tempat asal "${args.origin}". Minta pengguna memberi nama yang lebih spesifik.`
              : `Tidak menemukan tempat tujuan "${args.destination}". Minta pengguna memberi nama yang lebih spesifik.`,
          ],
        };
      }

      /**
       * A closed halte is not a closed journey.
       *
       * The rider walks to the nearest stop that still has a vehicle going
       * their way, and the corridor itself is not avoided.
       */
      const at = planningAt;
      const closedStops = new Set<string>();
      const closedLines = new Set<string>();
      for (const disruption of disruptions) {
        if (!isActiveAt(disruption, at) || !removesService(disruption)) continue;
        if (noticeScopeOf(disruption) === "stop") {
          // A platform-scoped closure does not close the whole station.
          if (disruption.platforms && disruption.platforms.length > 0) continue;
          if (disruption.stationId) closedStops.add(disruption.stationId);
          for (const stationId of disruption.affectedStationIds) closedStops.add(stationId);
          continue;
        }
        if (disruption.lineId) closedLines.add(disruption.lineId);
        for (const lineId of disruption.affectedLineIds) closedLines.add(lineId);
      }

      let boardingId = origin.stationId;
      let boardingName = origin.name;
      let alightingId = destination.stationId;
      let alightingName = destination.name;

      if (closedStops.has(boardingId)) {
        const walking = bestAccess(
          stopsWithinWalk(network, origin, { exclude: closedStops, maxKm: 1, limit: 3 }),
          (station) => planRoutes(network, station.id, alightingId, { maxAlternatives: 1, at: planningAt })[0]?.cost ?? null,
        );
        if (walking) {
          boardingId = walking.access.station.id;
          boardingName = walking.access.station.name;
          notes.push(
            `Halte ${origin.name} sedang ditutup. Naik dari ${boardingName}, jalan kaki sekitar ${Math.round(walking.access.minutes)} menit (${walking.access.distanceKm.toFixed(2)} km).`,
          );
        }
      }
      if (closedStops.has(alightingId)) {
        const walking = bestAccess(
          stopsWithinWalk(network, destination, { exclude: closedStops, maxKm: 1, limit: 3 }),
          (station) => planRoutes(network, boardingId, station.id, { maxAlternatives: 1, at: planningAt })[0]?.cost ?? null,
        );
        if (walking) {
          alightingId = walking.access.station.id;
          alightingName = walking.access.station.name;
          notes.push(
            `Halte ${destination.name} sedang ditutup. Turun di ${alightingName}, lalu jalan kaki sekitar ${Math.round(walking.access.minutes)} menit (${walking.access.distanceKm.toFixed(2)} km) ke tujuan.`,
          );
        }
      }

      const routes = planRoutes(network, boardingId, alightingId, {
        maxAlternatives: args.maxAlternatives ?? 3,
        at: planningAt,
        nightSafe: args.nightSafe === true,
        avoidLineIds: [...closedLines],
      });

      if (routes.length === 0) {
        return {
          asal: { text: args.origin, stationId: origin.stationId, name: origin.name },
          tujuan: { text: args.destination, stationId: destination.stationId, name: destination.name },
          rute: [],
          gangguan: [],
          status: "tidak-diketahui",
          hambatan: [],
          catatan: ["Tidak ada rute terhubung antara kedua tempat pada jaringan yang tersedia."],
        };
      }

      const primary = routes[0];
      if (!primary) {
        return {
          asal: { text: args.origin, stationId: origin.stationId, name: origin.name },
          tujuan: { text: args.destination, stationId: destination.stationId, name: destination.name },
          rute: [],
          gangguan: [],
          status: "tidak-diketahui",
          hambatan: [],
          catatan: ["Rute tidak dapat dihitung."],
        };
      }

      const matches = matchDisruptions(primary, disruptions, { at: planningAt });
      const blocking = matches.filter((match) => blocksJourney(match));
      // Every choice must be checked against every active closure. The
      // initial planner only avoided closed lines; a transfer at a closed
      // stop can still invalidate an alternative.
      let summaries: RouteSummary[] = [];
      if (blocking.length > 0) {
        const avoidLineIds = new Set(closedLines);
        const avoidStationIds = new Set(closedStops);
        for (const match of blocking) {
          for (const lineId of match.lineIds) avoidLineIds.add(lineId);
          for (const stationId of match.stationIds) avoidStationIds.add(stationId);
        }
        const safeInitial = routes
          .slice(1)
          .filter((route) => routeIsClear(route, disruptions, planningAt));
        const replanned = planRoutes(network, boardingId, alightingId, {
          maxAlternatives: 2,
          at: planningAt,
          nightSafe: args.nightSafe === true,
          avoidLineIds: [...avoidLineIds],
          avoidStationIds: [...avoidStationIds],
        }).filter((route) => routeIsClear(route, disruptions, planningAt));
        const alternatives = dedupeRoutes([...safeInitial, ...replanned]).slice(0, 2);
        summaries = alternatives.map((alternative) => ({
          ...summarize(alternative, fareOf(alternative, fareRules, planningAt), network),
          peringatan: ["Rute alternatif — jalur utama sedang dialihkan atau ditutup."],
        }));
        if (alternatives.length === 0) {
          notes.push(
            "Tidak ada rute alternatif yang jelas dari penutupan atau pengalihan yang sedang berlangsung.",
          );
        } else {
          notes.push(
            "Jalur utama terdampak pengalihan atau penutupan; rute alternatif yang sudah diperiksa ditampilkan lebih dulu.",
          );
        }
      } else {
        summaries = routes
          .filter((route) => routeIsClear(route, disruptions, planningAt))
          .map((route) => summarize(route, fareOf(route, fareRules, planningAt), network));
      }

      // The verdict the rider is really asking for: is the way open?
      const obstructions = matches
        .filter((match) => blocksJourney(match))
        .map((match) => {
          const affected = match.lineIds
            .map((lineId) => primary.legs.find((leg) => leg.lineId === lineId)?.lineName)
            .filter((name): name is string => Boolean(name));
          const where = affected.length > 0 ? affected.join(", ") : "rute utama";
          return `${match.disruption.title} — ${where}. Sumber: ${match.disruption.source}.`;
        });

      if (obstructions.length > 0) {
        notes.unshift(
          "Rute utama terhalang. Jelaskan hambatannya, lalu tawarkan rute alternatif yang tidak terpengaruh.",
        );
      } else if (matches.length > 0) {
        notes.unshift(
          "Ada gangguan yang tercatat pada rute, tetapi tidak menutup jalurnya. Sebutkan, dan tetap tunjukkan rute utama.",
        );
      }

      if (routes.some((route) => route.legs.some((leg) => (network.patterns ?? []).find((pattern) => pattern.id === leg.patternId)?.metadata["holidays"] === true))) {
        notes.unshift("Pola yang dipilih juga beroperasi pada hari libur nasional; jangan sebut jadwalnya hanya Sabtu dan Minggu.");
      }

      // The observation is the server's bookkeeping, not a tool argument: the
      // model cannot name a rider, and a signed-out turn records nothing.
      await recordRide(context, {
        origin,
        destination,
        itinerary: primary,
        at: planningAt,
      });

      return {
        asal: { text: args.origin, stationId: origin.stationId, name: origin.name },
        tujuan: { text: args.destination, stationId: destination.stationId, name: destination.name },
        rute: summaries,
        gangguan: matches.map((match) => summarizeDisruption(match, primary)),
        status: obstructions.length > 0 ? "terhalang" : "terbuka",
        hambatan: obstructions,
        catatan: notes,
      };
    },
  });
}

function dedupeRoutes(routes: readonly Itinerary[]): Itinerary[] {
  const seen = new Set<string>();
  const unique: Itinerary[] = [];
  for (const route of routes) {
    const key = route.legs
      .map(
        (leg) =>
          `${leg.kind}:${leg.lineId ?? "walk"}:${leg.fromStationId ?? "-"}:${leg.toStationId ?? "-"}`,
      )
      .join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(route);
  }
  return unique;
}

/**
 * Record a journey the chat planned, when a real rider is in the turn.
 *
 * The write is the server's; the model never passes a user id and cannot
 * read one back. A failure here must not turn an answer into an error.
 */
async function recordRide(
  context: TransitAgentContext,
  input: {
    origin: { stationId: string; name: string };
    destination: { stationId: string; name: string };
    itinerary: Itinerary;
    at: Date;
  },
): Promise<void> {
  const userId = riderStore.getStore()?.userId ?? "";
  if (userId.length === 0) return;

  try {
    const clock = jakartaDayClock(input.at);
    const lineCodes = [
      ...new Set(
        input.itinerary.legs.flatMap((leg) => (leg.lineCode ? [leg.lineCode] : [])),
      ),
    ];
    const labels = await labelsForPlaces(
      context.db,
      userId,
      input.origin.stationId,
      input.destination.stationId,
    );
    await insertObservation(context.db, userId, {
      originKey: input.origin.stationId,
      destinationKey: input.destination.stationId,
      originName: input.origin.name,
      destinationName: input.destination.name,
      originLabel: labels.originLabel,
      destinationLabel: labels.destinationLabel,
      lineCodes,
      weekday: clock.weekday,
      minuteOfDay: clock.minuteOfDay,
      source: "chat",
    });
  } catch {
    // The journey is already planned; a failed habit write is not an answer.
  }
}

function summarize(
  itinerary: Itinerary,
  fare: FareSummary,
  network: TransitNetwork,
): RouteSummary {
  return {
    durasiMenit: itinerary.durationMinutes,
    jarakKm: itinerary.distanceKm,
    jarakJalanKakiKm: itinerary.walkingKm,
    skor: itinerary.cost,
    tarif: fare,
    jumlahTransfer: itinerary.transferCount,
    legs: itinerary.legs.map((leg) => ({
      jenis: leg.kind,
      mode: leg.mode,
      lineId: leg.lineId,
      lineName: leg.lineName,
      lineCode: leg.lineCode,
      serviceClass: leg.serviceClass,
      sementara: leg.temporary === true,
      dari: leg.fromName,
      ke: leg.toName,
      durasiMenit: leg.durationMinutes,
      jarakKm: Number(leg.distanceKm.toFixed(2)),
      halte: leg.stops.map((stop) => stop.name),
      pola: leg.patternLabel,
      polaId: leg.patternId ?? null,
      layananPola: leg.patternService ?? null,
      polaHariLibur:
        (network.patterns ?? []).find((pattern) => pattern.id === leg.patternId)?.metadata["holidays"] === true,
      polaTersedia: (network.patterns ?? [])
        .filter((pattern) => pattern.lineId === leg.lineId && pattern.direction === leg.direction)
        .map((pattern) => ({
          polaId: pattern.id,
          headsign: pattern.headsign,
          layanan: pattern.serviceLabel,
          tol: pattern.toll,
          halte: pattern.stopIds
            .map((stationId) => network.stations.find((station) => station.id === stationId)?.name)
            .filter((name): name is string => Boolean(name)),
        })),
      alasanJalanKaki: leg.walkReason,
      gantiDari: leg.changedFrom,
      gantiDi: leg.changedAt,
      tungguMenit: leg.waitMinutes,
      arah: leg.direction,
      labelArah:
        leg.direction && leg.lineId
          ? (directionSummary(network, leg.lineId, leg.direction)?.label ?? null)
          : null,
      platformNaik: leg.fromPlatform?.name ?? null,
      platformTurun: leg.toPlatform?.name ?? null,
      frekuensi: leg.serviceLabel ?? null,
      headwayMinMenit: leg.headwayMinMinutes ?? null,
      headwayMaxMenit: leg.headwayMaxMinutes ?? null,
      diLuarLayanan: leg.outsideService === true,
      detailLayanan: leg.serviceDetail ?? null,
    })),
    peringatan: itinerary.warnings,
  };
}

/** The price of a journey, in the shape the model reads it. */
function fareOf(itinerary: Itinerary, rules: FareRules | null, at: Date): FareSummary {
  if (!rules) {
    return { total: 0, label: "tidak diketahui", rincian: [] };
  }

  const quote = quoteFare({
    at,
    rules,
    labels: FARE_OPERATOR_LABELS,
    legs: fareLegsOf(itinerary),
  });

  return {
    total: quote.totalIdr,
    label: formatRupiah(quote.totalIdr),
    rincian: quote.breakdown.map((item) => ({
      label: item.label,
      jumlah: item.amountIdr,
    })),
  };
}

function pointOf(
  itinerary: Itinerary,
  stationId: string | null,
): { latitude: number; longitude: number } | null {
  if (!stationId) return null;
  for (const leg of itinerary.legs) {
    const stop = leg.stops.find((item) => item.stationId === stationId);
    if (stop) return { latitude: stop.latitude, longitude: stop.longitude };
  }
  return null;
}

function summarizeDisruption(
  match: ReturnType<typeof matchDisruptions>[number],
  itinerary: Itinerary,
): DisruptionSummary {
  const affectedLines = match.lineIds
    .map((lineId) => itinerary.legs.find((leg) => leg.lineId === lineId)?.lineName)
    .filter((name): name is string => Boolean(name));

  const stationId = match.disruption.stationId ?? match.stationIds[0] ?? null;
  const point = pointOf(itinerary, stationId);
  const road = match.disruption.roads?.[0]?.name;
  const lineCodes = match.disruption.lineCodes ?? [];
  return {
    id: match.disruption.id,
    judul: match.disruption.title,
    tingkat: match.disruption.severity,
    jenis: match.disruption.kind,
    sumber: match.disruption.source,
    url: match.disruption.url,
    publishedAt: match.disruption.publishedAt,
    latitude: point?.latitude ?? null,
    longitude: point?.longitude ?? null,
    lingkup: noticeScopeOf(match.disruption),
    viaToll: match.disruption.viaToll === true,
    peran: match.role,
    tujuan: match.disruption.towards ?? null,
    arah: match.disruption.direction ?? null,
    berlaku: !(
      match.noticeDirection &&
      match.direction &&
      match.noticeDirection !== match.direction
    ),
    memengaruhi:
      affectedLines.length > 0
        ? affectedLines.join(", ")
        : match.stationIds.length > 0
          ? `${match.stationIds.length} halte pada rute`
          : lineCodes.length > 0
            ? `${lineCodes.join(", ")}${road ? ` di sekitar ${road}` : ""}`
            : "rute",
  };
}

const stationSchema = z.object({
  stationId: z.string().min(1).describe("Id stasiun atau halte"),
  at: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe("Instant to read the scheduled service windows for; default now"),
});

export function createStationTool(cache: NetworkCache) {
  return createTool({
    name: "get_station",
    description:
      "Read one stop or station: official name, system, coordinates, the lines that " +
      "serve it, and the other stops at the same interchange.",
    inputSchema: stationSchema,
    execute: async (args) => {
      const { network } = await cache.get();
      const station = network.stations.find((candidate) => candidate.id === args.stationId);
      if (!station) {
        return { ditemukan: false, stationId: args.stationId };
      }

      const at = args.at ? new Date(args.at) : new Date();
      const serving = network.lineStops
        .filter((stop) => stop.stationId === station.id)
        .map((stop) => network.lines.find((line) => line.id === stop.lineId))
        .filter((line): line is NonNullable<typeof line> => Boolean(line));
      const departures = network.lineStops
        .filter((stop) => stop.stationId === station.id)
        .map((stop) => {
          const line = network.lines.find((candidate) => candidate.id === stop.lineId);
          if (!line) return null;
          const state = serviceAt(line, stop.direction, at);
          if (state && state.reliable && !state.active) return null;
          const directionStops = network.lineStops
            .filter((entry) => entry.lineId === line.id && entry.direction === stop.direction)
            .sort((a, b) => a.position - b.position);
          const headsignId = directionStops[directionStops.length - 1]?.stationId;
          return {
            code: line.code,
            direction: stop.direction,
            headsign:
              network.stations.find((candidate) => candidate.id === headsignId)?.name ?? null,
            serviceLabel: state?.label ?? "Schedule not confirmed",
            headwayMinMinutes: state?.headwayMinMinutes ?? null,
            detail: state?.detail ?? null,
            active: state?.active ?? true,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        .filter(
          (entry, index, list) =>
            list.findIndex((candidate) => candidate.code === entry.code && candidate.direction === entry.direction) ===
            index,
        );

      const group = network.stationGroups.find((candidate) =>
        candidate.stationIds.includes(station.id),
      );

      return {
        ditemukan: true,
        stationId: station.id,
        name: station.name,
        code: station.code,
        systemId: station.systemId,
        latitude: station.latitude,
        longitude: station.longitude,
        isInterchange: station.isInterchange,
        area: station.area,
        description: station.description,
        lines: serving.map((line) => ({
          lineId: line.id,
          code: line.code,
          name: line.name,
          serviceClass: line.serviceClass,
          mode: line.mode,
        })),
        departures,
        simpulLain: (group?.stationIds ?? [])
          .filter((id) => id !== station.id)
          .map((id) => {
            const other = network.stations.find((candidate) => candidate.id === id);
            return other ? { stationId: other.id, name: other.name, systemId: other.systemId } : null;
          })
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
      };
    },
  });
}

const disruptionSchema = z.object({
  query: z
    .string()
    .trim()
    .max(120)
    .optional()
    .describe("Nama jalur atau tempat yang ditanyakan, misalnya JAK 93 atau Bundaran HI"),
  lineIds: z.array(z.string().max(120)).max(12).optional().describe("Id jalur dari tool lain, bila sudah diketahui"),
  stationIds: z.array(z.string().max(120)).max(12).optional().describe("Id halte dari tool lain, bila sudah diketahui"),
  limit: z.number().int().min(1).max(20).optional().describe("Jumlah gangguan yang dikembalikan"),
});

export function createDisruptionTool(cache: NetworkCache) {
  return createTool({
    name: "list_active_disruptions",
    description:
      "Read the notices stored from the operators' announcements. Call it before " +
      "saying a line is clear. Put the name the rider used in query; leave the " +
      "filters empty for the notices active now.",
    inputSchema: disruptionSchema,
    execute: async (args) => {
      const { network, disruptions } = await cache.get();
      const needle = args.query?.toLowerCase().replace(/[^a-z0-9]+/g, "") ?? "";
      const relevant = disruptions.filter((disruption) => {
        const narrowed = needle.length > 0 || Boolean(args.lineIds?.length) || Boolean(args.stationIds?.length);
        if (!narrowed && !isActiveAt(disruption)) return false;
        if (needle.length > 0) {
          const hay = `${disruption.title} ${disruption.body} ${disruption.lineId ?? ""}`
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "");
          if (hay.includes(needle)) return true;
        }
        if (args.lineIds?.length) {
          if (
            args.lineIds.includes(disruption.lineId ?? "") ||
            disruption.affectedLineIds.some((lineId) => args.lineIds?.includes(lineId))
          ) {
            return true;
          }
        }
        if (args.stationIds?.length) {
          if (
            args.stationIds.includes(disruption.stationId ?? "") ||
            disruption.affectedStationIds.some((stationId) => args.stationIds?.includes(stationId))
          ) {
            return true;
          }
        }
        return needle.length === 0 && !(args.lineIds?.length || args.stationIds?.length);
      });

      const limit = args.limit ?? 10;
      return {
        total: relevant.length,
        gangguan: relevant.slice(0, limit).map((disruption) => {
          const stationId = disruption.stationId ?? disruption.affectedStationIds[0] ?? null;
          const station = stationId
            ? network.stations.find((candidate) => candidate.id === stationId)
            : undefined;
          return {
            id: disruption.id,
            judul: disruption.title,
            ringkas: disruption.body.slice(0, 400),
            tingkat: disruption.severity,
            jenis: disruption.kind,
            status: disruption.status,
            sumber: disruption.source,
            sumberTipe: disruption.sourceType,
            contoh: disruption.id.startsWith("contoh:"),
            url: disruption.url,
            lineId: disruption.lineId,
            stationId: disruption.stationId,
            latitude: station?.latitude ?? null,
            longitude: station?.longitude ?? null,
            publishedAt: disruption.publishedAt,
            mulai: disruption.startsAt ?? null,
            berakhir: disruption.endsAt ?? null,
            aktifSekarang: isActiveAt(disruption),
            viaToll: disruption.viaToll === true,
            pengalihan: (disruption.diversions ?? []).map((diversion) => ({
              lineId: diversion.lineId,
              arah: diversion.direction,
              dari: diversion.fromStationId,
              ke: diversion.toStationId,
              melewati: diversion.via.map((via) => ({ nama: via.name, dilayani: via.served })),
              mengikuti: diversion.viaLineCodes ?? [],
              tidakDilayani: diversion.skippedStationIds ?? [],
              perkiraan: diversion.approximate,
            })),
            deskripsiPengalihan: disruption.diversionDescription ?? null,
            catatanWaktu: isActiveAt(disruption)
              ? "Berlaku sekarang."
              : "Tidak berlaku sekarang. Jangan sebut ini penutupan hari ini; cek jendela dan tanggalnya.",
            jendela: (disruption.validityWindows ?? []).map((window) => ({
              mulai: window.startsAt,
              selesai: window.endsAt,
              label: window.label,
            })),
            confidence: disruption.confidence,
          };
        }),
      };
    },
  });
}

const newsSchema = z.object({
  query: z
    .string()
    .min(3)
    .describe("Topik spesifik: nama acara, koridor, halte, dan tanggal bila ada"),
  timeRange: z
    .enum(["day", "week", "month"])
    .optional()
    .describe("Seberapa baru hasilnya; pakai day atau week untuk kejadian hari ini"),
  topic: z
    .enum(["general", "news"])
    .optional()
    .describe("news untuk pemberitaan, general untuk halaman resmi/jadwal"),
  includeDomains: z
    .array(z.string())
    .max(5)
    .optional()
    .describe("Batasi ke domain ini, misalnya transjakarta.co.id"),
  excludeDomains: z.array(z.string()).max(5).optional().describe("Keluarkan domain ini"),
  maxResults: z.number().int().min(1).max(20).optional(),
});

export function createNewsTool(options: { enabled: boolean; search?: NewsSearch | undefined }) {
  return createTool({
    name: "search_news",
    description:
      "Search current news about a disruption, diversion or closure on " +
      "Transjakarta, MRT Jakarta, LRT Jakarta, LRT Jabodebek or KRL Jabodetabek. " +
      "Use it for the latest development; do not search general Jakarta news that " +
      "does not name a mode.",
    inputSchema: newsSchema,
    execute: async (args) => {
      if (!options.enabled || !options.search) {
        return {
          tersedia: false,
          hasil: [],
          pesan: "Tavily tidak dikonfigurasi. Jawab hanya dari data gangguan yang tersimpan.",
        };
      }
      const results = await options.search({
        query: args.query,
        maxResults: args.maxResults ?? 8,
        ...(args.timeRange ? { timeRange: args.timeRange } : {}),
        ...(args.topic ? { topic: args.topic } : {}),
        ...(args.includeDomains?.length ? { includeDomains: args.includeDomains } : {}),
        ...(args.excludeDomains?.length ? { excludeDomains: args.excludeDomains } : {}),
      });
      return {
        tersedia: true,
        hasil: results.map((result) => ({
          judul: result.title,
          ringkas: result.content.slice(0, 500),
          url: result.url,
          sumber: result.source,
          tanggal: result.publishedAt,
          skor: result.score,
        })),
      };
    },
  });
}

/** All tools, in the order the agent should consider them. */
const noticeHistorySchema = z.object({
  query: z
    .string()
    .optional()
    .describe("Text to look for in the notice title or body, e.g. a corridor, a stop, an event"),
  status: z
    .enum(["active", "resolved", "all"])
    .optional()
    .describe("active for what is in force now, resolved for what has ended, all for both"),
  since: z.string().optional().describe("ISO date; only notices published from then on"),
  limit: z.number().int().min(1).max(30).optional().describe("How many notices to return"),
});

/**
 * The notice archive.
 *
 * The board only shows what is in force; a rider asking "is it open again"
 * or "what happened this morning" needs the closed rows too, and the reason
 * they closed. This is the same table the monitor writes.
 */
export function createNoticeHistoryTool(context: TransitAgentContext, cache: NetworkCache) {
  return createTool({
    name: "list_notice_history",
    description:
      "Read notices from the archive, active and already closed. Use it to answer " +
      "whether a corridor has reopened, what happened earlier today, and why a notice " +
      "disappeared from the board. Filter by text, status and date.",
    inputSchema: noticeHistorySchema,
    execute: async (args) => {
      const since = args.since ? new Date(args.since) : undefined;
      if (since && Number.isNaN(since.getTime())) {
        return { notices: [], error: "since is not a valid ISO date" };
      }
      const rows = await listNoticeHistory(context.db, {
        ...(args.query ? { query: args.query } : {}),
        status: args.status ?? "all",
        ...(since ? { since } : {}),
        limit: args.limit ?? 10,
      });
      const { network } = await cache.get();
      const stationName = new Map(network.stations.map((station) => [station.id, station.name]));
      const lineCode = new Map(network.lines.map((line) => [line.id, line.code]));
      return {
        total: rows.length,
        notices: rows.map((row) => {
          const stationIds = Array.isArray(row.affectedStationIds)
            ? row.affectedStationIds.filter((id): id is string => typeof id === "string")
            : [];
          const lineIds = Array.isArray(row.affectedLineIds)
            ? row.affectedLineIds.filter((id): id is string => typeof id === "string")
            : [];
          return {
            id: row.id,
            title: row.title,
            body: row.body.slice(0, 500),
            status: row.status,
            scope: row.scope,
            kind: row.kind,
            severity: row.severity,
            lineCodes: Array.isArray(row.lineCodes) ? row.lineCodes : [],
            lines: lineIds.map((id) => lineCode.get(id) ?? id),
            stations: stationIds.map((id) => stationName.get(id) ?? id),
            startsAt: row.startsAt?.toISOString() ?? null,
            endsAt: row.endsAt?.toISOString() ?? null,
            publishedAt: row.publishedAt.toISOString(),
            resolvedAt: row.resolvedAt?.toISOString() ?? null,
            resolvedReason: row.resolvedReason,
            url: row.url,
          };
        }),
      };
    },
  });
}

const tollSchema = z.object({
  lineCode: z
    .string()
    .trim()
    .max(16)
    .optional()
    .describe("Kode jalur, misalnya 6P atau 7R. Kosongkan untuk mencari semua jalur."),
  toll: z
    .string()
    .trim()
    .max(80)
    .optional()
    .describe("Nama jalan tol atau gerbang, misalnya Jagorawi atau Tol Dalam Kota."),
});

function createTollTool() {
  return createTool({
    name: "find_toll_routes",
    description:
      "Cari jalur yang diketahui memakai jalan tol, dan jalan tol/gerbang yang dilewatinya. Gunakan saat pengumuman menyebut 'via tol', saat halte dilewati tanpa dilayani, atau saat rute tampak melewati beberapa halte. Data 'reported' atau 'conditional' bukan kepastian untuk setiap trip.",
    inputSchema: tollSchema,
    execute: async (input) => {
      const result = searchToll(input);
      return {
        lineCode: input.lineCode ?? null,
        toll: input.toll ?? null,
        services: result.services.slice(0, 30).map((service) => ({
          lineCode: service.lineCode,
          mode: service.mode,
          confidence: service.confidence,
          roads: service.roads.flatMap((id) => {
            const road = tollRoads().find((item) => item.id === id);
            return road ? [{ name: road.name, gates: road.gates }] : [];
          }),
          note: service.note,
          sources: service.sources,
        })),
        roads: result.roads.map((road) => ({
          name: road.name,
          aliases: road.aliases,
          gates: road.gates,
          cities: road.cities,
        })),
        caveat:
          "Tol menjelaskan halte yang dilewati, bukan halte yang pasti ditutup. 'reported'/'conditional' berarti tidak setiap trip memakai tol. Cek pengumuman aktif sebelum menyimpulkan.",
      };
    },
  });
}

export function createTools(
  context: TransitAgentContext,
  cache: NetworkCache,
  news: { enabled: boolean; search?: NewsSearch | undefined },
  roads: RoadLookup | null = null,
) {
  return [
    createPlaceTool(context),
    ...createRiderTools(context),
    createRouteTool(context, cache),
    createStationTool(cache),
    createDisruptionTool(cache),
    createNoticeHistoryTool(context, cache),
    createTollTool(),
    ...(roads ? createLookupTools(cache, roads) : []),
    ...(news.enabled ? [createNewsTool(news)] : []),
  ];
}

