import { createTool } from "@anvia/core/tool";
import { z } from "zod";

import {
  FARE_OPERATOR_LABELS,
  fareOperatorFor,
  formatRupiah,
  matchDisruptions,
  planRoutes,
  quoteFare,
  removesService,
  type FareRules,
  type Itinerary,
} from "@daily-route/transit";

import { PLACE_CONFIDENCE_THRESHOLD } from "@daily-route/semantic";

import type { NetworkCache, TransitAgentContext } from "./context.js";
import type { NewsSearch } from "./news.js";

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
  text: z.string().min(2).describe("Nama tempat, halte, stasiun, atau landmark"),
  limit: z.number().int().min(1).max(10).optional().describe("Jumlah kandidat"),
  systemId: z
    .string()
    .optional()
    .describe("Batasi ke satu sistem, misalnya transjakarta, mrt-jakarta, lrt-jakarta, lrt-jabodebek, krl-jabodetabek"),
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
    name: "cari_tempat",
    description:
      "Mencari halte, stasiun, atau terminal berdasarkan nama yang ditulis pengguna. " +
      "Gunakan tool ini setiap kali pengguna menyebut tempat yang belum pasti Identity-nya. " +
      "Mengembalikan kandidat teratas beserta koordinat dan skor kecocokan.",
    inputSchema: placeSchema,
    execute: async (args): Promise<PlaceToolOutput> => {
      const candidates = await context.resolver.resolve(args.text, {
        limit: args.limit ?? 6,
        ...(args.systemId ? { systemId: args.systemId } : {}),
      });
      return {
        query: args.text,
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
  asal: z.string().min(2).describe("Nama tempat asal"),
  tujuan: z.string().min(2).describe("Nama tempat tujuan"),
  maksAlternatif: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .describe("Berapa banyak rute yang dikembalikan"),
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
  }[];
  peringatan: string[];
};

type DisruptionSummary = {
  judul: string;
  tingkat: string;
  jenis: string;
  sumber: string;
  url: string | null;
  publishedAt: string;
  memengaruhi: string;
};

export function createRouteTool(context: TransitAgentContext, cache: NetworkCache) {
  return createTool({
    name: "rencana_rute",
    description:
      "Menghitung rute perjalanan antara dua tempat pada jaringan Transjakarta, MRT Jakarta, LRT Jakarta, " +
      "LRT Jabodebek, dan KRL Jabodetabek. Mengembalikan itinerary per segmen, estimasi durasi, " +
      "jumlah transfer, serta gangguan yang memengaruhi rute tersebut. " +
      "Bila ada penutupan atau pengalihan, rute alternatif ikut dikembalikan.",
    inputSchema: routeSchema,
    execute: async (args): Promise<RouteToolOutput> => {
      const [{ network, disruptions, fareRules }, originCandidates, destinationCandidates] = await Promise.all([
        cache.get(),
        context.resolver.resolve(args.asal, { limit: 5 }),
        context.resolver.resolve(args.tujuan, { limit: 5 }),
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
          asal: { text: args.asal, stationId: origin?.stationId ?? null, name: origin?.name ?? null },
          tujuan: {
            text: args.tujuan,
            stationId: destination?.stationId ?? null,
            name: destination?.name ?? null,
          },
          rute: [],
          gangguan: [],
          status: "tidak-diketahui",
          hambatan: [],
          catatan: [
            !origin || origin.score < PLACE_CONFIDENCE_THRESHOLD
              ? `Tidak menemukan tempat asal "${args.asal}". Minta pengguna memberi nama yang lebih spesifik.`
              : `Tidak menemukan tempat tujuan "${args.tujuan}". Minta pengguna memberi nama yang lebih spesifik.`,
          ],
        };
      }

      const routes = planRoutes(network, origin.stationId, destination.stationId, {
        maxAlternatives: args.maksAlternatif ?? 3,
      });

      if (routes.length === 0) {
        return {
          asal: { text: args.asal, stationId: origin.stationId, name: origin.name },
          tujuan: { text: args.tujuan, stationId: destination.stationId, name: destination.name },
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
          asal: { text: args.asal, stationId: origin.stationId, name: origin.name },
          tujuan: { text: args.tujuan, stationId: destination.stationId, name: destination.name },
          rute: [],
          gangguan: [],
          status: "tidak-diketahui",
          hambatan: [],
          catatan: ["Rute tidak dapat dihitung."],
        };
      }

      const matches = matchDisruptions(primary, disruptions);
      const blocking = matches.filter((match) => removesService(match.disruption));

      const summaries: RouteSummary[] = routes.map((route) =>
        summarize(route, fareOf(route, fareRules)),
      );

      // A closure on the primary route invalidates it: the alternative is
      // recomputed without the blocked line and stops.
      if (blocking.length > 0) {
        const avoidLineIds = new Set<string>();
        const avoidStationIds = new Set<string>();
        for (const match of blocking) {
          for (const lineId of match.lineIds) avoidLineIds.add(lineId);
          for (const stationId of match.stationIds) avoidStationIds.add(stationId);
        }
        const alternatives = planRoutes(network, origin.stationId, destination.stationId, {
          maxAlternatives: 2,
          avoidLineIds: [...avoidLineIds],
          avoidStationIds: [...avoidStationIds],
        });
        for (const alternative of alternatives) {
          summaries.push({
            ...summarize(alternative, fareOf(alternative, fareRules)),
            peringatan: ["Rute alternatif — jalur utama sedang dialihkan atau ditutup."],
          });
        }
        notes.push(
          "Jalur utama terdampak pengalihan atau penutupan; rute alternatif ditampilkan lebih dulu.",
        );
      }

      // The verdict the rider is really asking for: is the way open?
      const obstructions = matches
        .filter((match) => removesService(match.disruption))
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

      return {
        asal: { text: args.asal, stationId: origin.stationId, name: origin.name },
        tujuan: { text: args.tujuan, stationId: destination.stationId, name: destination.name },
        rute: summaries,
        gangguan: matches.map((match) => summarizeDisruption(match, primary)),
        status: obstructions.length > 0 ? "terhalang" : "terbuka",
        hambatan: obstructions,
        catatan: notes,
      };
    },
  });
}

function summarize(itinerary: Itinerary, fare: FareSummary): RouteSummary {
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
      dari: leg.fromName,
      ke: leg.toName,
      durasiMenit: leg.durationMinutes,
      jarakKm: Number(leg.distanceKm.toFixed(2)),
      halte: leg.stops.map((stop) => stop.name),
      alasanJalanKaki: leg.walkReason,
      gantiDari: leg.changedFrom,
      gantiDi: leg.changedAt,
      tungguMenit: leg.waitMinutes,
    })),
    peringatan: itinerary.warnings,
  };
}

/** The price of a journey, in the shape the model reads it. */
function fareOf(itinerary: Itinerary, rules: FareRules | null): FareSummary {
  if (!rules) {
    return { total: 0, label: "tidak diketahui", rincian: [] };
  }

  const quote = quoteFare({
    at: new Date(),
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
    total: quote.totalIdr,
    label: formatRupiah(quote.totalIdr),
    rincian: quote.breakdown.map((item) => ({
      label: item.label,
      jumlah: item.amountIdr,
    })),
  };
}

function summarizeDisruption(
  match: ReturnType<typeof matchDisruptions>[number],
  itinerary: Itinerary,
): DisruptionSummary {
  const affectedLines = match.lineIds
    .map((lineId) => itinerary.legs.find((leg) => leg.lineId === lineId)?.lineName)
    .filter((name): name is string => Boolean(name));

  return {
    judul: match.disruption.title,
    tingkat: match.disruption.severity,
    jenis: match.disruption.kind,
    sumber: match.disruption.source,
    url: match.disruption.url,
    publishedAt: match.disruption.publishedAt,
    memengaruhi:
      affectedLines.length > 0
        ? affectedLines.join(", ")
        : match.stationIds.length > 0
          ? `${match.stationIds.length} halte pada rute`
          : "rute",
  };
}

const stationSchema = z.object({
  stationId: z.string().min(1).describe("Id stasiun atau halte"),
});

export function createStationTool(cache: NetworkCache) {
  return createTool({
    name: "detail_stasiun",
    description:
      "Mengambil detail satu halte atau stasiun: nama resmi, sistem, koordinat, " +
      "jalur yang melayani, dan simpul transit lain di lokasi yang sama.",
    inputSchema: stationSchema,
    execute: async (args) => {
      const { network } = await cache.get();
      const station = network.stations.find((candidate) => candidate.id === args.stationId);
      if (!station) {
        return { ditemukan: false, stationId: args.stationId };
      }

      const serving = network.lineStops
        .filter((stop) => stop.stationId === station.id)
        .map((stop) => network.lines.find((line) => line.id === stop.lineId))
        .filter((line): line is NonNullable<typeof line> => Boolean(line));

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
  lineIds: z.array(z.string()).optional().describe("Id jalur yang ingin dicek"),
  stationIds: z.array(z.string()).optional().describe("Id halte yang ingin dicek"),
});

export function createDisruptionTool(cache: NetworkCache) {
  return createTool({
    name: "cek_gangguan",
    description:
      "Memeriksa gangguan yang sedang aktif: pengalihan rute, penutupan halte, " +
      "keterlambatan, dan perubahan jadwal yang diumumkan operator.",
    inputSchema: disruptionSchema,
    execute: async (args) => {
      const { disruptions } = await cache.get();
      const relevant = disruptions.filter((disruption) => {
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
        return !(args.lineIds?.length || args.stationIds?.length);
      });

      return {
        total: relevant.length,
        gangguan: relevant.map((disruption) => ({
          judul: disruption.title,
          ringkas: disruption.body.slice(0, 400),
          tingkat: disruption.severity,
          jenis: disruption.kind,
          status: disruption.status,
          sumber: disruption.source,
          sumberTipe: disruption.sourceType,
          url: disruption.url,
          lineId: disruption.lineId,
          stationId: disruption.stationId,
          publishedAt: disruption.publishedAt,
          confidence: disruption.confidence,
        })),
      };
    },
  });
}

const newsSchema = z.object({
  query: z.string().min(3).describe("Kata kunci pencarian berita"),
  maxResults: z.number().int().min(1).max(20).optional(),
});

export function createNewsTool(options: { enabled: boolean; search?: NewsSearch | undefined }) {
  return createTool({
    name: "cari_berita",
    description:
      "Mencari berita terkini tentang gangguan layanan transportasi di Jakarta melalui Tavily. " +
      "Gunakan saat pengguna menanyakan kabar terbaru, atau ketika tidak ada pengalihan resmi " +
      "tetapi ada indikasi gangguan di lapangan.",
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
export function createTools(
  context: TransitAgentContext,
  cache: NetworkCache,
  news: { enabled: boolean; search?: NewsSearch | undefined },
) {
  return [
    createPlaceTool(context),
    createRouteTool(context, cache),
    createStationTool(cache),
    createDisruptionTool(cache),
    createNewsTool(news),
  ];
}

