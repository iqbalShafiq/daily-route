/**
 * The notice verifier.
 *
 * The classifier gives the notice its first shape. This agent is the second
 * reader: it searches for the event, opens the pages, quotes the sentence
 * that states each impact window, and checks the date, start, end, timezone,
 * route and stop before a window is written.
 *
 * It is deliberately not a date parser. The hard question is not where the
 * digits are; it is which route is affected on which day, according to which
 * source, and whether a second source agrees.
 */
import { Agent } from "@anvia/core";
import { createTool } from "@anvia/core/tool";
import { z } from "zod";

import type { DisruptionSeverity, TransitNetwork, ValidityWindow } from "@daily-route/transit";

import type { Env } from "@daily-route/env";

import type { NewsSearch } from "./news.js";
import { createNewsTool } from "./tools.js";
import { createCompletionModel, MEDIUM_REASONING, type ModelConfig } from "./model.js";
import { langfuseObservability } from "./tracing.js";

const evidenceWindowSchema = z.object({
  date: z.string().describe("YYYY-MM-DD in the source's calendar; empty when unknown"),
  startTime: z.string().describe("HH:mm in the source's timezone; empty when unknown"),
  endTime: z.string().describe("HH:mm; empty when the source gives no end"),
  timezone: z.string().describe("IANA zone, normally Asia/Jakarta"),
  scope: z.string().describe("The route, corridor or stop the window applies to"),
  lineCodes: z.array(z.string()).describe("Line codes named for this window"),
  stationNames: z.array(z.string()).describe("Stop names named for this window"),
  quote: z.string().describe("The sentence that states this window"),
  evidenceUrl: z.string().describe("The page where the quote was read"),
  confidence: z.number().describe("0 to 1, based on the evidence, not the model's mood"),
});

export const verificationSchema = z.object({
  windows: z.array(evidenceWindowSchema),
  needsReview: z.boolean(),
  unresolved: z.array(z.string()).describe("Claims that could not be confirmed"),
  summary: z.string().describe("One short paragraph for an operator log"),
});

export type Verification = z.infer<typeof verificationSchema>;

const queryPlanSchema = z.object({
  queries: z.array(z.string()).describe("Three web search queries, in Indonesian, that will find the operator's schedule"),
});

export function createQueryPlanner(
  config: ModelConfig,
  env: Env,
  operation = "verifier",
): Agent<z.infer<typeof queryPlanSchema>> {
  const observability = langfuseObservability(env);
  return new Agent<z.infer<typeof queryPlanSchema>>({
    id: "notice-query-planner",
    name: "Perencana Pencarian Notice",
    description: "Menulis pertanyaan pencarian yang akan menemukan jadwal operator.",
    model: createCompletionModel(config, operation),
    maxTokens: 16384,
    instructions: `You write web search queries for a Jakarta transit fact-checker.
Given an announcement, write three different queries that would find the
operator's own schedule or a detailed news report. Include the event name,
the operator, the city, the dates and the route codes when they are present.
Write the queries in Indonesian. Do not answer the question and do not invent
dates or routes. Do not use quotes around the whole query.`,
    outputSchema: queryPlanSchema,
    maxTurns: 1,
    providerOptions: MEDIUM_REASONING,
    ...(observability ? { observability } : {}),
  });
}

const criticSchema = z.object({
  verdicts: z.array(
    z.object({
      label: z.string(),
      supported: z.boolean(),
      reason: z.string(),
    }),
  ),
  summary: z.string(),
});

export function createWindowCritic(
  config: ModelConfig,
  env: Env,
  operation = "verifier",
): Agent<z.infer<typeof criticSchema>> {
  const observability = langfuseObservability(env);
  return new Agent<z.infer<typeof criticSchema>>({
    id: "notice-window-critic",
    name: "Pemeriksa Jendela Notice",
    description: "Memeriksa apakah kutipan benar-benar mendukung tanggal, jam dan rute.",
    model: createCompletionModel(config, operation),
    maxTokens: 16384,
    instructions: `You are a skeptical editor. For each proposed impact window, read the
quote and decide whether the quote itself supports the date, the start time,
the end time and the route or stop. A quote that only names the route and the
stops does not support a time. A quote that only gives a date does not
support a start or an end. If the quote is from a section whose heading gives
the time, the heading must be included in the quote. Be strict: unsupported
means unsupported. Return one verdict per label, with a short reason.`,
    outputSchema: criticSchema,
    maxTurns: 1,
    providerOptions: MEDIUM_REASONING,
    ...(observability ? { observability } : {}),
  });
}

export type FetchedPage = {
  url: string;
  title: string;
  text: string;
};

export type VerifiedNotice = {
  windows: ValidityWindow[];
  needsReview: boolean;
  unresolved: string[];
  summary: string;
};

export type VerifyInput = {
  title: string;
  body: string;
  source: string;
  sourceType: "social" | "news" | "official";
  publishedAt: Date;
  sourceUrls: string[];
  affectedLineCodes: string[];
  affectedStationNames: string[];
  severity: DisruptionSeverity;
  kind: string;
};

const VERIFIER_INSTRUCTIONS = `
You are the verification desk for a Jakarta transit notice. Your job is to
find the exact impact windows for a service disruption and to prove each one
with a quoted source.

You must work like a reporter, not a summarizer. Before you answer, call
search_news at least twice with different queries (one for the event and one
for the route), and call open_page on at least one result. Do not answer
from memory. If a tool is unavailable, say which one in unresolved. Never
write "Placeholder", "TBD", or "will fill after verification"; those are not
answers.

Rules:
1. Read the announcement first. Then search for the event, the operator's
   announcement, the operator's website, and a second independent report.
   Search for each day separately when the event spans more than one day.
2. Do not assume an event closes a road all day. A running event, a rally, a
   maintenance window and a public holiday usually have a start and an end.
   If the source gives only a date, say so; do not invent a time.
3. A window is one route or one stop on one day. "Corridor 9 is diverted
   03:00-09:00 on 24 October" and "10H skips three stops 05:00-09:00 on
   24 October" are two windows, not one.
4. Quote the sentence that supports the window. The quote must contain the
   date, the time and the route or stop, or be immediately next to it in the
   same list. Put the URL of the page where you read it.
5. Prefer the operator (Transjakarta, MRT, LRT, KAI) over news, and news over
   an anonymous social reply. If two reliable sources disagree, return both
   windows and set needsReview to true. Never average them.
6. Check the timezone. Jakarta is Asia/Jakarta (UTC+7). A time written
   "WIB" is Asia/Jakarta. Do not convert it to UTC by hand; return the local
   date and time and the timezone.
7. Use search_news to search. Use open_page to read a result in full; a
   search snippet is not enough for a quote.
8. If you cannot confirm the window, leave the date/time empty, add the claim
   to unresolved, and set needsReview to true. A notice with no verified
   window must not be shown as active.
9. The summary is for an operator log: what you checked, what agreed, and
   what is still unknown. Do not repeat the whole announcement.
`;

export function createPageTool(pages: FetchedPage[] = []) {
  return createTool({
    name: "open_page",
    description:
      "Membuka satu halaman web dan mengembalikan teks yang bisa dibaca. " +
      "Gunakan untuk membaca pengumuman operator atau berita secara penuh, " +
      "bukan hanya potongan hasil pencarian.",
    inputSchema: z.object({
      url: z.string().describe("URL http atau https"),
    }),
    execute: async (args) => {
      const url = safeUrl(args.url);
      if (!url) {
        return { ok: false, error: "URL harus http atau https dan bukan alamat lokal." };
      }
      try {
        const response = await fetch(url, {
          headers: { "User-Agent": "daily-route/0.1 (notice verification)" },
          signal: AbortSignal.timeout(20_000),
        });
        if (!response.ok) {
          return { ok: false, error: `Halaman menjawab ${response.status}.` };
        }
        const html = await response.text();
        const page = {
          url,
          title: titleOf(html),
          text: readableText(html).slice(0, 12_000),
        };
        pages.push(page);
        return {
          ok: true,
          ...page,
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Halaman tidak bisa dibuka.",
        };
      }
    },
  });
}

export function createVerificationAgent(
  config: ModelConfig,
  env: Env,
  search: NewsSearch | null,
  pages: FetchedPage[] = [],
  operation = "verifier",
): Agent<Verification> {
  const observability = langfuseObservability(env);
  return new Agent<Verification>({
    id: "notice-verifier",
    name: "Verifikasi Notice",
    description:
      "Mencari dan memeriksa tanggal, jam, rute dan halte dari sebuah pengumuman gangguan.",
    model: createCompletionModel(config, operation),
    maxTokens: 16384,
    instructions: VERIFIER_INSTRUCTIONS,
    tools: [
      createNewsTool({ enabled: search !== null, search: search ?? undefined }),
      createPageTool(pages),
    ],
    outputSchema: verificationSchema,
    maxTurns: 8,
    providerOptions: MEDIUM_REASONING,
    ...(observability ? { observability } : {}),
  });
}

export function createNoticeExtractor(
  config: ModelConfig,
  env: Env,
  operation = "verifier",
): Agent<Verification> {
  const observability = langfuseObservability(env);
  return new Agent<Verification>({
    id: "notice-extractor",
    name: "Ekstraksi Jendela Notice",
    description: "Membaca bukti yang sudah dibuka dan menulis jendela dampak yang didukung.",
    model: createCompletionModel(config, operation),
    maxTokens: 16384,
    instructions: `You are a careful editor. The source pages are already open below.
Extract only the impact windows that the pages support. Quote the exact
sentence for each window. Do not use outside knowledge and do not infer a
time that is not written. One window is one route or stop on one day. If a
page gives a schedule with several routes and times, return one window per
route per time band. If the pages do not support a window, return no window
and put the missing claim in unresolved. Never write a placeholder.`,
    outputSchema: verificationSchema,
    maxTurns: 1,
    providerOptions: MEDIUM_REASONING,
    ...(observability ? { observability } : {}),
  });
}

/**
 * Run the verifier for one notice and normalise its output into windows.
 *
 * The model returns local date/time strings. This function is the only place
 * that turns them into instants; it does not try to find dates in the text.
 */
export async function verifyNotice(
  input: VerifyInput,
  deps: {
    search: NewsSearch | null;
    planner: Agent<z.infer<typeof queryPlanSchema>>;
    extractor: Agent<Verification>;
    critic: Agent<z.infer<typeof criticSchema>>;
    network: TransitNetwork;
    /** Search the recent X conversation for a topic. */
    xSearch?: ((query: string) => Promise<{ posts: { text: string; url: string; authorHandle: string; createdAt: string }[] }>) | null;
    traceId?: string;
    attempt?: number;
  },
): Promise<VerifiedNotice> {
  const publishedLabel = jakartaDateLabel(input.publishedAt);
  const fallbackQueries = [
    `${input.title} jadwal`,
    `Transjakarta jadwal modifikasi layanan ${publishedLabel}`,
    `${input.affectedLineCodes.join(" ")} ${input.title}`.trim(),
    `${input.affectedStationNames.slice(0, 3).join(" ")} ${input.title}`.trim(),
  ]
    .map((query) => query.replace(/\s+/g, " ").trim())
    .filter((query, index, all) => query.length >= 8 && all.indexOf(query) === index);

  let queries = fallbackQueries.slice(0, 3);
  try {
    const planned = await deps.planner.generate({
      prompt: [
        `Judul: ${input.title}`,
        `Isi: ${input.body}`,
        `Koridor: ${input.affectedLineCodes.join(", ") || "tidak disebut"}`,
        `Halte: ${input.affectedStationNames.join(", ") || "tidak disebut"}`,
        `Tanggal publikasi: ${input.publishedAt.toISOString()}`,
        "Tulis tiga query pencarian yang berbeda.",
      ].join("\n"),
      abortSignal: AbortSignal.timeout(45_000),
      trace: {
        name: "rencana-pencarian-notice",
        version: "2026-10-24.1",
        ...(deps.traceId ? { sessionId: deps.traceId } : {}),
        tags: ["verifier", "planner"],
      },
    });
    if (planned.type === "response") {
      const plannedQueries = planned.output.queries
        .map((query) => query.replace(/\s+/g, " ").trim())
        .filter((query) => query.length >= 8);
      if (plannedQueries.length > 0) {
        // The planner is useful, but a bad plan must not hide the obvious
        // query. Keep the deterministic seed query in the set.
        queries = [...new Set([...fallbackQueries.slice(0, 2), ...plannedQueries])].slice(0, 4);
      }
    }
  } catch {
    // The fallback queries are still a useful plan.
  }

  const results = new Map<string, { title: string; url: string; content: string }>();
  if (deps.search) {
    await Promise.all(
      queries.map(async (query) => {
        try {
          for (const topic of ["news", "general"] as const) {
            const found = await deps.search?.({
              query,
              maxResults: 8,
              timeRange: "month",
              topic,
            });
            for (const result of found ?? []) {
              if (!result.url || results.has(result.url)) continue;
              results.set(result.url, {
                title: result.title,
                url: result.url,
                content: result.content,
              });
            }
          }
        } catch {
          // One query failing is not the end of the research; the other
          // queries and the original source can still carry the answer.
        }
      }),
    );
  }

  const pages: FetchedPage[] = [];
  if (input.sourceUrls[0]) {
    const original = await fetchReadablePage(input.sourceUrls[0]);
    if (original) pages.push(original);
  }
  const candidates = [...results.values()]
    .filter((result) => !/^(https?:\/\/)?(www\.)?(x|twitter)\.com\//i.test(result.url))
    .slice(0, 6);
  await Promise.all(
    candidates.slice(0, 4).map(async (result) => {
      const page = await fetchReadablePage(result.url);
      if (page) pages.push(page);
    }),
  );
  if (deps.xSearch) {
    for (const query of queries.slice(0, 2)) {
      try {
        const page = await deps.xSearch(query);
        for (const post of page.posts.slice(0, 8)) {
          pages.push({
            url: post.url,
            title: `X @${post.authorHandle}`,
            text: `${post.createdAt}\n${post.text}`,
          });
        }
      } catch {
        // X is one source, not the only source.
      }
    }
  }
  if (pages.length === 0) {
    for (const result of results.values()) {
      pages.push({ url: result.url, title: result.title, text: result.content });
    }
  }

  if (process.env["DEBUG_VERIFY"]) {
    console.error("queries", queries);
    for (const page of pages) console.error("page", page.url, page.text.length, /petamburan/i.test(page.text));
  }
  const evidence = pages
    .slice(0, 5)
    .map(
      (page, index) =>
        `Sumber ${index + 1}: ${page.title || page.url}\nURL: ${page.url}\n${page.text.slice(0, 7_000)}`,
    )
    .join("\n\n---\n\n");

  const extracted = await deps.extractor.generate({
    prompt: [
      "Pengumuman yang harus diverifikasi:",
      `Judul: ${input.title}`,
      `Isi: ${input.body}`,
      `Dipublikasikan: ${input.publishedAt.toISOString()}`,
      `Koridor: ${input.affectedLineCodes.join(", ") || "tidak disebut"}`,
      `Halte: ${input.affectedStationNames.join(", ") || "tidak disebut"}`,
      "",
      "Bukti yang sudah dibuka:",
      evidence || "(tidak ada halaman yang bisa dibuka; jangan mengarang jendela)",
      "",
      "Tulis setiap jendela dampak yang didukung bukti di atas. Sertakan kutipan dan URL.",
    ].join("\n"),
    abortSignal: AbortSignal.timeout(120_000),
    trace: {
      name: "ekstraksi-jendela-notice",
      version: "2026-10-24.1",
      ...(deps.traceId ? { sessionId: deps.traceId } : {}),
      tags: ["verifier", "extractor"],
      metadata: {
        pages: pages.length,
        queries: queries.length,
        attempt: deps.attempt ?? 1,
      },
    },
  });

  if (extracted.type !== "response") {
    throw new Error(`Verification did not produce a structured result (${extracted.type}).`);
  }

  const output = extracted.output;
  const windows: ValidityWindow[] = [];
  for (const window of output.windows) {
    const startsAt = instantOf(window.date, window.startTime, window.timezone);
    if (!startsAt) continue;
    const endsAt = instantOf(window.date, window.endTime, window.timezone, startsAt);
    const scopeLineIds = window.lineCodes
      .map((code) => deps.network.lines.find((line) => normalizeCode(line.code) === normalizeCode(code))?.id)
      .filter((id): id is string => typeof id === "string");
    windows.push({
      startsAt: startsAt.toISOString(),
      endsAt: endsAt ? endsAt.toISOString() : null,
      timezone: window.timezone || "Asia/Jakarta",
      scope: {
        systemIds: [],
        lineIds: [...new Set(scopeLineIds)],
        stationIds: [],
      },
      label: window.scope,
      quote: window.quote,
      evidenceUrl: window.evidenceUrl,
      confidence: Math.max(0, Math.min(1, window.confidence)),
    });
  }

  // A second, independent reader checks the quotes. The extractor is good at
  // finding a window in a long schedule; it is not a substitute for a reader
  // who asks whether the quoted sentence actually says that.
  let checked = windows;
  let needsReview = output.needsReview;
  const unresolved = [...output.unresolved];
  if (windows.length > 0) {
    const judged = await deps.critic.generate({
      prompt: [
        "Pengumuman:",
        input.title,
        input.body,
        "",
        "Jendela yang diusulkan:",
        ...windows.map(
          (window, index) =>
            `${index + 1}. ${window.label} | ${window.startsAt} - ${window.endsAt ?? "open"} | kutipan: ${window.quote}`,
        ),
        "",
        "Nilai setiap jendela. Kutipan harus mendukung tanggal, jam mulai, jam selesai dan rute/halte.",
      ].join("\n"),
      abortSignal: AbortSignal.timeout(120_000),
      trace: {
        name: "kritik-jendela-notice",
        version: "2026-10-24.1",
        ...(deps.traceId ? { sessionId: deps.traceId } : {}),
        tags: ["verifier", "critic"],
      },
    });
    if (judged.type === "response") {
      const unsupported = new Set(
        judged.output.verdicts
          .filter((verdict) => !verdict.supported)
          .map((verdict) => verdict.label),
      );
      checked = windows.filter((window) => !unsupported.has(window.label));
      if (checked.length !== windows.length) {
        needsReview = true;
        for (const verdict of judged.output.verdicts) {
          if (!verdict.supported) unresolved.push(`${verdict.label}: ${verdict.reason}`);
        }
      }
    }
  }

  return {
    windows: checked,
    needsReview:
      needsReview ||
      checked.length === 0 ||
      checked.some((window) => window.confidence < 0.6),
    unresolved,
    summary: output.summary,
  };
}

async function fetchReadablePage(url: string): Promise<FetchedPage | null> {
  const safe = safeUrl(url);
  if (!safe) return null;
  try {
    const response = await fetch(safe, {
      headers: { "User-Agent": "daily-route/0.1 (notice verification)" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return null;
    const html = await response.text();
    return {
      url: safe,
      title: titleOf(html),
      text: readableText(html).slice(0, 12_000),
    };
  } catch {
    return null;
  }
}

function jakartaDateLabel(value: Date): string {
  const month = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "numeric",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).formatToParts(value);
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const monthNumber = Number(parts.find((part) => part.type === "month")?.value ?? "1");
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  return `${day} ${month[monthNumber - 1] ?? "Januari"} ${year}`;
}

function normalizeCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function instantOf(
  date: string,
  time: string,
  timezone: string,
  after?: Date,
): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  if (after && time === new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta" }).format(after)) {
    // The model repeated the start as the end; that is not an end.
    return null;
  }
  const zone = timezone === "Asia/Jakarta" || timezone === "WIB" ? "+07:00" : "+07:00";
  const parsed = Date.parse(`${date}T${time}:00${zone}`);
  if (Number.isNaN(parsed)) return null;
  const instant = new Date(parsed);
  if (after && instant.getTime() <= after.getTime()) {
    // An end before the start is usually a window that crosses midnight. The
    // source said so with a time, not with a date; move it one day forward.
    return new Date(instant.getTime() + 24 * 3_600_000);
  }
  return instant;
}

function safeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local") ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function titleOf(html: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match?.[1]?.replace(/\s+/g, " ").trim() ?? "";
}

function readableText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}
