import { Agent, type UserContentPart } from "@anvia/core";
import { z } from "zod";

import { PLACE_CONFIDENCE_THRESHOLD, type PlaceCandidate, type PlaceResolver } from "@daily-route/semantic";
import {
  haversineKm,
  normalizeText,
  tokenize,
  type Disruption,
  type NoticeScope,
  type RoadRef,
  type TransitNetwork,
} from "@daily-route/transit";

import type { NetworkCache } from "./context.js";
import { corridorKey, needsGrounding, type NoticeGrounder } from "./ground.js";
import { durationAssessmentSchema, normalizeDuration, type DurationAssessment } from "./duration.js";
import { createCompletionModel, MEDIUM_REASONING, type ModelConfig } from "./model.js";
import type { IncidentMark } from "./marks.js";
import {
  corridorCandidates,
  needsClassifier,
  type AnnouncementJudgement,
  type AnnouncementScreen,
  type BaseJudgement,
} from "./screen.js";
import { langfuseObservability } from "./tracing.js";
import type { Env } from "@daily-route/env";

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
  title: z.string().describe("Short English title, one sentence. Keep place names as written."),
  summary: z
    .string()
    .describe("English summary, one or two sentences. Keep place names and line codes as written."),
  /**
   * The event this announcement belongs to.
   *
   * A later announcement about the same event must reuse the key, which is
   * what lets the monitor refresh one row instead of adding a duplicate.
   */
  eventKey: z
    .string()
    .nullable()
    .describe(
      "Slug stabil untuk peristiwa ini, huruf kecil dan tanda hubung, sertakan tanggal peristiwa (YYYY-MM-DD) dan tempat/jalur utama. Contoh: jrf-2026-10-24, corridor-4-minangkabau-2026-10-23. Null bila pengumuman tidak menyebut peristiwa yang jelas.",
    ),
  affectedStationNames: z
    .array(z.string())
    .describe("Nama halte, stasiun, atau terminal yang disebut, persis seperti tertulis"),
  affectedLineCodes: z
    .array(z.string())
    .describe("Kode jalur atau koridor yang disebut, misalnya 1, JAK.06, NS, C, T"),
  affectedRoadNames: z
    .array(z.string())
    .describe(
      "Nama jalan yang disebut sebagai lokasi gangguan, persis seperti tertulis (misalnya Jl. Pintu Air Raya). Kosong bila pengumuman tidak menyebut jalan.",
    ),
  affectedTowards: z
    .string()
    .nullable()
    .describe(
      "Nama tempat tujuan arah layanan yang disebut, persis seperti tertulis (misalnya Kota, Blok M, Lebak Bulus). Null bila pengumuman tidak menyebut arah.",
    ),
  affectedCompass: z
    .enum(["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"])
    .nullable()
    .describe(
      "Arah mata angin yang disebut pengumuman, misalnya utara, timur laut, barat. Null bila tidak ada.",
    ),
  needsSchedule: z
    .boolean()
    .describe(
      "True bila pengumuman menyebut acara atau rekayasa lalu lintas yang direncanakan dan tidak memberi jam mulai/selesai yang jelas; jadwalnya perlu dicari di halaman resmi.",
    ),
  viaToll: z
    .boolean()
    .optional()
    .describe(
      "True bila pengumuman menyebut layanan dialihkan atau dioperasikan melalui jalan tol (misalnya 'via tol', 'melewati Tol JORR', 'lewat Tol Dalam Kota'). False bila tidak menyebut tol.",
    ),
  diversion: z
    .object({
      from: z
        .string()
        .nullable()
        .describe("Tempat kendaraan keluar dari rute biasa, persis seperti tertulis"),
      to: z
        .string()
        .nullable()
        .describe("Tempat kendaraan kembali ke rute biasa, persis seperti tertulis"),
      via: z
        .array(z.string())
        .describe("Tempat atau jalan yang disebut sepanjang jalur pengalihan, berurutan"),
      follows: z
        .array(z.string())
        .describe("Koridor atau rute lain yang diikuti, misalnya 6A, 8; kosong bila tidak ada"),
    })
    .nullable()
    .describe(
      "Jalur pengalihan bila pengumuman menyebut rute yang tetap berjalan tetapi melewati jalan/koridor lain. Null bila tidak ada pengalihan jalur; jangan mengarang geometri atau koordinat.",
    ),
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
    .describe("Sistem yang pengumuman ini berlaku"),
  confidence: z.number(),
  /**
   * The open notice this announcement refreshes, when it is an update.
   *
   * `resolvesDisruptionIds` is for closures; this is for a later report
   * about the same event, so the monitor can update one row instead of
   * creating a second one with a slightly different event key.
   */
  targetDisruptionId: z
    .string()
    .nullable()
    .describe(
      "Id kandidat notice yang diperbarui oleh pengumuman ini; null bila ini peristiwa baru atau hanya penutupan.",
    ),
  resolvesDisruptionIds: z
    .array(z.string())
    .describe("Id gangguan aktif yang ditandai sudah selesai oleh pengumuman ini; kosong bila tidak ada"),
  startsAt: z
    .string()
    .nullable()
    .optional()
    .describe(
      "Waktu mulai yang disebut teks, ISO-8601 dengan offset. Null bila teks tidak menyebut kapan efeknya mulai.",
    ),
  endsAt: z
    .string()
    .nullable()
    .describe(
      "Waktu berakhir yang disebut teks, ISO-8601 dengan offset. Null bila teks tidak menyebut kapan efeknya berhenti.",
    ),
  duration: durationAssessmentSchema
    .optional()
    .describe(
      "Perkiraan horizon peristiwa dan kapan bukti harus dicek ulang. Isi hanya bila endsAt tidak memberi akhir yang pasti; jangan memakai tabel jenis notice.",
    ),
});

export type DisruptionAnalysis = z.infer<typeof disruptionAnalysisSchema>;

export const CLASSIFIER_PROMPT_VERSION = "2026-10-30.1";

export const CLASSIFIER_INSTRUCTIONS = `Kamu membaca pengumuman resmi operator transportasi Jakarta dan menentukan apakah pengumuman itu berisi gangguan layanan.

Aturan:
- isDisruption hanya true bila gangguan itu terjadi pada Transjakarta, MRT Jakarta, LRT Jakarta, LRT Jabodebek, atau KRL Jabodetabek. Pengumuman tentang kota lain, operator lain, atau negara lain bukan gangguan di jaringan ini, walaupun akun yang sama juga menulis tentang KRL.
- Pengumuman jadwal normal, promosi, imbauan acara, atau informasi umum bukan gangguan.
- Perubahan jam yang mengurangi layanan adalah perubahan layanan: rute baru mulai pukul 10.00 padahal biasanya pagi, berhenti lebih awal, atau sejumlah perjalanan dibatalkan. Penambahan layanan (mulai lebih awal, jam diperpanjang, gratis) bukan gangguan.
- Gangguan fasilitas (listrik, eskalator, lift, lampu) yang tidak menghentikan perjalanan bukan gangguan layanan; angkutan tetap berjalan, jadi jangan membuat notice.
- kind: diversion bila rute dialihkan atau tidak melayani halte tertentu; service-change bila hanya jam operasional yang berubah (mulai lebih awal/akhir, frekuensi) dan semua halte tetap dilayani. Jangan memberi service-change pada pengumuman yang menyebut halte tidak dilayani.
- severity: info untuk keterangan ringan, warning untuk gangguan terbatas, severe untuk banyak perjalanan terganggu, critical untuk penutupan total atau pengalihan besar.
- affectedStationNames hanya berisi nama tempat yang tertulis di pengumuman, persis seperti tertulis. Jangan menambahkan halte yang tidak tertulis; sistem akan mencocokkan nama itu ke jaringan.
- affectedLineCodes berisi kode jalur yang disebut. Gunakan kode yang tertera, misalnya "1", "JAK.06", "NS", "C".
- Untuk KRL, lintas yang disebut adalah jalurnya: tulis nama lintasnya ("Bogor", "Cikarang", "Rangkasbitung", "Tangerang", "Tanjung Priok") di affectedLineCodes walaupun pengumuman tidak menulis kode hurufnya.
- affectedTowards berisi nama tempat tujuan yang disebut untuk arah layanan: "arah Kota", "menuju Blok M", "towards Lebak Bulus". Tulis nama tempatnya saja, persis seperti tertulis. Null bila pengumuman tidak menyebut arah; jangan menebak arah dari nama halte.
- needsSchedule true bila pengumuman menyebut acara atau rekayasa lalu lintas yang direncanakan (lari, rally, perayaan, penutupan terjadwal) tetapi tidak memberi jam mulai dan selesai yang jelas. False bila pengumuman sudah menyebut jamnya, atau bila ini insiden mendadak seperti kecelakaan, kebakaran, atau pohon tumbang.
- diversion diisi hanya bila pengumuman menyebut jalur pengalihan yang tetap dilayani: dari mana kendaraan keluar, ke mana kembali, tempat/jalan yang dilewati, dan koridor lain yang diikuti. Tulis nama apa adanya; jangan mengarang koordinat, geometri, atau halte yang tidak disebut. Null untuk penutupan halte biasa atau pengalihan yang tidak menyebut jalur.
- viaToll true bila pengumuman secara eksplisit menyebut layanan dialihkan/dioperasikan lewat jalan tol. Jangan menebak dari nama jalan; hanya bila teksnya menyebut tol. Halte yang disebut bersama pengalihan tol adalah halte yang dilewati (tidak dilayani), bukan berarti seluruh koridor ditutup.
- affectedCompass berisi arah mata angin yang disebut ("arah utara", "ke arah barat", "timur laut"). Isi hanya bila pengumuman menyebutnya; jangan menebak dari nama halte atau posisi. Null bila tidak ada.
- affectedRoadNames berisi nama jalan yang disebut sebagai lokasi gangguan (misalnya "Jl. Pintu Air Raya", "Jalan Syekh Nawawi Al Alam"). Jalan bukan halte: tulis namanya apa adanya, jangan menebak halte yang berdiri di sana. Kosongkan bila tidak ada jalan yang disebut.
- affectedSystemIds berisi sistem yang pengumuman itu berlaku. Jangan mencampur sistem: halte Transjakarta bukan stasiun KRL.
- targetDisruptionId diisi dengan id kandidat yang diperbarui bila pengumuman ini adalah laporan lanjutan tentang peristiwa yang sama (misalnya angka korban bertambah, jalur pengalihan diperluas, atau layanan masih ditutup). Null bila ini peristiwa baru atau hanya penutupan.
- resolvesDisruptionIds hanya boleh berisi id dari daftar kandidat notice yang diberikan. Jangan mengarang id, dan jangan menutup notice yang tidak disebut oleh pengumuman.
- startsAt adalah waktu mulai yang disebut teks. Isi dengan ISO-8601 hanya bila teks menyebut kapan efeknya mulai; jam tanpa tanggal memakai tanggal publikasi di Asia/Jakarta. Null bila teks tidak menyebut awal.
- Bila pengumuman menyebut layanan mulai beroperasi atau kembali normal pada pukul X, itu adalah akhir gangguan: isi endsAt dengan X. Jangan memakai X sebagai startsAt hanya karena kalimatnya memakai kata "mulai"; startsAt hanya untuk saat gangguan dimulai.
- endsAt adalah keluaran terstruktur untuk masa berlaku. Isi dengan waktu absolut ISO-8601 hanya bila teks sendiri menyebut kapan efeknya berhenti: rentang jam, "hingga pukul", atau rentang tanggal. Jam tanpa tanggal dihitung pada tanggal publikasi di zona Asia/Jakarta, dan tanggal terakhir ikut termasuk sampai akhir hari itu. Null bila teks hanya menyebut awal, "sampai pemberitahuan selanjutnya", atau tidak menyebut akhir. Jangan mengira-ngira durasi.
- Jam operasional layanan bukan endsAt. "Shuttle beroperasi pukul 05:00-22:00" berarti jendela layanan harian, bukan peristiwa berakhir pukul 22:00. endsAt hanya untuk akhir gangguan/pekerjaan.
- duration adalah penilaian horizon, bukan tabel jenis. Bila endsAt tidak memberi akhir yang pasti, pikirkan apakah ini insiden beberapa jam, pekerjaan beberapa hari, atau revitalisasi/pembangunan berminggu-minggu/bulan. reviewAfterHours adalah kapan bukti berikutnya layak dicek, bukan kapan notice otomatis ditutup. Insiden tanpa jadwal biasanya beberapa jam; pekerjaan terjadwal beberapa hari; revitalisasi/pembangunan bisa 24 jam sampai 30 hari tergantung bukti. Jangan memakai kata kunci secara mekanis dan jangan mengarang tanggal; bila tidak yakin, pilih horizon unknown dan review lebih cepat. Bila endsAt sudah pasti, reviewAfterHours null.
- eventKey adalah slug stabil untuk peristiwa, bukan untuk pengumuman. Dua pengumuman tentang peristiwa yang sama harus memakai key yang sama; pengumuman lanjutan harus memakai key notice kandidat yang sudah ada. Sertakan tanggal peristiwa, bukan jam publikasi. Null bila peristiwanya tidak jelas.
- title dan summary ditulis dalam bahasa Inggris, satu sampai dua kalimat. Nama tempat dan kode jalur tetap seperti tertulis di pengumuman. Jangan menerjemahkan nama halte atau stasiun.
`;

/**
 * The end instant the classifier named, or null when it named none.
 *
 * An unreadable value is dropped. The announcement text is not parsed here.
 */
/**
 * The end instant the classifier named, or null when it named none.
 *
 * An offsetless local time is Jakarta time, not the server's timezone; a
 * date alone means the end of that Jakarta day. Getting this wrong moves a
 * closure by seven hours and can keep a notice on the board after it ended.
 */
export function acceptedEndsAt(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const local = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/.test(text);
  const hasOffset = /(Z|[+-]\d{2}:\d{2})$/.test(text);
  if (!dateOnly && !local && !hasOffset) return null;

  const iso = dateOnly
    ? `${text}T23:59:59.999+07:00`
    : local
      ? `${text}+07:00`
      : text;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function acceptedStartsAt(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const local = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/.test(text);
  const hasOffset = /(Z|[+-]\d{2}:\d{2})$/.test(text);
  if (!dateOnly && !local && !hasOffset) return null;
  const iso = dateOnly
    ? `${text}T00:00:00+07:00`
    : local
      ? `${text}+07:00`
      : text;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export const noticeEndSchema = z.object({
  endsAt: z
    .string()
    .nullable()
    .describe(
      "Waktu berakhir yang disebut teks, ISO-8601 dengan offset. Null bila teks tidak menyebut kapan efeknya berhenti.",
    ),
});

export const NOTICE_END_INSTRUCTIONS = `Kamu membaca satu pemberitahuan yang sudah tersimpan dan mengisi kapan efeknya berhenti.

Aturan:
- endsAt hanya terisi bila teks sendiri menyebut akhir: rentang jam, "hingga pukul", atau rentang tanggal.
- Jam tanpa tanggal dihitung pada tanggal publikasi di zona Asia/Jakarta.
- Tanggal terakhir dalam rentang ikut berlaku sampai pukul 24.00 zona itu.
- Null bila teks hanya menyebut awal, berlaku sampai pemberitahuan lain, atau tidak menyebut akhir.
- Jangan mengira-ngira durasi. Jangan mengubah isi pemberitahuan.
`;

/** Reads the end instant of a notice that was stored before `endsAt` existed. */
export function createNoticeEndAgent(config: ModelConfig, env: Env): Agent<{ endsAt: string | null }> {
  const observability = langfuseObservability(env);
  return new Agent<{ endsAt: string | null }>({
    id: "notice-end",
    name: "Akhir pemberitahuan",
    description: "Membaca kapan efek sebuah pemberitahuan berhenti, bila teksnya menyebut akhir.",
    model: createCompletionModel(config, "classifier"),
    maxTokens: 8192,
    instructions: NOTICE_END_INSTRUCTIONS,
    outputSchema: noticeEndSchema,
    maxTurns: 1,
    providerOptions: MEDIUM_REASONING,
    ...(observability ? { observability } : {}),
  });
}

export function createClassifierAgent(
  config: ModelConfig,
  env: Env,
): Agent<DisruptionAnalysis> {
  const observability = langfuseObservability(env);
  return new Agent<DisruptionAnalysis>({
    id: "disruption-classifier",
    name: "Klasifikasi Gangguan",
    description: "Membaca pengumuman operator dan mengubahnya menjadi catatan gangguan terstruktur.",
    model: createCompletionModel(config, "classifier"),
    maxTokens: 8192,
    instructions: CLASSIFIER_INSTRUCTIONS,
    outputSchema: disruptionAnalysisSchema,
    maxTurns: 2,
    providerOptions: MEDIUM_REASONING,
    ...(observability ? { observability } : {}),
  });
}

export type ClassifyInput = {
  text: string;
  url: string | null;
  /** Images attached to a Post, read by the classifier when present. */
  images?: readonly NoticeImage[] | undefined;
  publishedAt: Date;
  source: string;
  sourceType: "social" | "news" | "official";
  /** Which operator published it, when known. */
  systemHint: string | null;
  /** The id of the post or article, used for deduplication. */
  externalId: string;
  /**
   * The open notices that could possibly be affected.
   *
   * The monitor narrows the board to a handful with a deterministic match
   * on line, station and title tokens. The model may only resolve ids from
   * this list; it never sees an unbounded UUID dump.
   */
  candidates?: readonly NoticeCandidate[];
  /** Groups every item read by one poll into a Langfuse session. */
  pollId?: string;
  /** `queue` for the normal path, `sweep` for a follow-up check. */
  route?: "queue" | "sweep";
  /** Which attempt this is, for the trace. */
  attempt?: number;
};

/** One image attached to a Post. */
export type NoticeImage = {
  url: string;
  altText?: string;
};

/** One open notice, reduced to what the classifier needs to compare. */
export type NoticeCandidate = {
  id: string;
  title: string;
  eventKey: string | null;
  systemId: string | null;
  lineCodes: string[];
  stationNames: string[];
  publishedAt: string;
  endsAt: string | null;
  kind: string;
  severity: string;
};

export type ClassifyResult = {
  analysis: DisruptionAnalysis;
  /** The grounded station ids the analysis refers to. */
  stationIds: string[];
  /** The grounded line ids the analysis refers to. */
  lineIds: string[];
  /** The active disruptions this announcement closes. */
  resolvesDisruptionIds: string[];
  /** The candidate this announcement refreshes, when it is an update. */
  targetDisruptionId: string | null;
  /** The normalised event key, when the announcement named an event. */
  eventKey: string | null;
  /** The start instant the announcement named, or null. */
  startsAt: string | null;
  /** The end instant the announcement named, or null. */
  endsAt: string | null;
  /** The model's horizon and next-evidence assessment, when it gave one. */
  duration?: DurationAssessment | null;
  /** The case icon Jev chose, when it was confident. */
  mark: IncidentMark | null;
  /** What the notice is about: a stop, a corridor/line, or the operator. */
  scope: NoticeScope;
  /** The line codes the board may print, including codes the graph lacks. */
  lineCodes: string[];
  /** The streets the announcement named, grounded against OpenStreetMap. */
  roads: RoadRef[];
  /** The diversion path the announcement described, before geometry. */
  diversion: DisruptionAnalysis["diversion"];
};

/**
 * Classifies one announcement and grounds the places it names.
 *
 * Grounding is the reason this is not a pure prompt: the model may only
 * *name* places, and the resolver decides which real station each name
 * refers to.
 */
/**
 * The classifier input. An image is sent as an image part, not as a URL in
 * the prose: the model must be able to read the announcement inside it.
 */
export function classificationPrompt(
  input: ClassifyInput,
  candidates: readonly NoticeCandidate[],
  judgement: AnnouncementJudgement | null,
): string | { role: "user"; content: readonly UserContentPart[] } {
  const text = [
    "Pengumuman berikut berasal dari akun resmi operator transportasi Jakarta.",
    "",
    `Sumber: ${input.source}`,
    input.systemHint ? `Sistem: ${input.systemHint}` : "",
    `Waktu publikasi: ${input.publishedAt.toISOString()}`,
    input.url ? `Tautan: ${input.url}` : "",
    "",
    "Isi pengumuman:",
    input.text,
    input.images?.length
      ? "Pengumuman ini juga berisi gambar. Baca teks dan informasi di dalam gambar; caption bisa kosong."
      : "",
    "",
    "Kandidat notice aktif yang mungkin berkaitan (id | judul | kode jalur | halte | eventKey | waktu):",
    candidates.length > 0
      ? candidates.map((candidate) => candidateLine(candidate)).join("\n")
      : "(tidak ada)",
    "Hanya id dari daftar kandidat di atas yang boleh masuk resolvesDisruptionIds. Bila pengumuman ini adalah lanjutan dari salah satu kandidat, pakai eventKey kandidat itu.",
    judgement ? judgementNote(judgement) : "",
  ]
    .filter((part) => part !== "")
    .join("\n");

  if (!input.images?.length) return text;
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

export class DisruptionClassifier {
  readonly #agent: Agent<DisruptionAnalysis>;
  readonly #resolver: PlaceResolver;
  readonly #cache: NetworkCache;
  readonly #screen: AnnouncementScreen | null;
  /**
   * The reader with tools.
   *
   * Only called when the announcement asks a question the fast path cannot
   * answer: it names a street, a stop the graph does not have, or a corridor
   * code the snapshot does not carry.
   */
  readonly #grounder: NoticeGrounder | null;

  constructor(
    agent: Agent<DisruptionAnalysis>,
    resolver: PlaceResolver,
    cache: NetworkCache,
    screen: AnnouncementScreen | null = null,
    grounder: NoticeGrounder | null = null,
  ) {
    this.#agent = agent;
    this.#resolver = resolver;
    this.#cache = cache;
    this.#screen = screen;
    this.#grounder = grounder;
  }

  async classify(input: ClassifyInput): Promise<ClassifyResult> {
    const { network } = await this.#cache.get();
    const corridors = corridorCandidates(input.text, network.lines);
    // The fast screen is text-only. When a Post carries an image, the
    // classifier must see it before deciding that the announcement is quiet.
    const hasImages = (input.images?.length ?? 0) > 0;
    const judgement = hasImages ? null : await this.#judge(input, corridors);
    if (!hasImages && judgement && !needsClassifier(judgement)) {
      return {
        analysis: quietAnalysis(judgement),
        stationIds: [],
        lineIds: [],
        resolvesDisruptionIds: [],
        targetDisruptionId: null,
        eventKey: null,
        startsAt: null,
        endsAt: null,
        duration: null,
        mark: judgement.mark,
        scope: "network",
        lineCodes: [],
        roads: [],
        diversion: null,
      };
    }

    const candidates = input.candidates ?? [];
    const prompt = classificationPrompt(input, candidates, judgement);
    const outcome = await this.#agent.generate({
      prompt,
      abortSignal: AbortSignal.timeout(120_000),
      trace: {
        name: "klasifikasi-gangguan",
        version: CLASSIFIER_PROMPT_VERSION,
        ...(input.pollId ? { sessionId: input.pollId } : {}),
        tags: ["monitor", input.sourceType, input.route ?? "queue"],
        metadata: {
          source: input.source,
          externalId: input.externalId,
          candidates: candidates.length,
          systemHint: input.systemHint,
          attempt: input.attempt ?? 1,
          route: input.route ?? "queue",
        },
      },
    });

    if (outcome.type !== "response") {
      throw new Error(
        `Classification did not produce a structured result (outcome: ${outcome.type})`,
      );
    }

    const analysis = normalizeAnalysis(withSystem(outcome.output, judgement));
    const allowedSystems: ReadonlySet<string> = new Set(analysis.affectedSystemIds);

    const stationGrounding = await this.#groundStationNames(analysis, allowedSystems);
    const lineGrounding = this.#groundLineCodes(analysis, judgement, allowedSystems, network);

    let stationIds = stationGrounding.stationIds;
    let lineIds = lineGrounding.lineIds;
    let lineCodes = mergeCodes(lineGrounding.lineCodes, analysis.affectedLineCodes);
    let roads: RoadRef[] = [];
    let scope: NoticeScope =
      stationIds.length > 0
        ? "stop"
        : lineIds.length > 0 || lineCodes.length > 0
          ? "line"
          : "network";

    /**
     * The reader with tools takes over when the fast path ran out of
     * answers. It may add stops, find the street the announcement means,
     * or discover that the named corridor is not this network's.
     */
    const offCorridor =
      stationIds.length > 0 &&
      lineIds.length > 0 &&
      !stationIds.some((id) => stationFitsLines(network, id, lineIds));

    if (
      this.#grounder &&
      needsGrounding({
        roadNames: analysis.affectedRoadNames,
        stationNames: analysis.affectedStationNames,
        unresolvedStationNames: stationGrounding.unresolved,
        lineCodes: analysis.affectedLineCodes,
        resolvedLineCodes: lineGrounding.lineCodes,
        offCorridor,
      })
    ) {
      if (process.env["DEBUG_GROUNDING"]) {
        console.error(
          `escalating: roads=${analysis.affectedRoadNames.join("|")} unresolved=${stationGrounding.unresolved.join("|")} offCorridor=${offCorridor}`,
        );
      }
      try {
        const grounded = await this.#grounder.ground({
          text: input.text,
          publishedAt: input.publishedAt,
          stationNames: analysis.affectedStationNames,
          unresolvedStationNames: stationGrounding.unresolved,
          lineCodes: analysis.affectedLineCodes,
          roadNames: analysis.affectedRoadNames,
          systemIds: analysis.affectedSystemIds,
          knownStationIds: stationIds,
          knownLineIds: lineIds,
          ...(input.pollId ? { pollId: input.pollId } : {}),
          externalId: input.externalId,
          attempt: input.attempt ?? 1,
        });
        stationIds = grounded.stationIds;
        lineIds = grounded.lineIds;
        lineCodes = mergeCodes(lineCodes, grounded.lineCodes);
        roads = grounded.roads;
        scope = grounded.scope;
        if (process.env["DEBUG_GROUNDING"]) {
          console.error(
            `grounded: scope=${grounded.scope} stations=${grounded.stationIds.length} lines=${grounded.lineIds.join("|")} roads=${grounded.roads.map((road) => road.name).join("|")} ${grounded.note.slice(0, 160)}`,
          );
        }
        // The reader with tools may keep a halt the fast path found, but it
        // may not leave one standing a city away from the corridor.
        stationIds = stationIds.filter((id) => stationFitsLines(network, id, lineIds));
      } catch (error) {
        // A grounder that cannot answer leaves the fast path in place. The
        // notice is still true; it is only less precise about where.
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`grounding tidak menjawab, memakai jalur cepat: ${message}`);
      }
    }

    const allowedCandidateIds = new Set(candidates.map((candidate) => candidate.id));
    const resolvesDisruptionIds = analysis.resolvesDisruptionIds.filter((id) =>
      allowedCandidateIds.has(id),
    );
    const proposed = candidates.find(
      (candidate) => candidate.id === analysis.targetDisruptionId,
    );
    const target =
      proposed &&
      !resolvesDisruptionIds.includes(proposed.id) &&
      plausibleTarget(proposed, input.text, lineIds, network)
        ? proposed
        : null;
    const targetEventKey = target?.eventKey ?? null;
    const modelEventKey = normalizeEventKey(analysis.eventKey);
    const candidateKeys = new Set(
      candidates
        .map((candidate) => candidate.eventKey)
        .filter((key): key is string => typeof key === "string" && key.length > 0),
    );
    // Reusing a candidate's key is only safe when that candidate was chosen
    // as the target. Otherwise a model that guessed an event can merge two
    // unrelated notices.
    const eventKey =
      targetEventKey ??
      (modelEventKey && !candidateKeys.has(modelEventKey) ? modelEventKey : null);

    return {
      analysis,
      stationIds: [...new Set(stationIds)],
      lineIds: [...new Set(lineIds)],
      resolvesDisruptionIds: [...new Set(resolvesDisruptionIds)],
      targetDisruptionId: target?.id ?? null,
      eventKey,
      startsAt: acceptedStartsAt(analysis.startsAt),
      endsAt: acceptedEndsAt(analysis.endsAt),
      duration: normalizeDuration(analysis.duration),
      mark: judgement?.mark ?? null,
      scope,
      lineCodes,
      roads,
      diversion: analysis.diversion ?? null,
    };
  }

  /**
   * The fast path: resolve the stop names the classifier read.
   *
   * It is a lookup, not a decision. A name that no station carries is
   * reported back so the reader with tools can try harder.
   */
  async #groundStationNames(
    analysis: DisruptionAnalysis,
    allowedSystems: ReadonlySet<string>,
  ): Promise<{ stationIds: string[]; unresolved: string[] }> {
    const stationIds: string[] = [];
    const unresolved: string[] = [];
    for (const name of analysis.affectedStationNames) {
      const systems = [...allowedSystems];
      const resolved: PlaceCandidate[] = [];
      if (systems.length === 0) {
        resolved.push(...(await this.#resolver.resolve(name, { limit: 8 })));
      } else {
        for (const systemId of systems) {
          resolved.push(...(await this.#resolver.resolve(name, { limit: 6, systemId })));
        }
      }
      const best = resolved.find(
        (candidate) =>
          (allowedSystems.size === 0 || allowedSystems.has(candidate.systemId)) &&
          candidate.score >= PLACE_CONFIDENCE_THRESHOLD &&
          placeNameAgrees(name, candidate),
      );
      if (best) stationIds.push(best.stationId);
      else unresolved.push(name);
    }
    return { stationIds, unresolved };
  }

  /** The fast path for the corridor codes the classifier read. */
  #groundLineCodes(
    analysis: DisruptionAnalysis,
    judgement: AnnouncementJudgement | null,
    allowedSystems: ReadonlySet<string>,
    network: TransitNetwork,
  ): { lineIds: string[]; lineCodes: string[] } {
    const lineIds: string[] = [];
    const lineCodes: string[] = [];
    for (const code of analysis.affectedLineCodes) {
      const wanted = codeKey(code);
      if (wanted.length === 0) continue;
      const line = network.lines.find(
        (candidate) =>
          (allowedSystems.size === 0 || allowedSystems.has(candidate.systemId)) &&
          (codeKey(candidate.code) === wanted ||
            (wanted.length >= 5 &&
              [candidate.name, ...candidate.aliases].some((name) =>
                codeKey(name).includes(wanted),
              ))),
      );
      if (line) {
        lineIds.push(line.id);
        lineCodes.push(line.code);
      }
    }
    for (const lineId of judgement?.lineIds ?? []) {
      const line = network.lines.find((candidate) => candidate.id === lineId);
      if (line && (allowedSystems.size === 0 || allowedSystems.has(line.systemId))) {
        lineIds.push(lineId);
        lineCodes.push(line.code);
      }
    }
    return { lineIds, lineCodes };
  }

  async #judge(
    input: ClassifyInput,
    corridors: readonly { id: string; code: string; name: string }[],
  ): Promise<AnnouncementJudgement | null> {
    if (!this.#screen) return null;
    let base;
    try {
      base = await this.#screen.screen({
        text: input.text,
        systemHint: input.systemHint,
        publishedAt: input.publishedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`jev tidak menjawab, model percakapan yang menilai: ${message}`);
      return null;
    }

    if (!needsClassifier(base)) {
      return { ...base, lineIds: [], mark: null };
    }

    try {
      const extra = await this.#screen.enrich({
        text: input.text,
        systemHint: input.systemHint,
        publishedAt: input.publishedAt,
        corridors: corridors.map((line) => ({
          id: line.id,
          label: `${line.code} ${line.name}`.slice(0, 80),
        })),
      });
      return { ...base, ...extra };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`jev tidak melengkapi penilaian, model percakapan yang membaca: ${message}`);
      return { ...base, lineIds: [], mark: null };
    }
  }
}

function quietAnalysis(judgement: BaseJudgement): DisruptionAnalysis {
  return {
    isDisruption: false,
    kind: "unknown",
    severity: "info",
    title: "",
    summary: "",
    eventKey: null,
    affectedStationNames: [],
    affectedLineCodes: [],
    affectedRoadNames: [],
    affectedTowards: null,
    affectedCompass: null,
    needsSchedule: false,
    viaToll: false,
    diversion: null,
    affectedSystemIds: judgement.systemId ? [judgement.systemId] : [],
    confidence: 1 - judgement.disruptionProbability,
    targetDisruptionId: null,
    resolvesDisruptionIds: [],
    startsAt: null,
    endsAt: null,
  };
}

/**
 * Whether a candidate is plausibly the same event as this announcement.
 *
 * The model may pick an id only from the offered list, but a short list is
 * not a guarantee of relevance. A candidate that names a line or a stop
 * has to match one in the text; an event-wide candidate has to share
 * enough title vocabulary. This is the difference between refreshing a
 * notice and overwriting it with a different incident.
 */
function plausibleTarget(
  target: NoticeCandidate,
  text: string,
  groundedLineIds: readonly string[],
  network: TransitNetwork,
): boolean {
  const normalized = normalizeText(text);
  const lineCodes = new Set(
    groundedLineIds
      .map((id) => network.lines.find((line) => line.id === id)?.code)
      .filter((code): code is string => typeof code === "string")
      .map((code) => codeKey(code)),
  );
  const lineMatch = target.lineCodes.some((code) => lineCodes.has(codeKey(code)));
  const stationMatch = target.stationNames.some((name) =>
    containsNormalizedName(normalized, name),
  );
  const shared = sharedTokens(target.title, text);

  if (target.lineCodes.length > 0 || target.stationNames.length > 0) {
    if (lineMatch || stationMatch) return true;
    return shared >= 4;
  }
  return shared >= 3;
}

function containsNormalizedName(text: string, name: string): boolean {
  const normalized = normalizeText(name);
  if (normalized.length >= 4 && text.includes(normalized)) return true;
  const tokens = tokenize(name).filter((token) => token.length >= 4);
  return tokens.length > 0 && tokens.every((token) => text.includes(token));
}

function sharedTokens(left: string, right: string): number {
  const rightTokens = new Set(
    tokenize(right).filter((token) => token.length >= 4),
  );
  let shared = 0;
  for (const token of new Set(tokenize(left))) {
    if (token.length >= 4 && rightTokens.has(token)) shared += 1;
  }
  return shared;
}

/** Compare line codes without punctuation, so "JAK.06" and "JAK06" agree. */
function codeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** A candidate as one readable line, with the ids the model may cite. */
function candidateLine(candidate: NoticeCandidate): string {
  const lines = candidate.lineCodes.length > 0 ? candidate.lineCodes.join(", ") : "-";
  const stops = candidate.stationNames.length > 0 ? candidate.stationNames.join(", ") : "-";
  const when = candidate.publishedAt.slice(0, 16).replace("T", " ");
  return `- ${candidate.id} | ${candidate.title.slice(0, 140)} | ${lines} | ${stops} | ${candidate.eventKey ?? "-"} | ${when}`;
}

/** A key that is safe to compare across announcements. */
export function normalizeEventKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug.length >= 3 ? slug : null;
}

/**
 * Whether a stop belongs to the corridor the notice names.
 *
 * A stop with the same name exists in several places. "AEON Mall" in East
 * Jakarta is not a stop of a Bogor corridor, and keeping it would send a
 * rider across the city. A stop that stands beside one of the line's stops
 * counts too: a landmark next to the corridor is still a place the rider
 * walks from.
 */
function stationFitsLines(
  network: TransitNetwork,
  stationId: string,
  lineIds: readonly string[],
): boolean {
  if (lineIds.length === 0) return true;
  const station = network.stations.find((entry) => entry.id === stationId);
  if (!station) return false;
  const wanted = new Set(lineIds);
  const stops = network.lineStops.filter((stop) => wanted.has(stop.lineId));
  if (stops.some((stop) => stop.stationId === stationId)) return true;
  const stopIds = new Set(stops.map((stop) => stop.stationId));
  return network.stations.some(
    (candidate) =>
      stopIds.has(candidate.id) && haversineKm(candidate, station) <= 0.4,
  );
}

/**
 * Union of two code lists.
 *
 * Two codes that differ only in punctuation are the same corridor. The first
 * list wins, and the caller puts the grounded spelling ("JAK.05") first
 * because it is the operator's own.
 */
function mergeCodes(left: readonly string[], right: readonly string[]): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const code of [...left, ...right]) {
    const trimmed = code.trim();
    if (trimmed.length === 0) continue;
    const key = corridorKey(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(trimmed);
  }
  return merged;
}

function withSystem(analysis: DisruptionAnalysis, judgement: AnnouncementJudgement | null): DisruptionAnalysis {
  if (!judgement?.systemId || analysis.affectedSystemIds.length > 0) return analysis;
  return { ...analysis, affectedSystemIds: [judgement.systemId] };
}

/**
 * Keep the model-shaped boundary tidy.
 *
 * The provider-facing schema is deliberately shape-only (strict JSON schema
 * rejects `minimum`, `maxItems` and friends), so the bounds live here.
 */
function normalizeAnalysis(analysis: DisruptionAnalysis): DisruptionAnalysis {
  return {
    ...analysis,
    title: analysis.title.trim().slice(0, 200),
    summary: analysis.summary.trim().slice(0, 1_000),
    confidence: Math.min(1, Math.max(0, analysis.confidence)),
    affectedStationNames: analysis.affectedStationNames
      .slice(0, 12)
      .map((name) => name.trim().slice(0, 120))
      .filter((name) => name.length > 0),
    affectedLineCodes: analysis.affectedLineCodes
      .slice(0, 12)
      .map((code) => code.trim().slice(0, 16))
      .filter((code) => code.length > 0),
    affectedRoadNames: (analysis.affectedRoadNames ?? [])
      .slice(0, 6)
      .map((name) => name.trim().slice(0, 120))
      .filter((name) => name.length > 0),
    affectedSystemIds: analysis.affectedSystemIds.slice(0, 3),
    resolvesDisruptionIds: analysis.resolvesDisruptionIds.slice(0, 20),
  };
}

function judgementNote(judgement: AnnouncementJudgement): string {
  const lines = judgement.lineIds.length > 0 ? judgement.lineIds.join(", ") : "tidak ada";
  return [
    "",
    "Penilaian Jev, hanya sebagai petunjuk. Halte dan koridor hanya yang tertulis:",
    `- peluang gangguan ${judgement.disruptionProbability.toFixed(2)}`,
    `- peluang layanan sudah normal ${judgement.restoredProbability.toFixed(2)}`,
    `- sistem ${judgement.systemId ?? "belum yakin"}`,
    `- koridor yang teksnya cocok dan dinilai terdampak: ${lines}`,
  ].join("\n");
}

/**
 * A grounded stop has to carry every distinctive word of the announced name.
 *
 * "Stasiun Surabaya Gubeng" is not the halte named Surabaya, and "Cirebon"
 * is not Stasiun Cikini. Shared characters are not enough.
 */
function placeNameAgrees(query: string, candidate: PlaceCandidate): boolean {
  const queryTokens = tokenize(query).filter((token) => token.length >= 4);
  if (queryTokens.length === 0) return false;
  const names = [candidate.name, ...candidate.aliases];
  const allowed = (name: string): boolean => {
    const tokens = new Set(tokenize(name));
    if (!queryTokens.every((token) => tokens.has(token))) return false;
    // A number is part of the name. "Karet Pasar Baru Timur 5" is not
    // "Karet Pasar Baru Timur II": the two are different addresses.
    const wantedNumbers = numbersIn(query);
    if (wantedNumbers.length === 0) return true;
    const have = new Set(numbersIn(name));
    return wantedNumbers.every((number) => have.has(number));
  };
  return names.some(allowed);
}

function numbersIn(value: string): string[] {
  return value.toLowerCase().match(/\d+/g) ?? [];
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
    eventKey: input.result.eventKey,
    endsAt: input.result.endsAt,
    lastSeenAt: new Date().toISOString(),
    affectedStationIds: input.result.stationIds,
    affectedLineIds: input.result.lineIds,
    scope: input.result.scope,
    lineCodes: input.result.lineCodes,
    roads: input.result.roads,
  };
}
