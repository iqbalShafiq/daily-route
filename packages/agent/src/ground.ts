import { Agent } from "@anvia/core";
import { createTool } from "@anvia/core/tool";
import { z } from "zod";

import type { Env } from "@daily-route/env";
import type { PlaceCandidate, PlaceResolver, RoadCandidate, RoadLookup } from "@daily-route/semantic";
import { stopsOnRoad } from "@daily-route/semantic";
import { haversineKm, type NoticeScope, type RoadRef, type Station, type TransitNetwork } from "@daily-route/transit";

import type { NetworkCache } from "./context.js";
import { createCompletionModel, LOW_REASONING, type ModelConfig } from "./model.js";
import { langfuseObservability } from "./tracing.js";

/**
 * The notice grounder.
 *
 * The classifier reads the announcement and names what it mentions. This
 * agent turns those names into parts of the network. It is the only reader
 * with tools, and the tools exist because two of its questions cannot be
 * answered from the text:
 *
 * - a street named in an announcement exists several times in Greater
 *   Jakarta, and only the one that touches the corridor is the one meant;
 * - a stop the network does not have may be spelled differently, may have a
 *   former name, or may genuinely be missing from the snapshot.
 *
 * The model chooses; the tools supply coordinates and ids; this class checks
 * that every id it keeps came from a tool.
 */

export const groundingSchema = z.object({
  scope: z
    .enum(["stop", "line", "network"])
    .describe(
      "Apa yang terganggu: halte tertentu (stop), koridor/jalur tertentu (line), atau layanan satu operator (network)",
    ),
  stationIds: z
    .array(z.string())
    .describe("Id halte dari hasil tool yang benar-benar terdampak. Jangan mengarang id."),
  lineIds: z
    .array(z.string())
    .describe("Id koridor/jalur dari hasil tool yang benar-benar terdampak. Jangan mengarang id."),
  roads: z
    .array(z.object({ id: z.string(), name: z.string() }))
    .describe("Jalan yang benar-benar menyentuh koridor yang disebut; id dari hasil find_street"),
  note: z.string().describe("Alasan singkat pemilihan ini, satu sampai dua kalimat"),
  confidence: z.number().describe("0 sampai 1, berdasarkan bukti tool, bukan perasaan"),
});

export type GroundingOutput = z.infer<typeof groundingSchema>;

export type GroundingInput = {
  text: string;
  publishedAt: Date;
  /** The stops the announcement names, as written. */
  stationNames: string[];
  /** The names the fast lookup could not find. */
  unresolvedStationNames?: readonly string[];
  /** The corridor codes the announcement names, as printed. */
  lineCodes: string[];
  /** The streets the announcement names, as written. */
  roadNames: string[];
  systemIds: string[];
  /** What the fast path already grounded, offered as a starting point. */
  knownStationIds?: readonly string[];
  knownLineIds?: readonly string[];
  pollId?: string;
  externalId?: string;
  attempt?: number;
};

export type GroundedScope = {
  scope: NoticeScope;
  stationIds: string[];
  lineIds: string[];
  /** The codes the board may print, including a code the network lacks. */
  lineCodes: string[];
  roads: RoadRef[];
  note: string;
  confidence: number;
};

const GROUNDING_INSTRUCTIONS = `Kamu memetakan pengumuman gangguan transportasi Jakarta ke jaringan yang sebenarnya.

Kamu menerima satu pengumuman dan pembacaan awal dari pembaca sebelumnya: nama halte, kode koridor, nama jalan, dan sistem yang disebut. Tugasmu memutuskan bagian jaringan mana yang benar-benar terdampak, memakai tool untuk memastikan.

Aturan:
- Jangan pernah mengarang id halte, id koridor, koordinat, atau nama jalan. Semua id harus berasal dari hasil tool.
- Nama halte yang tidak ditemukan: coba ejaan lain, nama lama, atau kata kuncinya tanpa kata umum (halte, stasiun, terminal). Bila tetap tidak ada, jangan paksakan; laporkan di note.
- Nama halte yang sama bisa merujuk ke tempat yang jauh berbeda: satu nama bisa ada di dua kota. Sebuah halte hanya masuk bila berdiri di koridor yang disebut, atau berjalan kaki dekat dengan halte koridor itu. Halte yang jauh dari koridor bukan halte yang dimaksud, walaupun namanya persis sama.
- Nama jalan: panggil find_street. Nama yang sama ada di beberapa kota. Panggil list_line_stops untuk koridor yang disebut, lalu list_street_stops untuk melihat halte mana yang berdiri di jalan itu. Jalan yang tidak menyentuh satu pun halte koridor itu bukan jalan yang dimaksud, walaupun namanya sama; coba kata kunci lain.
- Gangguan di sebuah jalan biasanya mengenai semua halte koridor yang berdiri di jalan itu, bukan satu halte. Masukkan semuanya.
- Bila jalan itu menjelaskan pengalihan tetapi haltenya tidak ada di jaringan, tetap isi roads dengan jalan yang benar dan biarkan stationIds kosong. Jalan itu yang membuat koridornya dialihkan, dan pembaca berhak tahu.
- Bila pengumuman menyebut satu halte tertentu, scope "stop" dan isi halte itu.
- Bila pengumuman menyebut koridor atau jalur tanpa halte tertentu (misalnya "rute 4H tidak beroperasi"), scope "line" dan isi koridor itu. Bila kodenya tidak ada di jaringan, tetap pilih "line" dengan lineIds kosong; kode aslinya sudah dicatat pembaca sebelumnya.
- Bila pengumuman tidak menyebut halte, koridor, maupun jalan (misalnya layanan satu operator berhenti), scope "network".
- stationIds hanya berisi halte yang benar-benar disebut atau berdiri di jalan yang disebut. Jangan menambahkan halte lain di koridor hanya karena satu koridor.
- note ditulis dalam bahasa Indonesia, singkat, dan menyebut bukti yang kamu pakai.
- Panggil minimal satu tool sebelum menjawab, kecuali pengumuman tidak menyebut halte, koridor, maupun jalan sama sekali.
- Setiap halte yang tercatat "belum ditemukan" harus dicoba lewat find_stop dengan ejaan lain sebelum kamu menjawab. Nama resmi sering berbeda satu huruf atau satu kata dari yang ditulis pengumuman.
- Kerjakan dengan hemat: paling banyak tiga panggilan tool, dan jangan mengulang pencarian yang sama dengan ejaan yang sama. Bila nama jalan tidak ditemukan setelah satu pencarian, jangan mengulang dengan tebakan ejaan yang jauh; lanjutkan dengan bukti yang ada dan sebutkan yang belum pasti di note.`;

/**
 * Grounds one announcement against the network.
 *
 * The class is small on purpose: the agent owns the judgement, this owns the
 * validation. A tool result the model never saw cannot become a station id.
 */
export class NoticeGrounder {
  readonly #config: ModelConfig;
  readonly #env: Env;
  readonly #resolver: PlaceResolver;
  readonly #cache: NetworkCache;
  readonly #roads: RoadLookup;

  constructor(deps: {
    config: ModelConfig;
    env: Env;
    resolver: PlaceResolver;
    cache: NetworkCache;
    roads: RoadLookup;
  }) {
    this.#config = deps.config;
    this.#env = deps.env;
    this.#resolver = deps.resolver;
    this.#cache = deps.cache;
    this.#roads = deps.roads;
  }

  async ground(input: GroundingInput): Promise<GroundedScope> {
    const { network } = await this.#cache.get();
    const roadCandidates = new Map<string, RoadCandidate>();
    // The fast path's ids are offered to the reader and are citable; they
    // were produced by the resolver, not by the model.
    const seenStations = new Set<string>(input.knownStationIds ?? []);
    const stationEvidence = new Map<string, { name: string; score: number }>();
    for (const id of input.knownStationIds ?? []) {
      const station = stationById(network, id);
      // The fast path only keeps a stop whose name already agreed, so its
      // score is the best a resolver can give.
      if (station) stationEvidence.set(id, { name: station.name, score: 1 });
    }
    const seenLines = new Set<string>(input.knownLineIds ?? []);
    const agent = this.#agent(network, roadCandidates, seenStations, seenLines, stationEvidence);

    // The cheap lookups run before the reader, so it starts from evidence
    // instead of spending a turn asking for what is already known. It keeps
    // its tools: a corridor list or a second spelling is still a call away.
    const evidence = await this.#evidence(input, roadCandidates, seenStations, stationEvidence);

    const prompt = [
      "Pengumuman:",
      input.text.slice(0, 6_000),
      "",
      `Waktu publikasi: ${input.publishedAt.toISOString()} (Asia/Jakarta)`,
      "",
      "Pembacaan awal:",
      `- halte yang disebut: ${input.stationNames.join(", ") || "tidak ada"}`,
      `- kode koridor yang disebut: ${input.lineCodes.join(", ") || "tidak ada"}`,
      `- jalan yang disebut: ${input.roadNames.join(", ") || "tidak ada"}`,
      `- sistem: ${input.systemIds.join(", ") || "belum pasti"}`,
      `- halte yang sudah pasti: ${(input.knownStationIds ?? []).join(", ") || "belum ada"}`,
      `- halte yang belum ditemukan: ${(input.unresolvedStationNames ?? []).join(", ") || "tidak ada"}`,
      `- koridor yang sudah pasti: ${(input.knownLineIds ?? []).join(", ") || "belum ada"}`,
      "",
      "Bukti yang sudah dikumpulkan:",
      evidence.length > 0 ? evidence.join("\n") : "(tidak ada yang bisa dicari)",
      "",
      "Pakai bukti ini. Panggil tool lagi hanya bila perlu, misalnya untuk melihat halte satu koridor. " +
        "Salin id dari hasil tool, jangan mengarang.",
    ].join("\n");

    const started = Date.now();
    const outcome = await agent.generate({
      prompt,
      abortSignal: AbortSignal.timeout(75_000),
      trace: {
        name: "grounding-notice",
        version: GROUNDING_PROMPT_VERSION,
        ...(input.pollId ? { sessionId: input.pollId } : {}),
        tags: ["monitor", "grounding"],
        metadata: {
          externalId: input.externalId ?? null,
          stationNames: input.stationNames.length,
          roadNames: input.roadNames.length,
          attempt: input.attempt ?? 1,
        },
      },
    });

    if (process.env["DEBUG_GROUNDING"]) {
      console.error(
        `grounding: ${Date.now() - started}ms, ${outcome.messages.length} messages, usage ${JSON.stringify(outcome.usage)}`,
      );
      for (const call of outcome.providerToolCalls ?? []) {
        console.error(`  tool ${call.name} ${call.status ?? ""}`);
      }
    }

    if (outcome.type !== "response") {
      throw new Error(`Grounding did not produce a structured result (${outcome.type}).`);
    }

    const output = outcome.output;
    const allowedSystems = new Set(input.systemIds);
    const stationIds = dedupe([
      ...output.stationIds.filter((id) => seenStations.has(id)),
      ...(input.knownStationIds ?? []).filter((id) => stationById(network, id) !== null),
    ]);
    const lineIds = dedupe([
      ...output.lineIds.filter((id) => seenLines.has(id)),
      ...(input.knownLineIds ?? []).filter((id) => lineById(network, id) !== null),
    ]);

    const roads: RoadRef[] = [];
    for (const chosen of output.roads) {
      const road = roadCandidates.get(chosen.id);
      if (!road) continue;
      roads.push({
        name: road.name,
        osmType: "way",
        osmId: road.osmIds[0] ?? 0,
        latitude: road.latitude,
        longitude: road.longitude,
        stationIds: stopsOnRoad(road, network.stations, lineCodesByStation(network))
          .filter((stop) => {
            if (lineIds.length === 0) return true;
            return stop.lineCodes.some((code) => lineIds.some((id) => lineById(network, id)?.code === code));
          })
          .map((stop) => stop.stationId),
      });
    }
    const roadStationIds = new Set<string>();
    for (const road of roads) {
      for (const stationId of road.stationIds) {
        stationIds.push(stationId);
        roadStationIds.add(stationId);
      }
    }

    const uniqueStations = dedupe(
      stationIds.filter((id) => {
        const station = stationById(network, id);
        if (!station) return false;
        return allowedSystems.size === 0 || allowedSystems.has(station.systemId);
      }),
    );
    const uniqueLines = dedupe(
      lineIds.filter((id) => {
        const line = lineById(network, id);
        return line !== null && (allowedSystems.size === 0 || allowedSystems.has(line.systemId));
      }),
    );

    // A stop the reader chose has to stand on the corridor the notice is
    // about. A same-named halt in another city is a different place. When
    // the announcement names no corridor, the name has to carry the words
    // that were written: "Pemadam Kebakaran Cacing" is not "Pemadam
    // Kebakaran Cilincing", however close the resolver thinks it is.
    const named = (id: string): boolean => {
      if (roadStationIds.has(id) || input.stationNames.length === 0) return true;
      const found = stationEvidence.get(id);
      const name = found?.name ?? stationById(network, id)?.name ?? "";
      return (
        input.stationNames.some((announced) => namesAgree(announced, name)) ||
        (found?.score ?? 0) >= 0.88
      );
    };
    // A stop has to be one the announcement names, or one the street puts
    // the rider in front of. Standing on the right corridor is not enough:
    // "Pemadam Kebakaran Cacing" is on a corridor and is not the halt the
    // post meant.
    const corridorStations = uniqueStations.filter(
      (id) =>
        named(id) &&
        (uniqueLines.length === 0 || roadStationIds.has(id) || belongsToLines(network, id, uniqueLines)),
    );

    const declared = output.scope;
    const scope: NoticeScope =
      corridorStations.length > 0
        ? "stop"
        : uniqueLines.length > 0 || input.lineCodes.length > 0 || declared === "line"
          ? "line"
          : "network";

    return {
      scope,
      stationIds: corridorStations,
      lineIds: uniqueLines,
      lineCodes: dedupe([
        ...uniqueLines.map((id) => lineById(network, id)?.code ?? "").filter((code) => code.length > 0),
        ...input.lineCodes,
      ]),
      roads,
      note: output.note.trim().slice(0, 500),
      confidence: Math.max(0, Math.min(1, output.confidence)),
    };
  }

  /**
   * The lookups that are cheap enough to do before the model reads.
   *
   * A stop name and a street name are both one query away. Doing them here
   * means the reader spends its turns on judgement — is this the same AEON,
   * is this street near the corridor — rather than on asking for the data.
   */
  async #evidence(
    input: GroundingInput,
    roadCandidates: Map<string, RoadCandidate>,
    seenStations: Set<string>,
    stationEvidence: Map<string, { name: string; score: number }>,
  ): Promise<string[]> {
    const evidence: string[] = [];

    for (const name of (input.unresolvedStationNames ?? []).slice(0, 4)) {
      try {
        const candidates = await this.#resolver.resolve(name, { limit: 5 });
        for (const candidate of candidates) {
          seenStations.add(candidate.stationId);
          stationEvidence.set(candidate.stationId, {
            name: candidate.name,
            score: candidate.score,
          });
        }
        evidence.push(
          candidates.length > 0
            ? `find_stop("${name}") → ${candidates
                .map(
                  (candidate) =>
                    `${candidate.stationId} | ${candidate.name} | ${candidate.systemId} | skor ${candidate.score.toFixed(2)}`,
                )
                .join("; ")}`
            : `find_stop("${name}") → tidak ada yang cocok`,
        );
      } catch {
        evidence.push(`find_stop("${name}") → gagal`);
      }
    }

    for (const name of input.roadNames.slice(0, 2)) {
      try {
        const roads = await this.#roads.search(name, { limit: 4 });
        for (const road of roads) roadCandidates.set(road.id, road);
        evidence.push(
          roads.length > 0
            ? `find_street("${name}") → ${roads
                .map(
                  (road) =>
                    `${road.id} | ${road.name} | ${road.latitude.toFixed(4)},${road.longitude.toFixed(4)} | ${road.lengthKm.toFixed(2)} km`,
                )
                .join("; ")}`
            : `find_street("${name}") → tidak ditemukan`,
        );
      } catch {
        evidence.push(`find_street("${name}") → gagal`);
      }
    }

    return evidence;
  }

  #agent(
    network: TransitNetwork,
    roadCandidates: Map<string, RoadCandidate>,
    seenStations: Set<string>,
    seenLines: Set<string>,
    stationEvidence: Map<string, { name: string; score: number }>,
  ): Agent<GroundingOutput> {
    const observability = langfuseObservability(this.#env);
    return new Agent<GroundingOutput>({
    maxTokens: 8192,
      id: "notice-grounder",
      name: "Pemetaan Notice",
      description: "Memetakan nama halte, koridor dan jalan pada pengumuman ke jaringan sebenarnya.",
      model: createCompletionModel(this.#config, "grounder"),
      instructions: GROUNDING_INSTRUCTIONS,
      tools: [
        this.#placeTool(seenStations, stationEvidence),
        this.#corridorTool(network, seenLines),
        this.#corridorStopsTool(network, seenLines),
        this.#roadTool(roadCandidates),
        this.#roadStopsTool(network, roadCandidates),
      ],
      outputSchema: groundingSchema,
      maxTurns: 6,
      providerOptions: LOW_REASONING,
      ...(observability ? { observability } : {}),
    });
  }

  #placeTool(seen: Set<string>, evidence: Map<string, { name: string; score: number }>) {
    return createTool({
      name: "find_stop",
      description:
        "Mencari halte, stasiun, atau terminal berdasarkan nama. Kembalikan id yang boleh dipakai.",
      inputSchema: z.object({
        query: z.string().describe("The place name as written, or another spelling to try"),
        systemId: z.string().optional().describe("Limit to one system, for example transjakarta"),
      }),
      execute: async (args) => {
        const candidates = await this.#resolver.resolve(args.query, {
          limit: 8,
          ...(args.systemId ? { systemId: args.systemId } : {}),
        });
        for (const candidate of candidates) {
          seen.add(candidate.stationId);
          evidence.set(candidate.stationId, {
            name: candidate.name,
            score: candidate.score,
          });
        }
        return {
          hasil: candidates.map((candidate: PlaceCandidate) => ({
            stationId: candidate.stationId,
            name: candidate.name,
            systemId: candidate.systemId,
            street: candidate.street,
            latitude: candidate.latitude,
            longitude: candidate.longitude,
            score: Number(candidate.score.toFixed(3)),
          })),
        };
      },
    });
  }

  #corridorTool(network: TransitNetwork, seen: Set<string>) {
    return createTool({
      name: "find_line",
      description:
        "Mencari koridor, rute, atau jalur kereta berdasarkan kode atau namanya. Kembalikan id yang boleh dipakai.",
      inputSchema: z.object({
        codeOrName: z.string().describe("Line code (1, 4H, JAK.05, P11) or line name"),
      }),
      execute: async (args) => {
        const wanted = corridorKey(args.codeOrName);
        const found = network.lines
          .filter((line) => line.status === "operating")
          .filter((line) => {
            if (corridorKey(line.code) === wanted) return true;
            if (wanted.length < 4) return false;
            return corridorKey(line.name).includes(wanted) ||
              line.aliases.some((alias) => corridorKey(alias).includes(wanted));
          })
          .slice(0, 8);
        for (const line of found) seen.add(line.id);
        return {
          hasil: found.map((line) => {
            const stops = stopIdsOf(network, line.id);
            const names = stops
              .map((id) => stationById(network, id)?.name ?? "")
              .filter((name) => name.length > 0);
            return {
              lineId: line.id,
              code: line.code,
              name: line.name,
              systemId: line.systemId,
              serviceClass: line.serviceClass,
              stopCount: stops.length,
              from: names[0] ?? null,
              to: names[names.length - 1] ?? null,
            };
          }),
        };
      },
    });
  }

  #corridorStopsTool(network: TransitNetwork, seen: Set<string>) {
    return createTool({
      name: "list_line_stops",
      description:
        "Mengembalikan halte-halte satu koridor menurut urutannya. Pakai sebelum memutuskan halte mana yang terkena.",
      inputSchema: z.object({
        lineId: z.string().describe("Id koridor dari hasil find_line"),
      }),
      execute: async (args) => {
        const line = lineById(network, args.lineId);
        if (!line) return { ok: false, error: "Koridor tidak dikenal. Panggil find_line dulu." };
        seen.add(line.id);
        return {
          ok: true,
          lineId: line.id,
          code: line.code,
          name: line.name,
          stops: stopIdsOf(network, line.id)
            .map((stationId, position) => {
              const station = stationById(network, stationId);
              return station
                ? {
                    stationId: station.id,
                    name: station.name,
                    position,
                    latitude: station.latitude,
                    longitude: station.longitude,
                  }
                : null;
            })
            .filter((stop): stop is NonNullable<typeof stop> => stop !== null),
        };
      },
    });
  }

  #roadTool(roadCandidates: Map<string, RoadCandidate>) {
    return createTool({
      name: "find_street",
      description:
        "Mencari jalan di Jabodetabek berdasarkan nama. Satu nama bisa muncul di beberapa lokasi berbeda; " +
        "periksa koordinatnya terhadap koridor sebelum memilih.",
      inputSchema: z.object({
        query: z.string().describe("The street name as written, for example Jl. Pintu Air Raya"),
      }),
      execute: async (args) => {
        try {
          // A road search that hangs must not hold the whole notice. The
          // provider answers in seconds or not at all.
          const roads = await Promise.race([
            this.#roads.search(args.query, { limit: 8 }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Pencarian jalan terlalu lama.")), 20_000),
            ),
          ]);
          for (const road of roads) roadCandidates.set(road.id, road);
          return {
            ok: true,
            jalan: roads.map((road) => ({
              id: road.id,
              name: road.name,
              latitude: Number(road.latitude.toFixed(5)),
              longitude: Number(road.longitude.toFixed(5)),
              lengthKm: Number(road.lengthKm.toFixed(2)),
            })),
          };
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : "Pencarian jalan gagal.",
          };
        }
      },
    });
  }

  #roadStopsTool(network: TransitNetwork, roadCandidates: Map<string, RoadCandidate>) {
    return createTool({
      name: "list_street_stops",
      description:
        "Mengembalikan halte yang berdiri di sebuah jalan, beserta koridor yang melewatinya. " +
        "Pakai untuk memastikan jalan itu memang menyentuh koridor yang disebut.",
      inputSchema: z.object({
        streetId: z.string().describe("A street id from find_street"),
        radiusMeters: z.number().int().min(15).max(200).optional().describe("Distance tolerance in metres"),
      }),
      execute: async (args) => {
        const road = roadCandidates.get(args.streetId);
        if (!road) return { ok: false, error: "Jalan tidak dikenal. Panggil find_street dulu." };
        const stops = stopsOnRoad(
          road,
          network.stations,
          lineCodesByStation(network),
          args.radiusMeters ?? 60,
        );
        return {
          ok: true,
          jalan: {
            id: road.id,
            name: road.name,
            latitude: Number(road.latitude.toFixed(5)),
            longitude: Number(road.longitude.toFixed(5)),
          },
          halte: stops.slice(0, 40).map((stop) => ({
            stationId: stop.stationId,
            name: stop.name,
            systemId: stop.systemId,
            lineCodes: stop.lineCodes,
            meters: stop.meters,
          })),
        };
      },
    });
  }
}

export const GROUNDING_PROMPT_VERSION = "2026-10-24.1";

/**
 * Whether an announcement needs the reader with tools.
 *
 * The fast path already grounds a name the network knows exactly. A street, a
 * name that did not resolve, or a corridor code the snapshot does not carry
 * is a question only the tools can answer.
 */
export function needsGrounding(input: {
  roadNames: readonly string[];
  stationNames: readonly string[];
  unresolvedStationNames: readonly string[];
  lineCodes: readonly string[];
  resolvedLineCodes: readonly string[];
  /** A stop the fast path found stands far from the corridor it named. */
  offCorridor?: boolean;
}): boolean {
  if (input.roadNames.length > 0) return true;
  if (input.unresolvedStationNames.length > 0) return true;
  if (input.offCorridor) return true;
  const known = new Set(input.resolvedLineCodes.map(corridorKey));
  return input.lineCodes.some((code) => !known.has(corridorKey(code)));
}

/** Compare corridor codes without punctuation, so "JAK.05" and "jak 05" agree. */
export function corridorKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(koridor|rute|jalur|route|corridor)\b/g, " ")
    .replace(/[^a-z0-9]/g, "");
}

/** The station ids of a line, in order, without repeating a loop's stops. */
function stopIdsOf(network: TransitNetwork, lineId: string): string[] {
  const forward = network.lineStops
    .filter((stop) => stop.lineId === lineId && stop.direction === "forward")
    .sort((left, right) => left.position - right.position);
  const chosen = forward.length > 0
    ? forward
    : network.lineStops
        .filter((stop) => stop.lineId === lineId)
        .sort((left, right) => left.position - right.position);
  return [...new Set(chosen.map((stop) => stop.stationId))];
}

function lineCodesByStation(network: TransitNetwork): Map<string, string[]> {
  const lineById = new Map(network.lines.map((line) => [line.id, line]));
  const map = new Map<string, string[]>();
  for (const stop of network.lineStops) {
    const line = lineById.get(stop.lineId);
    if (!line) continue;
    const codes = map.get(stop.stationId) ?? [];
    if (!codes.includes(line.code)) codes.push(line.code);
    map.set(stop.stationId, codes);
  }
  return map;
}

function stationById(network: TransitNetwork, id: string): Station | null {
  return network.stations.find((station) => station.id === id) ?? null;
}

function lineById(network: TransitNetwork, id: string) {
  return network.lines.find((line) => line.id === id) ?? null;
}

/** Whether a stop is one of the line's stops, or within a walk of one. */
function belongsToLines(
  network: TransitNetwork,
  stationId: string,
  lineIds: readonly string[],
): boolean {
  const wanted = new Set(lineIds);
  const stops = network.lineStops.filter((stop) => wanted.has(stop.lineId));
  if (stops.some((stop) => stop.stationId === stationId)) return true;
  const station = stationById(network, stationId);
  if (!station) return false;
  const stopIds = new Set(stops.map((stop) => stop.stationId));
  return network.stations.some(
    (candidate) =>
      stopIds.has(candidate.id) &&
      haversineKm(
        { latitude: candidate.latitude, longitude: candidate.longitude },
        { latitude: station.latitude, longitude: station.longitude },
      ) <= 0.4,
  );
}

/**
 * Every distinctive word of the announced name is in the stop's name.
 *
 * A number is distinctive too: "Jln. Karet Pasar Baru Timur 5" is not
 * "Jln. Karet Pasar Baru Timur II", even though both names share every
 * word long enough for the resolver to weigh.
 */
function namesAgree(announced: string, station: string): boolean {
  const wanted = wordsOf(announced);
  if (wanted.length === 0) return false;
  const have = new Set(wordsOf(station));
  if (!wanted.every((word) => have.has(word))) return false;
  const wantedNumbers = numbersOf(announced);
  if (wantedNumbers.length === 0) return true;
  const stationNumbers = new Set(numbersOf(station));
  return wantedNumbers.every((number) => stationNumbers.has(number));
}

function wordsOf(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length >= 4 && !/^\d+$/.test(word));
}

function numbersOf(value: string): string[] {
  return value.toLowerCase().match(/\d+/g) ?? [];
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}
