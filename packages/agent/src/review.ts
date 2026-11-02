/**
 * The notice review agent.
 *
 * The classifier chooses the notice's horizon and the first review instant.
 * This agent only runs when that instant is due. It is deliberately separate
 * from intake: most notices are never reviewed, and a long project must not
 * pay for a model call every hour.
 *
 * It reads recent Posts and, when available, Tavily results. It cannot close
 * a notice from silence; it needs evidence. If it cannot find evidence it
 * returns `unknown`, and the notice stays visible with an unverified state.
 */

import { Agent } from "@anvia/core";
import { createTool } from "@anvia/core/tool";
import { z } from "zod";

import type { Env } from "@daily-route/env";

import { acceptedEndsAt } from "./classify.js";
import { createCompletionModel, MEDIUM_REASONING, type ModelConfig } from "./model.js";
import { TRANSIT_NEWS_DOMAINS, type NewsSearch } from "./news.js";
import { langfuseObservability } from "./tracing.js";

export const NOTICE_REVIEW_PROMPT_VERSION = "2026-10-30.1";

export const noticeReviewSchema = z.object({
  verdict: z
    .enum(["active", "ended", "unknown"])
    .describe(
      "active bila sumber masih menyebut gangguan/pekerjaan berlangsung; ended bila sumber resmi menyebut layanan kembali normal/selesai/dibuka; unknown bila tidak ada bukti yang cukup.",
    ),
  endsAt: z
    .string()
    .nullable()
    .describe("Waktu selesai yang benar-benar disebut sumber, ISO-8601. Null bila tidak ada."),
  reviewAfterHours: z
    .number()
    .nullable()
    .describe(
      "Berapa jam lagi notice ini layak dicek. Pilih berdasarkan bukti dan skala pekerjaan, bukan jenis notice. Null bila ended.",
    ),
  confidence: z.number().describe("0 sampai 1"),
  summary: z.string().describe("Satu sampai dua kalimat bahasa Indonesia tentang bukti yang ditemukan."),
  evidence: z
    .array(
      z.object({
        url: z.string(),
        quote: z.string(),
      }),
    )
    .describe("Bukti yang benar-benar dibaca; jangan mengarang URL atau kutipan."),
});

export type NoticeReviewOutput = z.infer<typeof noticeReviewSchema>;

export type NoticeReviewInput = {
  id: string;
  title: string;
  body: string;
  kind: string;
  severity: string;
  scope: string | null;
  lineCodes: string[];
  publishedAt: string;
  startsAt: string | null;
  endsAt: string | null;
  lastSeenAt: string;
  previousDuration: {
    horizon: string;
    reviewAfterHours: number | null;
    reason: string;
  } | null;
  /** Recent Posts from the operator/news corpus, newest first. */
  recentPosts: {
    text: string;
    authorHandle: string;
    publishedAt: string;
    url: string;
  }[];
  /** The source URLs known for this notice. */
  sourceUrls: string[];
  pollId?: string;
};

export type NoticeReviewResult = NoticeReviewOutput & {
  /** True only when the model gave a usable piece of evidence. */
  usable: boolean;
};

const REVIEW_INSTRUCTIONS = `Kamu memeriksa ulang satu notice transportasi Jakarta yang sudah jatuh tempo review.

Tugasmu hanya menentukan apakah kondisi yang diumumkan masih berlangsung, sudah berakhir, atau belum ada bukti. Kamu tidak mengubah rute dan tidak mengarang nama halte.

Aturan:
- Baca Post terbaru dan hasil pencarian. Dahulukan sumber resmi operator, lalu berita yang mengutip operator.
- "ended" hanya bila ada sumber yang benar-benar menyatakan layanan kembali normal, halte/stasiun dibuka, pekerjaan selesai, atau gangguan berakhir. Sertakan kutipan dan URL.
- "active" bila sumber masih menyebut gangguan/pekerjaan berlangsung, atau operator masih mengoperasikan layanan pengganti. Sertakan bukti.
- "unknown" bila tidak ada bukti yang cukup. Diam bukan bukti bahwa sudah selesai.
- Jangan menutup notice karena sudah lama. Jangan memperpanjang tanpa bukti.
- reviewAfterHours adalah kapan bukti berikutnya layak dicek, bukan TTL notice. Pilih berdasarkan skala peristiwa: insiden beberapa jam, pekerjaan beberapa hari, revitalisasi/pembangunan beberapa minggu. Jangan memakai tabel jenis notice. Bila tidak yakin, pilih review lebih cepat (misalnya 6-24 jam) dan verdict unknown.
- endsAt hanya bila sumber menyebut waktu selesai yang eksplisit. Jam operasional layanan harian bukan endsAt.
- summary singkat dalam bahasa Indonesia. evidence hanya sumber yang benar-benar kamu baca.
- Bila sumber bertentangan, pilih unknown dengan confidence rendah dan jelaskan.
- Gunakan search_news hanya bila Post terbaru belum cukup. Jangan mengulang query yang sama.
`;

export class NoticeReviewAgent {
  readonly #agent: Agent<NoticeReviewOutput>;
  readonly #news: NewsSearch | null;

  constructor(deps: {
    config: ModelConfig;
    env: Env;
    news: NewsSearch | null;
  }) {
    this.#news = deps.news;
    const observability = langfuseObservability(deps.env);
    this.#agent = new Agent<NoticeReviewOutput>({
      id: "notice-review",
      name: "Review Notice",
      description:
        "Memeriksa notice yang jatuh tempo dan memutuskan masih aktif, sudah selesai, atau belum ada bukti.",
      model: createCompletionModel(deps.config, "notice-review"),
      maxTokens: 4096,
      instructions: REVIEW_INSTRUCTIONS,
      ...(deps.news ? { tools: [this.#newsTool()] } : {}),
      outputSchema: noticeReviewSchema,
      maxTurns: 4,
      providerOptions: MEDIUM_REASONING,
      ...(observability ? { observability } : {}),
    });
  }

  async review(input: NoticeReviewInput): Promise<NoticeReviewResult> {
    const outcome = await this.#agent.generate({
      prompt: [
        "Notice yang perlu diperiksa:",
        `id: ${input.id}`,
        `judul: ${input.title}`,
        `jenis: ${input.kind}`,
        `severity: ${input.severity}`,
        `scope: ${input.scope ?? "tidak jelas"}`,
        `line codes: ${input.lineCodes.join(", ") || "tidak ada"}`,
        `dipublikasikan: ${input.publishedAt}`,
        `mulai: ${input.startsAt ?? "tidak disebut"}`,
        `akhir yang disebut: ${input.endsAt ?? "tidak ada"}`,
        `konfirmasi terakhir: ${input.lastSeenAt}`,
        `durasi sebelumnya: ${input.previousDuration ? `${input.previousDuration.horizon}; review ${input.previousDuration.reviewAfterHours ?? "tidak ada"} jam; ${input.previousDuration.reason}` : "belum ada"}`,
        "",
        "Isi notice:",
        input.body.slice(0, 2_000),
        "",
        "Sumber yang diketahui:",
        input.sourceUrls.length > 0 ? input.sourceUrls.join("\n") : "(tidak ada)",
        "",
        "Post terbaru (baru ke lama):",
        input.recentPosts.length > 0
          ? input.recentPosts
              .map(
                (post) =>
                  `- ${post.publishedAt} @${post.authorHandle} | ${post.url}\n  ${post.text.slice(0, 500)}`,
              )
              .join("\n")
          : "(tidak ada Post baru)",
        "",
        "Tentukan verdict dan review berikutnya. Jangan menutup dari kesunyian.",
      ].join("\n"),
      abortSignal: AbortSignal.timeout(90_000),
      trace: {
        name: "review-notice",
        version: NOTICE_REVIEW_PROMPT_VERSION,
        ...(input.pollId ? { sessionId: input.pollId } : {}),
        tags: ["monitor", "notice-review"],
        metadata: { noticeId: input.id, kind: input.kind },
      },
    });
    if (outcome.type !== "response") {
      throw new Error(`Notice review tidak menghasilkan output terstruktur (${outcome.type}).`);
    }
    const normalized = normalizeOutput(outcome.output);
    return {
      ...normalized,
      usable: normalized.evidence.length > 0 || normalized.verdict === "unknown",
    };
  }

  #newsTool() {
    return createTool({
      name: "search_news",
      description:
        "Mencari berita/pengumuman resmi tentang status terbaru sebuah gangguan. Gunakan domain operator bila perlu.",
      inputSchema: z.object({
        query: z.string().describe("Query spesifik, misalnya 'Halte Grogol revitalisasi selesai'"),
        timeRange: z.enum(["day", "week", "month"]).optional(),
      }),
      execute: async (args) => {
        if (!this.#news) return { ok: false, error: "Pencarian berita tidak dikonfigurasi." };
        try {
          const results = await this.#news({
            query: args.query,
            maxResults: 6,
            searchDepth: "basic",
            topic: "news",
            includeDomains: TRANSIT_NEWS_DOMAINS,
            ...(args.timeRange ? { timeRange: args.timeRange } : {}),
          });
          return {
            ok: true,
            hasil: results.map((result) => ({
              title: result.title,
              url: result.url,
              content: result.content.slice(0, 800),
              publishedAt: result.publishedAt,
            })),
          };
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : "Pencarian gagal.",
          };
        }
      },
    });
  }
}

function normalizeOutput(output: NoticeReviewOutput): NoticeReviewOutput {
  const hours =
    output.reviewAfterHours !== null && Number.isFinite(output.reviewAfterHours)
      ? Math.min(2_160, Math.max(1, Math.round(output.reviewAfterHours)))
      : null;
  const confidence = Number.isFinite(output.confidence)
    ? Math.min(1, Math.max(0, output.confidence))
    : 0;
  return {
    verdict: output.verdict,
    endsAt: acceptedEndsAt(output.endsAt),
    reviewAfterHours: output.verdict === "ended" ? null : hours,
    confidence,
    summary: output.summary.trim().slice(0, 800),
    evidence: output.evidence
      .filter((entry) => entry.url.trim().length > 0 && entry.quote.trim().length > 0)
      .slice(0, 6)
      .map((entry) => ({
        url: entry.url.trim().slice(0, 1_000),
        quote: entry.quote.trim().slice(0, 600),
      })),
  };
}
