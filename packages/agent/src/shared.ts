import { readToolCache, writeToolCache } from "@daily-route/db";
import type { Database } from "@daily-route/db";

import type { NewsResult, NewsSearch, NewsSearchOptions } from "./news.js";

/**
 * Shared work for searches that cost money.
 *
 * A chat page can be open in several tabs, and the verifier can run while a
 * rider asks a question. None of them should send the same query to Tavily or
 * X at the same time. This helper does three things:
 *
 * 1. coalesces identical in-flight work;
 * 2. caches a successful answer for a short time;
 * 3. caps how many calls run at once, so a burst becomes a queue.
 */
export class SharedWork {
  readonly #cache = new Map<string, { expiresAt: number; value: unknown }>();
  readonly #inflight = new Map<string, Promise<unknown>>();
  readonly #waiting: (() => void)[] = [];
  readonly #maxConcurrent: number;
  #active = 0;

  constructor(maxConcurrent = 2) {
    this.#maxConcurrent = Math.max(1, maxConcurrent);
  }

  async run<T>(key: string, ttlMs: number, work: () => Promise<T>): Promise<T> {
    const cached = this.#cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value as T;

    const existing = this.#inflight.get(key);
    if (existing) return existing as Promise<T>;

    const promise = this.#withSlot(work).then((value) => {
      this.#cache.set(key, { expiresAt: Date.now() + ttlMs, value });
      this.#inflight.delete(key);
      return value;
    }).catch((error: unknown) => {
      this.#inflight.delete(key);
      throw error;
    });
    this.#inflight.set(key, promise);
    return promise;
  }

  async #withSlot<T>(work: () => Promise<T>): Promise<T> {
    if (this.#active >= this.#maxConcurrent) {
      await new Promise<void>((resolve) => this.#waiting.push(resolve));
    }
    this.#active += 1;
    try {
      return await work();
    } finally {
      this.#active -= 1;
      this.#waiting.shift()?.();
    }
  }
}

/**
 * A durable cache of public news results.
 *
 * The row is keyed by the normalized query, not by a rider, so two people
 * asking the same question share one paid Tavily call. A store failure is
 * never allowed to fail the search it was meant to save.
 */
export type NewsCacheStore = {
  read: (key: string) => Promise<NewsResult[] | null>;
  write: (key: string, value: NewsResult[], expiresAt: Date) => Promise<void>;
};

/** How long a news answer survives a restart. */
const NEWS_STORE_TTL_MS = 30 * 60_000;

/**
 * The key of one news query.
 *
 * Word order and case do not matter, punctuation is stripped, and domain
 * filters are sorted. A one-character token is usually a stop word, but a
 * digit is a corridor number: corridor 7 and corridor 9 must never share an
 * answer, so digits are kept even when they are a single character.
 */
export function newsCacheKey(options: NewsSearchOptions): string {
  const tokens = options.query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 || /^\d$/.test(token))
    .sort();

  return JSON.stringify({
    query: tokens,
    topic: options.topic ?? "news",
    timeRange: options.timeRange ?? "-",
    // The depth changes the paid request and the shape of the answer, so a
    // basic snippet must not satisfy an advanced research search.
    searchDepth: options.searchDepth ?? "basic",
    includeDomains: sortedDomains(options.includeDomains),
    excludeDomains: sortedDomains(options.excludeDomains),
  });
}

export function cachedNewsSearch(
  search: NewsSearch | null,
  work: SharedWork,
  ttlMs = 10 * 60_000,
  store?: NewsCacheStore,
): NewsSearch | null {
  if (!search) return null;
  return async (options) => {
    const key = newsCacheKey(options);
    // The store read sits inside SharedWork, so a durable hit also fills the
    // in-memory cache and the next turn does not touch the database.
    return work.run(key, ttlMs, async () => {
      const stored = store ? await store.read(key).catch(() => null) : null;
      if (stored) return stored;

      const results = await search(options);
      if (store) {
        const expiresAt = new Date(Date.now() + NEWS_STORE_TTL_MS);
        // The answer is already in hand; a cache write that fails is a
        // missing optimization, not a failed search.
        await store.write(key, results, expiresAt).catch(() => undefined);
      }
      return results;
    });
  };
}

/** The database-backed store, wired where the db is available. */
export function newsCacheStore(db: Database): NewsCacheStore {
  return {
    read: async (key) => newsResultsOf(await readToolCache(db, key)),
    write: async (key, value, expiresAt) => {
      await writeToolCache(db, key, value, expiresAt);
    },
  };
}

function sortedDomains(values: string[] | undefined): string[] {
  return (values ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .sort();
}

/** Narrow a cached JSON value back to a news result list. */
function newsResultsOf(value: unknown): NewsResult[] | null {
  if (!Array.isArray(value)) return null;

  const results: NewsResult[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null;
    const row = entry as Record<string, unknown>;
    if (
      typeof row["title"] !== "string" ||
      typeof row["url"] !== "string" ||
      typeof row["content"] !== "string"
    ) {
      return null;
    }
    results.push({
      title: row["title"],
      url: row["url"],
      content: row["content"],
      source: typeof row["source"] === "string" ? row["source"] : null,
      publishedAt: typeof row["publishedAt"] === "string" ? row["publishedAt"] : null,
      score: typeof row["score"] === "number" ? row["score"] : null,
    });
  }
  return results;
}
