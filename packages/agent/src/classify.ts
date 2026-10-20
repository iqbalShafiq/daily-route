import { Agent } from "@anvia/core";
import { z } from "zod";

import type { PlaceResolver } from "@daily-route/semantic";
import type { Disruption } from "@daily-route/transit";

import type { NetworkCache } from "./context.js";
import { createCompletionModel, type ModelConfig } from "./model.js";

/**
 * Turning an announcement into a disruption record.
 *
 * An operator's post is prose: "Layanan Koridor 1 dialihkan sementara mulai
 * malam ini di sekitar Halte Bundaran Senayan". The classifier reads that
 * prose and decides whether it announces a disruption at all, what kind it
 * is, and which places it names.
 *
 * The names it produces are then grounded against the real station list, so
 * the database only ever holds station ids that exist.
 */

export const disruptionAnalysisSchema = z.object({
  isDisruption: z
    .boolean()
    .describe("true bila pengumuman berisi gangguan, pengalihan, penutupan, keterlambatan, atau perubahan layanan"),
  kind: z.enum([
    "diversion",
    "closure",
    "delay",
    "service-change",
    "maintenance",
    "strike",
    "weather",
    "unknown",
  ]),
  severity: z.enum(["info", "warning", "severe", "critical"]),
  title: z.string().describe("Judul singkat, maksimal satu kalimat"),
  summary: z.string().describe("Ringkasan pengumuman dalam bahasa Indonesia"),
  affectedStationNames: z
    .array(z.string())
    .describe("Nama halte, stasiun, atau terminal yang disebut, persis seperti tertulis"),
  affectedLineCodes: z
    .array(z.string())
    .describe("Kode jalur atau koridor yang disebut, misalnya 1, JAK.06, NS, C, T"),
  affectedSystemIds: z
    .array(
      z.enum([
        "transjakarta",
        "mrt-jakarta",
        "lrt-jakarta",
        "lrt-jabodebek",
        "krl-jabodetabek",
      ]),
    )
    .describe("Sistem yangwhom pengumuman ini berlaku"),
  confidence: z.number().min(0).max(1),
  resolvesDisruptionIds: z
    .array(z.string())
    .describe("Id gangguan aktif yang ditandai sudah selesai oleh pengumuman ini; kosong bila tidak ada"),
});

export type DisruptionAnalysis = z.infer<typeof disruptionAnalysisSchema>;

export const CLASSIFIER_INSTRUCTIONS = `Kamu membaca pengumuman resmi operator transportasi Jakarta dan menentukan apakah pengumuman itu berisi gangguan layanan.

Aturan:
- isDisruption hanya true bila ada pengalihan rute, penutupan halte atau jalur, keterlambatan besar, perubahan jadwal, pemeliharaan yang mengganggu, mogok, atau dampak cuaca. Pengumuman jadwal normal, promosi, atau informasi umum bukan gangguan.
- severity: info untuk keterangan ringan, warning untuk gangguan terbatas, severe untuk banyak perjalanan terganggu, critical untuk penutupan total atau pengalihan besar.
- affectedStationNames hanya berisi nama tempat yang benar-benar disebut dalam pengumuman. Jangan menebak nama halte.
- affectedLineCodes berisi kode jalur yang disebut. Gunakan kode yang tertera, contoh "1", "JAK.06", "NS", "C".
- affectedSystemIds berisi sistem yang pengumuman itu berlaku.
- resolvesDisruptionIds berisi id gangguan yang sudah selesai berdasarkan pengumuman ini, hanya jika pengumuman menyebut layanan sudah normal kembali.
- summary ditulis dalam bahasa Indonesia, satu sampai dua kalimat.
`;

export function createClassifierAgent(config: ModelConfig): Agent<DisruptionAnalysis> {
  return new Agent<DisruptionAnalysis>({
    id: "disruption-classifier",
    name: "Klasifikasi Gangguan",
    description: "Membaca pengumuman operator dan mengubahnya menjadi catatan gangguan terstruktur.",
    model: createCompletionModel(config),
    instructions: CLASSIFIER_INSTRUCTIONS,
    outputSchema: disruptionAnalysisSchema,
    maxTurns: 4,
    temperature: 0,
  });
}

export type ClassifyInput = {
  text: string;
  url: string | null;
  publishedAt: Date;
  source: string;
  sourceType: "social" | "news" | "official";
  /** Which operator published it, when known. */
  systemHint: string | null;
  /** The id of the post or article, used for deduplication. */
  externalId: string;
};

export type ClassifyResult = {
  analysis: DisruptionAnalysis;
  /** The grounded station ids the analysis refers to. */
  stationIds: string[];
  /** The grounded line ids the analysis refers to. */
  lineIds: string[];
  /** The active disruptions this announcement closes. */
  resolvesDisruptionIds: string[];
};

/**
 * Classifies one announcement and grounds the places it names.
 *
 * Grounding is the reason this is not a pure prompt: the model may only
 * *name* places, and the resolver decides which real station each name
 * refers to.
 */
export class DisruptionClassifier {
  readonly #agent: Agent<DisruptionAnalysis>;
  readonly #resolver: PlaceResolver;
  readonly #cache: NetworkCache;

  constructor(agent: Agent<DisruptionAnalysis>, resolver: PlaceResolver, cache: NetworkCache) {
    this.#agent = agent;
    this.#resolver = resolver;
    this.#cache = cache;
  }

  async classify(input: ClassifyInput): Promise<ClassifyResult> {
    const { network, disruptions } = await this.#cache.get();

    const hints = groundingHints(network.stations, network.lines);
    const openDisruptions = disruptions.slice(0, 25).map((disruption) => ({
      id: disruption.id,
      judul: disruption.title,
      jalur: disruption.lineId,
      halte: disruption.stationId,
    }));

    const prompt = [
      "Pengumuman berikut berasal dari akun resmi operator transportasi Jakarta.",
      "",
      `Sumber: ${input.source}`,
      input.systemHint ? `Sistem: ${input.systemHint}` : "",
      `Waktu publikasi: ${input.publishedAt.toISOString()}`,
      input.url ? `Tautan: ${input.url}` : "",
      "",
      "Isi pengumuman:",
      input.text,
      "",
      "Halte dan stasiun yang ada pada jaringan (gunakan nama ini bila cocok):",
      hints,
      "",
      "Gangguan yang masih aktif (id, judul):",
      openDisruptions.length > 0
        ? openDisruptions.map((entry) => `- ${entry.id}: ${entry.judul}`).join("\n")
        : "(tidak ada)",
    ]
      .filter((part) => part !== "")
      .join("\n");

    const outcome = await this.#agent.generate({ prompt });

    if (outcome.type !== "response") {
      throw new Error(
        `Classification did not produce a structured result (outcome: ${outcome.type})`,
      );
    }

    const analysis = outcome.output;

    const stationIds: string[] = [];
    for (const name of analysis.affectedStationNames) {
      const candidates = await this.#resolver.resolve(name, { limit: 1 });
      const best = candidates[0];
      if (best && best.score >= 0.25) stationIds.push(best.stationId);
    }

    const lineIds: string[] = [];
    for (const code of analysis.affectedLineCodes) {
      const normalized = code.trim().toLowerCase();
      const line = network.lines.find(
        (candidate) =>
          candidate.code.toLowerCase() === normalized ||
          candidate.name.toLowerCase().includes(normalized),
      );
      if (line) lineIds.push(line.id);
    }

    return {
      analysis,
      stationIds: [...new Set(stationIds)],
      lineIds: [...new Set(lineIds)],
      resolvesDisruptionIds: analysis.resolvesDisruptionIds,
    };
  }
}

/**
 * The names the classifier may use.
 *
 * Only interchanges and terminals are listed: they are the places an
 * announcement names, and a shorter list keeps the prompt small and the
 * grounding precise.
 */
export function groundingHints(
  stations: readonly { name: string; isInterchange: boolean; systemId: string }[],
  lines: readonly { code: string; name: string; serviceClass: string }[],
): string {
  const places = stations
    .filter((station) => station.isInterchange)
    .map((station) => `${station.name} (${station.systemId})`);
  const uniquePlaces = [...new Set(places)].slice(0, 160);

  const lineNames = lines
    .filter((line) => line.serviceClass !== "feeder")
    .map((line) => `${line.code} — ${line.name}`)
    .slice(0, 80);

  return [...uniquePlaces, ...lineNames].join("\n");
}

/** Build a disruption row from a classification result. */
export function toDisruption(input: {
  analysis: DisruptionAnalysis;
  result: ClassifyResult;
  source: string;
  sourceType: "social" | "news" | "official";
  externalId: string;
  url: string | null;
  publishedAt: Date;
}): Omit<Disruption, "id"> {
  return {
    source: input.source,
    sourceType: input.sourceType,
    systemId: input.analysis.affectedSystemIds[0] ?? null,
    lineId: input.result.lineIds[0] ?? null,
    stationId: input.result.stationIds[0] ?? null,
    stationGroupId: null,
    severity: input.analysis.severity,
    status: "active",
    kind: input.analysis.kind,
    title: input.analysis.title,
    body: input.analysis.summary,
    url: input.url,
    confidence: input.analysis.confidence,
    publishedAt: input.publishedAt.toISOString(),
    observedAt: new Date().toISOString(),
    resolvedAt: null,
    affectedStationIds: input.result.stationIds,
    affectedLineIds: input.result.lineIds,
  };
}
