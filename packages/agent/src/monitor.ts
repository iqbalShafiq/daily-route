import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";

import type { Database } from "@daily-route/db";
import { disruptions, newsItems, socialPosts } from "@daily-route/db";

import type { ClassifyInput, ClassifyResult } from "./classify.js";
import { toDisruption } from "./classify.js";
import type { NetworkCache } from "./context.js";
import type { NewsSearch } from "./news.js";
import type { XClient, XPost } from "./x.js";

/**
 * The disruption monitor.
 *
 * It watches the operators' public channels, decides which announcements
 * actually describe a disruption, and keeps the `disruptions` table in
 * step. The class is deliberately free of timers: the caller decides when a
 * poll happens, which keeps it testable.
 */

export type MonitorHandles = {
  systemId: string;
  handle: string;
};

export type PollResult = {
  /** Announcements seen during this poll. */
  fetched: number;
  /** Announcements that were not seen before. */
  fresh: number;
  /** Announcements that were classified as a disruption. */
  disruptions: number;
  /** Announcements that closed an open disruption. */
  resolved: number;
  errors: string[];
};

/** A post, with the operator it came from. */
export type MonitorPost = XPost & { systemId: string };

export type MonitorOptions = {
  db: Database;
  cache: NetworkCache;
  /**
   * The classifier is injected as a function, so the monitor can be tested
   * without a model provider.
   */
  classify: (input: ClassifyInput) => Promise<ClassifyResult>;
  x: XClient | null;
  news: NewsSearch | null;
  handles: MonitorHandles[];
  /** How often the same announcement is allowed to be re-read. */
  lookbackHours?: number;
};

export class DisruptionMonitor {
  readonly #options: MonitorOptions;

  constructor(options: MonitorOptions) {
    this.#options = options;
  }

  /** Read the operator accounts and the news feed, then reconcile. */
  async poll(): Promise<PollResult> {
    const result: PollResult = { fetched: 0, fresh: 0, disruptions: 0, resolved: 0, errors: [] };

    if (this.#options.x) {
      const posts: MonitorPost[] = [];
      for (const target of this.#options.handles) {
        try {
          const sinceId = await this.#latestSocialPostId(target.handle);
          const fetched = await this.#options.x.searchAccount(target.handle, sinceId ?? undefined);
          for (const post of fetched) {
            posts.push({ ...post, systemId: target.systemId });
          }
        } catch (error) {
          result.errors.push(
            `X @${target.handle}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      result.fetched += posts.length;
      const freshPosts = await this.#storePosts(posts);
      result.fresh += freshPosts.length;
      for (const post of freshPosts) {
        const outcome = await this.#classifyAndStore({
          text: post.text,
          url: post.url,
          publishedAt: new Date(post.createdAt),
          source: `x:${post.authorHandle}`,
          sourceType: "social",
          externalId: post.id,
          systemHint: post.systemId,
        });
        result.disruptions += outcome.created;
        result.resolved += outcome.resolved;
      }
    }

    if (this.#options.news) {
      try {
        const items = await this.#options.news({
          query: "gangguan layanan Bus Rapid Transit MRT LRT KRL Jakarta pengalihan rute penutupan",
          maxResults: 10,
          timeRange: "day",
        });
        result.fetched += items.length;
        const fresh = await this.#storeNews(items);
        result.fresh += fresh.length;
        for (const item of fresh) {
          const outcome = await this.#classifyAndStore({
            text: `${item.title}\n\n${item.content}`,
            url: item.url,
            publishedAt: item.publishedAt ? new Date(item.publishedAt) : new Date(),
            source: `news:${item.source ?? "unknown"}`,
            sourceType: "news",
            externalId: item.url,
            systemHint: null,
          });
          result.disruptions += outcome.created;
          result.resolved += outcome.resolved;
        }
      } catch (error) {
        result.errors.push(
          `Tavily: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return result;
  }

  async #latestSocialPostId(handle: string): Promise<string | null> {
    const rows = await this.#options.db
      .select({ externalId: socialPosts.externalId })
      .from(socialPosts)
      .where(eq(socialPosts.authorHandle, handle))
      .orderBy(desc(socialPosts.publishedAt))
      .limit(1);
    return rows[0]?.externalId ?? null;
  }

  async #storePosts(posts: readonly MonitorPost[]): Promise<MonitorPost[]> {
    if (posts.length === 0) return [];

    const existing = await this.#options.db
      .select({ externalId: socialPosts.externalId })
      .from(socialPosts)
      .where(
        inArray(
          socialPosts.externalId,
          posts.map((post) => post.id),
        ),
      );
    const known = new Set(existing.map((row) => row.externalId));

    const fresh = posts.filter((post) => !known.has(post.id));
    if (fresh.length === 0) return [];

    await this.#options.db
      .insert(socialPosts)
      .values(
        fresh.map((post) => ({
          platform: "x",
          externalId: post.id,
          authorHandle: post.authorHandle,
          text: post.text,
          url: post.url,
          publishedAt: new Date(post.createdAt),
        })),
      )
      .onConflictDoNothing();

    return fresh;
  }

  async #storeNews(
    items: readonly {
      title: string;
      url: string;
      content: string;
      source: string | null;
      publishedAt: string | null;
      score: number | null;
    }[],
  ): Promise<typeof items[number][]> {
    if (items.length === 0) return [];

    const existing = await this.#options.db
      .select({ url: newsItems.url })
      .from(newsItems)
      .where(inArray(newsItems.url, items.map((item) => item.url)));
    const known = new Set(existing.map((row) => row.url));

    const fresh = items.filter((item) => !known.has(item.url));
    if (fresh.length === 0) return [];

    await this.#options.db
      .insert(newsItems)
      .values(
        fresh.map((item) => ({
          title: item.title,
          url: item.url,
          content: item.content.slice(0, 4_000),
          source: item.source,
          query: "gangguan layanan Transportasi Jakarta",
          score: item.score,
          publishedAt: item.publishedAt ? new Date(item.publishedAt) : new Date(),
        })),
      )
      .onConflictDoNothing();

    return fresh;
  }

  async #classifyAndStore(input: {
    text: string;
    url: string | null;
    publishedAt: Date;
    source: string;
    sourceType: "social" | "news" | "official";
    externalId: string;
    systemHint: string | null;
  }): Promise<{ created: number; resolved: number }> {
    let classification;
    try {
      classification = await this.#options.classify({
        text: input.text,
        url: input.url,
        publishedAt: input.publishedAt,
        source: input.source,
        sourceType: input.sourceType,
        externalId: input.externalId,
        systemHint: input.systemHint,
      });
    } catch (error) {
      console.error("classification failed:", error instanceof Error ? error.message : error);
      return { created: 0, resolved: 0 };
    }

    let created = 0;
    if (classification.analysis.isDisruption && classification.analysis.confidence >= 0.4) {
      const row = toDisruption({
        analysis: classification.analysis,
        result: classification,
        source: input.source,
        sourceType: input.sourceType,
        externalId: input.externalId,
        url: input.url,
        publishedAt: input.publishedAt,
      });

      const inserted = await this.#options.db
        .insert(disruptions)
        .values({
          source: row.source,
          sourceType: row.sourceType,
          externalId: input.externalId,
          systemId: row.systemId,
          lineId: row.lineId,
          stationId: row.stationId,
          stationGroupId: row.stationGroupId,
          severity: row.severity,
          status: row.status,
          kind: row.kind,
          title: row.title,
          body: row.body,
          url: row.url,
          confidence: row.confidence,
          publishedAt: new Date(row.publishedAt),
          observedAt: new Date(row.observedAt),
          resolvedAt: row.resolvedAt ? new Date(row.resolvedAt) : null,
          affectedStationIds: row.affectedStationIds,
          affectedLineIds: row.affectedLineIds,
        })
        .onConflictDoNothing({ target: [disruptions.source, disruptions.externalId] })
        .returning({ id: disruptions.id });

      created = inserted.length;
    }

    let resolved = 0;
    for (const disruptionId of classification.resolvesDisruptionIds) {
      const updated = await this.#options.db
        .update(disruptions)
        .set({ status: "resolved", resolvedAt: new Date() })
        .where(
          and(
            eq(disruptions.id, disruptionId),
            eq(disruptions.status, "active"),
          ),
        )
        .returning({ id: disruptions.id });
      resolved += updated.length;
    }

    if (created > 0 || resolved > 0) {
      this.#options.cache.invalidate();
    }

    return { created, resolved };
  }
}

/**
 * Mark disruptions as stale when no announcement has touched them for a
 * while.
 *
 * Operators rarely publish a formal "the diversion has ended" notice, so
 * an alert that has not been confirmed for days is treated as no longer
 * relevant rather than shown forever.
 */
export async function expireStaleDisruptions(
  db: Database,
  options: { maxAgeHours: number } = { maxAgeHours: 72 },
): Promise<number> {
  const cutoff = new Date(Date.now() - options.maxAgeHours * 3_600_000);
  const rows = await db
    .update(disruptions)
    .set({ status: "resolved", resolvedAt: new Date() })
    .where(and(eq(disruptions.status, "active"), sql`${disruptions.publishedAt} < ${cutoff}`))
    .returning({ id: disruptions.id });
  return rows.length;
}

/** The disruptions that were updated most recently. */
export async function recentDisruptions(db: Database, limit = 20) {
  return db
    .select()
    .from(disruptions)
    .where(gt(disruptions.observedAt, new Date(Date.now() - 7 * 24 * 3_600_000)))
    .orderBy(desc(disruptions.observedAt))
    .limit(limit);
}
