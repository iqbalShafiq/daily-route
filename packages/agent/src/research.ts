import { Agent } from "@anvia/core";
import { z } from "zod";

import type { Env } from "@daily-route/env";

import { createCompletionModel, MEDIUM_REASONING, type ModelConfig } from "./model.js";
import type { NewsSearch } from "./news.js";
import { langfuseObservability } from "./tracing.js";

/**
 * The schedule researcher.
 *
 * An operator's Post often says what is diverted but not for how long: "due
 * to Jakarta Running Festival 2026" with no hours. This reader goes to the
 * event's or the operator's page and returns the window, with the sentence
 * that supports it. It does not parse the Post and it does not guess a time.
 */
export const noticeResearchSchema = z.object({
  event: z.string().nullable().describe("The event or arrangement the announcement names"),
  startsAt: z
    .string()
    .nullable()
    .describe("ISO-8601 with +07:00 offset, or null when the source gives no start"),
  endsAt: z
    .string()
    .nullable()
    .describe("ISO-8601 with +07:00 offset, or null when the source gives no end"),
  location: z.string().nullable().describe("The road, area or route the window covers"),
  quote: z.string().nullable().describe("The sentence that states the date and time"),
  sourceUrl: z.string().nullable().describe("The page where the quote was read"),
  confidence: z.number().describe("0 to 1, based on evidence"),
});

export type NoticeResearch = z.infer<typeof noticeResearchSchema>;

/** The window plus the search hit it came from, for the notice modal. */
export type NoticeResearchReport = NoticeResearch & {
  sourceTitle?: string;
  excerpt?: string;
};

export type NoticeResearchInput = {
  title: string;
  body: string;
  lineCodes: string[];
  stationNames: string[];
  publishedAt: Date;
  sourceUrls: string[];
};

const INSTRUCTIONS = `You are a schedule researcher for a Jakarta transit desk. An operator's announcement names a planned event or traffic arrangement but may give no hours. Find the schedule that governs the announcement and return the window with evidence.

Rules:
1. Search for the event and for the operator's traffic engineering. Open at least one page; a search snippet is not evidence.
2. A running event, a rally or a maintenance window has a start and an end. The event's official road-closure page or the operator's notice is the source of truth.
3. If the announcement is incidental (an accident, a fire, a fallen tree) and no published schedule exists, return nulls and confidence 0. Never invent an end.
4. Times are Asia/Jakarta. Return ISO-8601 with +07:00, e.g. 2026-10-25T02:30:00+07:00.
5. The quote must contain the date or the time that supports the window. The route need not be in the same sentence when the event-level window covers the area; put the road or area in location.
6. Prefer the operator or the event's official page over news, and news over social posts.
7. If two sources disagree, return the window from the more authoritative one and lower the confidence; never average times.`;

/**
 * The reader that turns search snippets into one evidence-backed window.
 *
 * It has no tools on purpose: the search is done in front of it, so the
 * model cannot loop on tool calls and run out of turns.
 */
export function createResearchReader(config: ModelConfig, env: Env): Agent<NoticeResearch> {
  const observability = langfuseObservability(env);
  return new Agent<NoticeResearch>({
    id: "notice-schedule-reader",
    name: "Pembaca Jadwal Notice",
    description: "Membaca hasil pencarian dan menulis jadwal yang didukung kutipan.",
    model: createCompletionModel(config, "research"),
    instructions: `${INSTRUCTIONS}\n\nYou do not have tools. The search results are given below; read them and answer. If no result states a time, return nulls and confidence 0.`,
    outputSchema: noticeResearchSchema,
    maxTurns: 1,
    maxTokens: 8192,
    providerOptions: MEDIUM_REASONING,
    ...(observability ? { observability } : {}),
  });
}

/**
 * Plan queries, search, then read the snippets into a window.
 *
 * The planner writes the queries (the event name is often not the notice's
 * title); the search is a plain Tavily call; the reader only sees what the
 * search returned. This is the reliable shape for a low-credit worker: no
 * open-ended tool loop, and every claim has a URL.
 */
export async function researchNotice(
  input: NoticeResearchInput,
  deps: {
    search: NewsSearch;
    planner: Agent<{ queries: string[] }>;
    reader: Agent<NoticeResearch>;
  },
): Promise<NoticeResearchReport | null> {
  const publishedLabel = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    dateStyle: "long",
  }).format(input.publishedAt);
  let queries: string[] = [];
  try {
    const planned = await deps.planner.generate({
      prompt: [
        `Judul: ${input.title}`,
        `Isi: ${input.body.slice(0, 1_000)}`,
        `Tanggal publikasi: ${publishedLabel}`,
        "Tulis tiga query pencarian bahasa Indonesia yang berbeda untuk menemukan jadwal acara dan penutupan jalannya.",
      ].join("\n"),
      abortSignal: AbortSignal.timeout(45_000),
    });
    if (planned.type === "response") queries = planned.output.queries;
  } catch {
    queries = [];
  }
  if (queries.length === 0) {
    queries = [`${input.title} jadwal`, `${input.title} penutupan jalan ${publishedLabel}`];
  }

  const seen = new Set<string>();
  const results: { title: string; content: string; url: string }[] = [];
  for (const query of queries.slice(0, 3)) {
    try {
      const hits = await deps.search({
        query,
        maxResults: 8,
        timeRange: "week",
        topic: "news",
        searchDepth: "advanced",
      });
      for (const hit of hits) {
        if (seen.has(hit.url)) continue;
        seen.add(hit.url);
        results.push({ title: hit.title, content: hit.content.slice(0, 900), url: hit.url });
      }
    } catch {
      // One failed query does not stop the other two.
    }
  }
  if (results.length === 0) return null;

  try {
    const read = await deps.reader.generate({
      prompt: [
        `Pengumuman: ${input.title}`,
        input.body.slice(0, 1_200),
        `Koridor: ${input.lineCodes.join(", ") || "tidak disebut"}`,
        `Halte: ${input.stationNames.slice(0, 8).join(", ") || "tidak disebut"}`,
        `Tanggal publikasi: ${publishedLabel}`,
        "",
        "Hasil pencarian:",
        ...results
          .slice(0, 10)
          .map((hit, index) => `[${index + 1}] ${hit.title} (${hit.url})\n${hit.content}`),
      ].join("\n"),
      abortSignal: AbortSignal.timeout(120_000),
    });
    if (read.type !== "response") return null;
    const source = results.find((hit) => hit.url === read.output.sourceUrl) ?? results[0];
    return {
      ...read.output,
      ...(source ? { sourceTitle: source.title, excerpt: source.content } : {}),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`riset jadwal tidak selesai: ${message}`);
    return null;
  }
}
