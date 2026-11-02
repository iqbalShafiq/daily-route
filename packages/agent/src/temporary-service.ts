/**
 * Announced temporary services.
 *
 * A Post can announce a new shuttle or a replacement corridor that is not in
 * the committed network. The model decides what the announcement says; this
 * module is the wall around that decision:
 *
 * - the model names stops, it never supplies station ids or coordinates;
 * - every stop is resolved against the real network;
 * - a code that already belongs to a permanent line is not silently cloned;
 * - the record keeps its source Post, image URLs and quote;
 * - the planner only sees it through `withTemporaryServices`.
 *
 * The result is an overlay, not a hand edit of `data/transit-network.json`.
 */

import { Agent, type UserContentPart } from "@anvia/core";
import { z } from "zod";

import type { Database } from "@daily-route/db";
import { saveTemporaryService } from "@daily-route/db";
import type { Env } from "@daily-route/env";
import {
  PLACE_CONFIDENCE_THRESHOLD,
  type PlaceResolver,
} from "@daily-route/semantic";
import type {
  Direction,
  LineServiceWindow,
  ServiceClass,
  TemporaryService,
  TransitNetwork,
} from "@daily-route/transit";

import { acceptedEndsAt, acceptedStartsAt } from "./classify.js";
import type { NetworkCache } from "./context.js";
import { createCompletionModel, MEDIUM_REASONING, type ModelConfig } from "./model.js";
import { langfuseObservability } from "./tracing.js";

export const SERVICE_CHANGE_PROMPT_VERSION = "2026-10-29.1";

const serviceClassSchema = z.enum([
  "brt",
  "non-brt",
  "mikrotrans",
  "minitrans",
  "royaltrans",
  "wisata",
  "rumah-susun",
  "transjabodetabek",
  "amari",
  "rapid-transit",
  "lrt",
  "commuter-rail",
]);

/**
 * The model's structured reading of one Post.
 *
 * It may return a false negative. It may not return a station id, a
 * coordinate or a duration: those are decided by the resolver and the
 * planner after this schema.
 */
export const temporaryServiceProposalSchema = z.object({
  isTemporaryService: z
    .boolean()
    .describe(
      "true hanya bila Post mengumumkan layanan baru yang beroperasi terbatas waktu (shuttle, koridor/rute pengganti, rute tambahan), bukan sekadar penutupan, pengalihan, atau imbauan.",
    ),
  code: z
    .string()
    .nullable()
    .describe("Kode layanan yang tertulis, misalnya 9ST. Null bila tidak ada kode."),
  name: z
    .string()
    .nullable()
    .describe("Nama layanan sependek mungkin, misalnya Grogol Reformasi - Roxy. Null bila tidak ada."),
  systemId: z
    .enum(["transjakarta", "mrt-jakarta", "lrt-jakarta", "lrt-jabodebek", "krl-jabodetabek"])
    .describe("Operator jaringan yang mengumumkan layanan ini."),
  serviceClass: serviceClassSchema.describe("Kelas layanan yang paling sesuai."),
  directions: z
    .array(
      z.object({
        direction: z
          .enum(["forward", "backward"])
          .describe("Arah perjalanan. Loop memakai forward dan mengulang halte awal di akhir."),
        headsign: z.string().describe("Tujuan yang tertulis pada arah ini."),
        stopNames: z
          .array(z.string())
          .describe("Nama halte berurutan persis seperti tertulis; jangan menambah halte yang tidak ada."),
      }),
    )
    .describe("Satu entri untuk setiap arah yang benar-benar diumumkan."),
  startsAt: z
    .string()
    .nullable()
    .describe("Awal berlaku, ISO-8601 dengan offset Asia/Jakarta. Null bila tidak disebut."),
  endsAt: z
    .string()
    .nullable()
    .describe("Akhir berlaku, ISO-8601 dengan offset. Null bila tidak disebut; jangan mengarang durasi."),
  windows: z
    .array(
      z.object({
        days: z
          .array(z.number().int().min(1).max(7))
          .describe("Hari ISO, 1 Senin sampai 7 Minggu; [1,2,3,4,5,6,7] untuk setiap hari."),
        startMinute: z.number().int().min(0).max(1440).describe("Menit dari tengah malam, 05:00 = 300."),
        endMinute: z.number().int().min(0).max(1440).describe("Menit dari tengah malam, 22:00 = 1320."),
        headwayMinutes: z
          .number()
          .positive()
          .nullable()
          .describe("Frekuensi yang tertulis. Null bila pengumuman tidak menyebut frekuensi."),
      }),
    )
    .describe("Jam layanan harian yang diumumkan. Kosong bila tidak ada jam yang jelas."),
  sourceQuote: z
    .string()
    .describe("Satu kalimat atau frasa dari teks/gambar yang menjadi dasar layanan ini."),
  confidence: z.number().min(0).max(1).describe("Keyakinan 0 sampai 1 berdasarkan bukti yang benar-benar terlihat."),
  notes: z.array(z.string()).describe("Catatan singkat tentang hal yang ambigu atau tidak terbaca."),
});

export type TemporaryServiceProposal = z.infer<typeof temporaryServiceProposalSchema>;

export type TemporaryServiceInput = {
  text: string;
  url: string | null;
  publishedAt: Date;
  externalId: string;
  authorHandle: string;
  systemId: string | null;
  images: readonly { url: string; altText?: string }[];
};

export type TemporaryServiceWriteResult =
  | { status: "saved" | "needs_review"; service: TemporaryService; reason: null }
  | { status: "rejected"; service: null; reason: string };

export class TemporaryServiceRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemporaryServiceRejected";
  }
}

const TEMPORARY_SERVICE_INSTRUCTIONS = `Kamu membaca satu Post resmi operator transportasi Jakarta, termasuk semua gambar yang dilampirkan, dan memutuskan apakah Post itu mengumumkan layanan sementara yang baru.

Aturan:
- isTemporaryService hanya true bila Post mengumumkan layanan yang bisa dinaiki dan tidak ada di jaringan tetap: shuttle, koridor/rute pengganti, short-turn, atau rute tambahan dengan kode baru. Penutupan, pengalihan, keterlambatan, atau imbauan biasa bukan layanan baru.
- Baca SEMUA gambar sebagai satu pengumuman. Gambar pertama bisa jadi sampul; gambar berikutnya bisa memuat peta, urutan halte, jam, dan rute alternatif. Jangan hanya membaca gambar pertama.
- Jangan mengarang kode, nama, halte, jam, tanggal, atau frekuensi. Bila peta tidak menunjukkan urutan halte dengan jelas, isi hanya yang benar-benar terbaca dan turunkan confidence.
- code ditulis persis seperti di pengumuman, misalnya 9ST. Bila tidak ada kode, null.
- name adalah nama layanan, bukan seluruh kalimat. Contoh: "Grogol Reformasi - Roxy".
- directions memuat setiap arah yang diumumkan. Loop memakai direction "forward" dan mengulang halte awal di akhir. Untuk rute dua arah, buat dua entri; jangan membalik urutan halte sendiri bila gambar hanya menunjukkan satu arah.
- stopNames berisi nama halte persis seperti tertulis, berurutan. Jangan menambahkan halte yang hanya dilewati tanpa disebut. Jangan menulis id, koordinat, atau kode internal.
- startsAt dan endsAt hanya dari tanggal/jam yang tertulis. Tanggal tanpa jam memakai 00:00 Asia/Jakarta untuk startsAt dan 23:59:59 untuk endsAt. Bila tidak ada akhir, endsAt null; jangan mengarang "sampai perbaikan selesai".
- windows adalah jam operasional harian. 05:00 = startMinute 300; 22:00 = endMinute 1320. days memakai 1 Senin sampai 7 Minggu. Bila pengumuman menyebut "setiap hari", isi 1-7.
- headwayMinutes hanya bila pengumuman menyebut frekuensi. Bila tidak, null. Jangan menebak dari peta.
- sourceQuote adalah potongan teks atau tulisan di gambar yang paling mendukung layanan ini. Bila gambar yang mendukung, tulis kutipan pendek dari gambar dan sebut "gambar".
- Bila Post hanya menyebut layanan yang sudah ada (9, 8, 3) atau hanya menyarankan rute alternatif, isTemporaryService false.
- Bila ada beberapa layanan baru, pilih yang paling jelas dan catat yang lain di notes; jangan menggabungkan dua kode menjadi satu.
- notes dalam bahasa Indonesia, singkat.
`;

/** The multimodal prompt: every image is sent, not just the first. */
export function temporaryServicePrompt(
  input: TemporaryServiceInput,
): string | { role: "user"; content: readonly UserContentPart[] } {
  const text = [
    "Post resmi operator transportasi Jakarta.",
    "",
    `Sumber: x:${input.authorHandle}`,
    input.systemId ? `Sistem: ${input.systemId}` : "",
    `Waktu publikasi: ${input.publishedAt.toISOString()}`,
    input.url ? `Tautan: ${input.url}` : "",
    `Jumlah gambar: ${input.images.length}`,
    "",
    "Teks Post:",
    input.text,
    "",
    input.images.length > 0
      ? "Semua gambar di bawah adalah bagian dari Post yang sama. Baca seluruh gambar; urutan halte dan jam sering ada di gambar kedua dan seterusnya."
      : "Post ini tidak memiliki gambar.",
  ]
    .filter((part) => part !== "")
    .join("\n");

  if (input.images.length === 0) return text;
  return {
    role: "user",
    content: [
      { type: "text", text },
      ...input.images.map((image) => ({
        type: "image" as const,
        image: { type: "url" as const, url: image.url },
        detail: "high" as const,
      })),
    ],
  };
}

export function createTemporaryServiceAgent(
  config: ModelConfig,
  env: Env,
): Agent<TemporaryServiceProposal> {
  const observability = langfuseObservability(env);
  return new Agent<TemporaryServiceProposal>({
    id: "temporary-service-reader",
    name: "Pembaca Layanan Sementara",
    description:
      "Membaca pengumuman dan gambar operator untuk menemukan layanan shuttle/koridor sementara yang baru.",
    model: createCompletionModel(config, "temporary-service"),
    maxTokens: 8192,
    instructions: TEMPORARY_SERVICE_INSTRUCTIONS,
    outputSchema: temporaryServiceProposalSchema,
    maxTurns: 1,
    providerOptions: MEDIUM_REASONING,
    ...(observability ? { observability } : {}),
  });
}

/**
 * Resolve the names the model read and write one overlay row.
 *
 * The writer is usable without a model, so the stub trial can feed a recorded
 * agent decision through exactly the same validation and persistence path.
 */
export class TemporaryServiceWriter {
  readonly #db: Database;
  readonly #resolver: PlaceResolver;

  constructor(deps: { db: Database; resolver: PlaceResolver }) {
    this.#db = deps.db;
    this.#resolver = deps.resolver;
  }

  async write(
    proposal: TemporaryServiceProposal,
    input: TemporaryServiceInput,
    network: TransitNetwork,
    metadata: Record<string, unknown> = {},
  ): Promise<TemporaryServiceWriteResult> {
    if (!proposal.isTemporaryService) {
      return { status: "rejected", service: null, reason: "Bukan layanan sementara baru." };
    }
    const code = proposal.code?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") ?? "";
    if (!/^[A-Z0-9]{2,8}$/.test(code)) {
      return { status: "rejected", service: null, reason: "Kode layanan tidak valid." };
    }
    if (
      network.lines.some(
        (line) =>
          line.systemId === proposal.systemId &&
          line.code.toUpperCase() === code &&
          line.metadata?.["temporary"] !== true,
      )
    ) {
      return {
        status: "rejected",
        service: null,
        reason: `Kode ${code} sudah dipakai layanan tetap; ini bukan layanan baru.`,
      };
    }
    const startsAt = acceptedStartsAt(proposal.startsAt);
    if (!startsAt) {
      return { status: "rejected", service: null, reason: "Waktu mulai tidak terbaca." };
    }
    const endsAt = acceptedEndsAt(proposal.endsAt);
    if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
      return { status: "rejected", service: null, reason: "Waktu berakhir sebelum waktu mulai." };
    }
    const windows = normalizeWindows(proposal.windows);
    if (windows.length === 0) {
      return { status: "rejected", service: null, reason: "Jam operasional tidak terbaca." };
    }
    const directions: TemporaryService["directions"] = [];
    for (const direction of proposal.directions) {
      const stationIds: string[] = [];
      for (const name of direction.stopNames) {
        const stationId = await this.#resolveStop(name, proposal.systemId, network);
        if (!stationId) {
          return {
            status: "rejected",
            service: null,
            reason: `Halte "${name}" tidak ditemukan di jaringan; tidak ada halte yang dikarang.`,
          };
        }
        if (stationIds[stationIds.length - 1] !== stationId) stationIds.push(stationId);
      }
      if (stationIds.length < 2) {
        return {
          status: "rejected",
          service: null,
          reason: `Arah ${direction.direction} tidak memiliki dua halte yang bisa dinaiki.`,
        };
      }
      directions.push({
        direction: direction.direction as Direction,
        headsign: direction.headsign.trim() || (network.stations.find((station) => station.id === stationIds.at(-1))?.name ?? code),
        stationIds,
        windows,
      });
    }
    if (directions.length === 0) {
      return { status: "rejected", service: null, reason: "Tidak ada arah layanan yang terbaca." };
    }
    const name = proposal.name?.trim() || `${code} ${network.stations.find((station) => station.id === directions[0]?.stationIds[0])?.name ?? ""}`.trim();
    const quote = proposal.sourceQuote.trim();
    if (!quote) {
      return { status: "rejected", service: null, reason: "Tidak ada kutipan sumber." };
    }
    const tightened = clampConfidence(proposal.confidence);
    const eventKey = `temporary-${proposal.systemId}-${code.toLowerCase()}-${jakartaDateOf(startsAt)}`;
    const service: TemporaryService = {
      id: eventKey,
      eventKey,
      code,
      name,
      systemId: proposal.systemId,
      mode: modeOf(proposal.serviceClass),
      serviceClass: proposal.serviceClass as ServiceClass,
      operator: OPERATOR_LABELS[proposal.systemId],
      color: null,
      directions,
      startsAt,
      endsAt,
      reviewAt: new Date(Date.parse(startsAt) + 14 * 24 * 3_600_000).toISOString(),
      status: tightened >= 0.65 ? "active" : "needs_review",
      source: {
        postId: input.externalId,
        url: input.url,
        authorHandle: input.authorHandle,
        publishedAt: input.publishedAt.toISOString(),
        quote,
        images: input.images.map((image) => image.url),
      },
      confidence: tightened,
      metadata: {
        ...metadata,
        promptVersion: SERVICE_CHANGE_PROMPT_VERSION,
        headwayEstimated: proposal.windows.some((window) => window.headwayMinutes === null),
        proposalNotes: proposal.notes,
      },
    };
    await saveTemporaryService(this.#db, service);
    return {
      status: service.status === "active" ? "saved" : "needs_review",
      service,
      reason: null,
    };
  }

  async #resolveStop(name: string, systemId: string, network: TransitNetwork): Promise<string | null> {
    const query = name.trim();
    if (!query) return null;
    const candidates = await this.#resolver.resolve(query, { limit: 8, systemId });
    const best = candidates
      .filter((candidate) => candidate.systemId === systemId)
      .filter((candidate) => candidate.score >= PLACE_CONFIDENCE_THRESHOLD)
      .sort((left, right) => right.score - left.score)[0];
    if (!best) return null;
    return network.stations.some((station) => station.id === best.stationId) ? best.stationId : null;
  }
}

/**
 * The model and the writer together.
 *
 * A false negative returns `ignored` without touching the database. A
 * positive answer still goes through the writer, so a hallucinated stop cannot
 * become a routable line.
 */
export class TemporaryServiceAgent {
  readonly #agent: Agent<TemporaryServiceProposal>;
  readonly #writer: TemporaryServiceWriter;
  readonly #cache: NetworkCache;
  readonly #modelId: string;

  constructor(deps: {
    agent: Agent<TemporaryServiceProposal>;
    writer: TemporaryServiceWriter;
    cache: NetworkCache;
    modelId: string;
  }) {
    this.#agent = deps.agent;
    this.#writer = deps.writer;
    this.#cache = deps.cache;
    this.#modelId = deps.modelId;
  }

  async process(input: TemporaryServiceInput): Promise<
    { status: "ignored" } | TemporaryServiceWriteResult
  > {
    const outcome = await this.#agent.generate({
      prompt: temporaryServicePrompt(input),
      abortSignal: AbortSignal.timeout(120_000),
      trace: {
        name: "baca-layanan-sementara",
        version: SERVICE_CHANGE_PROMPT_VERSION,
        tags: ["monitor", "temporary-service"],
        metadata: {
          externalId: input.externalId,
          images: input.images.length,
          authorHandle: input.authorHandle,
        },
      },
    });
    if (outcome.type !== "response") {
      throw new Error(`Pembaca layanan sementara tidak menghasilkan output terstruktur (${outcome.type}).`);
    }
    if (!outcome.output.isTemporaryService) return { status: "ignored" };
    const { network } = await this.#cache.get();
    const written = await this.#writer.write(outcome.output, input, network, {
      model: this.#modelId,
    });
    if (written.status === "saved") this.#cache.invalidate();
    return written;
  }
}

/** A deliberately broad trigger, not a route-specific rule. */
export function looksLikeTemporaryService(text: string, imageCount = 0): boolean {
  const hasServiceWord = /\b(shuttle|rute|koridor|layanan|bus|feeder)\b/i.test(text);
  const hasChangeWord = /\b(mulai|beroperasi|mengoperasikan|dibuka|ditambah|tambahan|pengganti|sementara)\b/i.test(text);
  if (imageCount > 0 && text.trim().length === 0) return true;
  return hasServiceWord && hasChangeWord;
}

function normalizeWindows(
  windows: readonly {
    days: number[];
    startMinute: number;
    endMinute: number;
    headwayMinutes: number | null;
  }[],
): LineServiceWindow[] {
  const output: LineServiceWindow[] = [];
  for (const window of windows) {
    const days = [...new Set(window.days)].filter((day) => Number.isInteger(day) && day >= 1 && day <= 7).sort();
    if (days.length === 0) continue;
    if (!Number.isFinite(window.startMinute) || !Number.isFinite(window.endMinute)) continue;
    if (window.startMinute < 0 || window.endMinute > 1440) continue;
    if (window.endMinute <= window.startMinute) continue;
    output.push({
      days,
      startMinute: Math.round(window.startMinute),
      endMinute: Math.round(window.endMinute),
      headwayMinutes:
        window.headwayMinutes !== null && window.headwayMinutes > 0
          ? Math.round(window.headwayMinutes)
          : 10,
      ...(window.headwayMinutes === null ? { estimated: true } : {}),
    });
  }
  return output;
}

function jakartaDateOf(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function modeOf(serviceClass: string): TemporaryService["mode"] {
  if (serviceClass === "rapid-transit") return "metro";
  if (serviceClass === "lrt") return "tram";
  if (serviceClass === "commuter-rail") return "rail";
  if (serviceClass === "mikrotrans" || serviceClass === "minitrans") return "minibus";
  return "bus";
}

const OPERATOR_LABELS: Record<TemporaryServiceProposal["systemId"], string> = {
  transjakarta: "Transjakarta",
  "mrt-jakarta": "MRT Jakarta",
  "lrt-jakarta": "LRT Jakarta",
  "lrt-jabodebek": "LRT Jabodebek",
  "krl-jabodetabek": "KRL Jabodetabek",
};

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
