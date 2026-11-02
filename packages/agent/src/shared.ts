import type { NewsSearch } from "./news.js";

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

export function cachedNewsSearch(
  search: NewsSearch | null,
  work: SharedWork,
  ttlMs = 10 * 60_000,
): NewsSearch | null {
  if (!search) return null;
  return (options) =>
    work.run(
      `news:${options.query.trim().toLowerCase()}:${options.topic ?? "news"}:${options.timeRange ?? "-"}:${options.maxResults ?? "-"}`,
      ttlMs,
      () => search(options),
    );
}
