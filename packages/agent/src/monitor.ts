import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, gt, gte, inArray, isNull, isNotNull, lt, lte, or, sql } from "drizzle-orm";

import type { Database } from "@daily-route/db";
import {
  claimSocialPosts,
  completeSocialPost,
  disruptions,
  findActiveNoticeByEventKey,
  insertNotice,
  listRecentPosts,
  markNoticeChecked,
  monitorQueueStats,
  resolveNotice,
  socialPosts,
  updateNotice,
} from "@daily-route/db";
import type { Disruption, RoadRef, TransitNetwork } from "@daily-route/transit";
import { platformDirections, normalizeText, type Compass } from "@daily-route/transit";

import type { ActivityLog } from "./activity.js";
import { noticeCandidatesForPost, candidateForNotice } from "./candidates.js";
import type { ClassifyInput, ClassifyResult } from "./classify.js";
import { normalizeEventKey } from "./classify.js";
import { reviewAtFor } from "./duration.js";
import type { NoticeReviewInput, NoticeReviewResult } from "./review.js";
import type { NetworkCache } from "./context.js";
import type { NoticeResearch, NoticeResearchInput } from "./research.js";
import {
  looksLikeTemporaryService,
  type TemporaryServiceInput,
  type TemporaryServiceWriteResult,
} from "./temporary-service.js";
import type { XPost } from "./x.js";

/**
 * The disruption monitor.
 *
 * It turns the Posts the worker's stream delivers into notices, decides
 * which announcements actually describe a disruption, and keeps the
 * `disruptions` table in step. The class is deliberately free of timers: the
 * caller decides when a tick happens, which keeps it testable.
 *
 * There is no fetch here. A Post arrives through `ingest`; classification is
 * a durable queue: every stored item is eventually read, an error is retried
 * with backoff, and a long backlog continues on the next tick instead of
 * being dropped.
 */

export type MonitorHandles = {
  systemId: string;
  handle: string;
};

export type PollResult = {
  /** Announcements stored during this tick. */
  fetched: number;
  /** Announcements that were not stored before. */
  fresh: number;
  /** New notices created. */
  disruptions: number;
  /** Existing notices refreshed by a newer announcement. */
  updated: number;
  /** Announcements that closed an open notice. */
  resolved: number;
  /** Queue items read and found not to be a disruption. */
  skipped: number;
  /** Queue items that failed and will be tried again. */
  failed: number;
  /** Items still waiting after this tick. */
  queued: number;
  /** Notices closed because their own end instant passed. */
  elapsed: number;
  /** Notices closed because they aged out of their kind's lifetime. */
  expired: number;
  /** New temporary-service overlays written by the agent. */
  temporaryServices: number;
  /** Notices examined by the review agent. */
  reviewed: number;
  /** Notices closed by the review agent. */
  resolvedByReview: number;
  errors: string[];
};

export type MonitorOptions = {
  db: Database;
  cache: NetworkCache;
  /**
   * The classifier is injected as a function, so the monitor can be tested
   * without a model provider.
   */
  classify: (input: ClassifyInput) => Promise<ClassifyResult>;
  /** Told what the monitor is doing, so the interface can show it. */
  activity?: ActivityLog;
  /** How long the classifier may work before a tick returns. */
  classificationBudgetMs?: number;
  /** How long a claimed queue row stays leased. */
  leaseMs?: number;
  /** How many queue items are read concurrently. */
  concurrency?: number;
  /** How many open notices a tick re-checks for a closing announcement. */
  sweepLimit?: number;
  /**
   * Read the schedule of a planned event when the announcement names one
   * but gives no hours. Injected so the monitor can be tested without a
   * provider; the worker wires the Tavily researcher here.
   */
  research?: (input: NoticeResearchInput) => Promise<NoticeResearch | null>;
  /**
   * Read a Post that looks like an announced temporary service. The agent
   * decides whether it is one; the monitor only decides that the Post is
   * worth the extra read.
   */
  temporaryService?: (input: TemporaryServiceInput) => Promise<
    { status: "ignored" } | TemporaryServiceWriteResult
  >;
  /**
   * Read a notice whose review instant is due. The callback is injected so
   * the monitor stays testable without a provider.
   */
  reviewNotice?: (input: NoticeReviewInput) => Promise<NoticeReviewResult>;
  /** How many due notices a tick may review. Default 2. */
  reviewLimit?: number;
};

export class DisruptionMonitor {
  readonly #options: MonitorOptions;
  #pollId: string | null = null;

  constructor(options: MonitorOptions) {
    this.#options = options;
  }

  /** Read the operator accounts and the news feed, then reconcile. */
  async tick(): Promise<PollResult> {
    const result: PollResult = {
      fetched: 0,
      fresh: 0,
      disruptions: 0,
      updated: 0,
      resolved: 0,
      skipped: 0,
      failed: 0,
      queued: 0,
      elapsed: 0,
      expired: 0,
      temporaryServices: 0,
      reviewed: 0,
      resolvedByReview: 0,
      errors: [],
    };

    const note = this.#options.activity;
    this.#pollId = randomUUID();

    await this.#classifyQueue(note, result);
    result.elapsed = await closeElapsedNotices(this.#options.db);
    result.expired = await expireStaleDisruptions(this.#options.db);
    await this.#reviewDueNotices(note, result);

    const swept = await this.#sweepOpenNotices(note, result);
    result.resolved += swept.resolved;
    result.updated += swept.updated;

    const stats = await monitorQueueStats(this.#options.db);
    result.queued = stats.socialQueued;

    if (
      result.disruptions > 0 ||
      result.updated > 0 ||
      result.resolved > 0 ||
      result.elapsed > 0 ||
      result.expired > 0
    ) {
      this.#options.cache.invalidate();
    }

    note?.push({
      phase: result.errors.length > 0 ? "error" : "stored",
      source: "monitor",
      message: finishLine(result),
    });

    return result;
  }

  /**
   * Drain the classification queue without fetching.
   *
   * The worker may call this between ticks to read a burst of Posts without
   * waiting for the next housekeeping pass.
   */
  async drain(options: { budgetMs?: number } = {}): Promise<PollResult> {
    const result: PollResult = {
      fetched: 0,
      fresh: 0,
      disruptions: 0,
      updated: 0,
      resolved: 0,
      skipped: 0,
      failed: 0,
      queued: 0,
      elapsed: 0,
      expired: 0,
      temporaryServices: 0,
      reviewed: 0,
      resolvedByReview: 0,
      errors: [],
    };
    this.#pollId = randomUUID();
    await this.#classifyQueue(undefined, result, options.budgetMs ?? 45_000);
    const stats = await monitorQueueStats(this.#options.db);
    result.queued = stats.socialQueued;
    if (result.disruptions > 0 || result.updated > 0 || result.resolved > 0) {
      this.#options.cache.invalidate();
    }
    return result;
  }

  /**
   * Store one Post delivered by the stream.
   *
   * The stream is the only source: there is no page to resume and no cursor
   * to advance. A duplicate id is ignored by the unique index.
   */
  async ingest(
    post: XPost & { systemId: string; accountId: string | null },
  ): Promise<{ fresh: number }> {
    this.#pollId = randomUUID();
    const fresh = await this.#storePosts([post]);
    if (fresh > 0) {
      this.#options.activity?.push({
        phase: "stored",
        source: "x",
        message: `@${post.authorHandle}: 1 new`,
      });
      this.#options.cache.invalidate();
    }
    return { fresh };
  }

  async #storePosts(
    posts: readonly (XPost & { systemId: string; accountId: string | null })[],
  ): Promise<number> {
    if (posts.length === 0) return 0;

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
    if (fresh.length === 0) return 0;

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
          metadata: {
            systemId: post.systemId,
            ...(post.accountId ? { accountId: post.accountId } : {}),
            ...(post.conversationId ? { conversationId: post.conversationId } : {}),
            ...(post.referencedPostIds?.length
              ? { referencedPostIds: post.referencedPostIds }
              : {}),
            ...(post.inReplyToPostId ? { inReplyToPostId: post.inReplyToPostId } : {}),
            ...(post.inReplyToUserId ? { inReplyToUserId: post.inReplyToUserId } : {}),
            ...(post.media?.length ? { media: post.media } : {}),
            postType: post.postType ?? "post",
          },
        })),
      )
      .onConflictDoNothing();

    return fresh.length;
  }

  async #classifyQueue(
    note: ActivityLog | undefined,
    result: PollResult,
    budgetMs?: number,
  ): Promise<void> {
    const deadline = Date.now() + (budgetMs ?? this.#classificationBudgetMs());
    for (;;) {
      if (Date.now() >= deadline) break;
      const social = await claimSocialPosts(this.#options.db, {
        limit: this.#concurrency(),
        leaseMs: this.#leaseMs(),
      });
      if (social.length === 0) break;

      await Promise.all(
        social.map((item) =>
          this.#classifySocial(item, note, result).catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            result.failed += 1;
            result.errors.push(`Queue: ${message}`);
          }),
        ),
      );
    }
  }

  async #classifySocial(
    item: Awaited<ReturnType<typeof claimSocialPosts>>[number],
    note: ActivityLog | undefined,
    result: PollResult,
  ): Promise<void> {
    note?.push({ phase: "classify", source: "x", message: `Reading @${item.authorHandle}` });
    const images = metadataImages(item.metadata);
    if (this.#options.temporaryService && looksLikeTemporaryService(item.text, images.length)) {
      try {
        const service = await this.#options.temporaryService({
          text: item.text,
          url: item.url,
          publishedAt: item.publishedAt,
          externalId: item.externalId,
          authorHandle: item.authorHandle,
          systemId: metadataString(item.metadata, "systemId"),
          images,
        });
        if (service.status === "saved" || service.status === "needs_review") {
          result.temporaryServices += 1;
          note?.push({
            phase: "stored",
            source: "x",
            message: `Temporary service ${service.service.code} from @${item.authorHandle}`,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // A service reader that fails must not stop the ordinary notice.
        result.errors.push(`Temporary service @${item.authorHandle}: ${message}`);
      }
    }
    try {
      const outcome = await this.#classifyAndStore({
        text: item.text,
        url: item.url,
        publishedAt: item.publishedAt,
        source: `x:${item.authorHandle}`,
        sourceType: "social",
        externalId: item.externalId,
        systemHint: metadataString(item.metadata, "systemId"),
        images: metadataImages(item.metadata),
        route: "queue",
        attempt: item.classificationAttempts,
      });
      await completeSocialPost(this.#options.db, item.id, {
        status: outcome.noticeId ? "classified" : "skipped",
        disruptionId: outcome.noticeId,
      });
      this.#countOutcome(outcome, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.failed += 1;
      result.errors.push(`@${item.authorHandle}: ${message}`);
      await completeSocialPost(this.#options.db, item.id, {
        status: item.classificationAttempts >= MAX_CLASSIFY_ATTEMPTS ? "needs_review" : "error",
        error: message.slice(0, 1_000),
        retryAt: retryAt(item.classificationAttempts),
      });
    }
  }

  #countOutcome(outcome: ClassifyOutcome, result: PollResult): void {
    if (outcome.created) result.disruptions += 1;
    if (outcome.updated) result.updated += 1;
    if (outcome.resolved > 0) result.resolved += outcome.resolved;
    if (!outcome.noticeId && outcome.resolved === 0) result.skipped += 1;
  }

  async #classifyAndStore(input: {
    text: string;
    url: string | null;
    publishedAt: Date;
    source: string;
    sourceType: "social" | "news" | "official";
    externalId: string;
    systemHint: string | null;
    images?: readonly { url: string; altText?: string }[] | undefined;
    route?: "queue" | "sweep";
    attempt?: number;
  }): Promise<ClassifyOutcome> {
    const { network, disruptions: open } = await this.#options.cache.get();
    const candidates = noticeCandidatesForPost({
      text: input.text,
      systemHint: input.systemHint,
      disruptions: open,
      network,
    });

    const classification = await this.#options.classify({
      ...input,
      candidates,
      ...(this.#pollId ? { pollId: this.#pollId } : {}),
      route: input.route ?? "queue",
      attempt: input.attempt ?? 1,
    });

    let resolved = 0;
    if (classification.analysis.confidence >= 0.6) {
      for (const disruptionId of classification.resolvesDisruptionIds) {
        const closed = await resolveNotice(this.#options.db, disruptionId, {
          reason: "announcement",
          sourcePublishedAt: input.publishedAt,
        });
        if (closed) resolved += 1;
      }
    }

    const touchesNetwork =
      classification.stationIds.length > 0 ||
      classification.lineIds.length > 0 ||
      classification.analysis.affectedStationNames.length > 0 ||
      classification.analysis.affectedSystemIds.length > 0;

    if (
      !classification.analysis.isDisruption ||
      classification.analysis.confidence < 0.4 ||
      !touchesNetwork ||
      classification.analysis.title.replace(/[^a-z0-9]/gi, "").length < 4 ||
      (classification.stationIds.length === 0 &&
        classification.lineIds.length === 0 &&
        classification.analysis.affectedStationNames.length === 0 &&
        classification.analysis.severity === "info")
    ) {
      return { noticeId: null, created: false, updated: false, resolved };
    }

    let until = classification.endsAt;
    let start = classification.startsAt;
    let research: NoticeResearch | null = null;
    if (!until && classification.analysis.needsSchedule && this.#options.research) {
      research = await this.#options
        .research({
          title: classification.analysis.title,
          body: input.text,
          lineCodes: classification.lineCodes,
          stationNames: classification.analysis.affectedStationNames,
          publishedAt: input.publishedAt,
          sourceUrls: input.url ? [input.url] : [],
        })
        .catch(() => null);
      const end = research?.endsAt ? new Date(research.endsAt) : null;
      if (end && !Number.isNaN(end.getTime())) until = research?.endsAt ?? null;
      const begin = research?.startsAt ? new Date(research.startsAt) : null;
      if (!start && begin && !Number.isNaN(begin.getTime())) start = research?.startsAt ?? null;
    }
    const ended = until !== null && Date.parse(until) <= Date.now();
    const duration = classification.duration ?? null;
    const reviewAnchor = start ? new Date(start) : input.publishedAt;
    const reviewAt = until ? null : reviewAtFor(duration, reviewAnchor);
    const target = classification.targetDisruptionId
      ? await this.#activeNotice(classification.targetDisruptionId)
      : null;
    const eventKey =
      target?.eventKey ??
      classification.eventKey ??
      deterministicEventKey({
        systemId: classification.analysis.affectedSystemIds[0] ?? null,
        kind: classification.analysis.kind,
        lineIds: classification.lineIds,
        stationIds: classification.stationIds,
        publishedAt: input.publishedAt,
      });
    const existing = target ?? (eventKey
      ? await findActiveNoticeByEventKey(this.#options.db, eventKey)
      : null);

    const sources = [
      {
        source: input.source,
        externalId: input.externalId,
        url: input.url,
        publishedAt: input.publishedAt.toISOString(),
      },
    ];
    const towards = classification.analysis.affectedTowards;
    const compass = classification.analysis.affectedCompass as Compass | null;
    // A road notice names no halte, but the stops on that road are the
    // places whose heading decides the direction, so a loop is readable too.
    const scopeStationIds = [
      ...new Set([
        ...classification.stationIds,
        ...classification.roads.flatMap((road) => road.stationIds),
      ]),
    ];
    const directionLines =
      classification.lineIds.length > 0
        ? classification.lineIds
        : linesServing(network, scopeStationIds);
    const platforms: {
      lineId: string;
      direction: "forward" | "backward";
      stationId?: string;
      platformId?: string;
    }[] = [];
    for (const platform of platformDirections(network, directionLines, {
      towards,
      compass,
      stationIds: scopeStationIds,
    })) {
      const stations = scopeStationIds.filter((stationId) =>
        network.lineStops.some(
          (stop) =>
            stop.lineId === platform.lineId &&
            stop.direction === platform.direction &&
            stop.stationId === stationId,
        ),
      );
      if (stations.length === 0) {
        platforms.push(platform);
        continue;
      }
      for (const stationId of stations) {
        const stop = network.lineStops.find(
          (entry) =>
            entry.lineId === platform.lineId &&
            entry.direction === platform.direction &&
            entry.stationId === stationId,
        );
        platforms.push({
          ...platform,
          stationId,
          ...(stop?.platform?.id ? { platformId: stop.platform.id } : {}),
        });
      }
    }
    const direction =
      platforms.length > 0 &&
      platforms.every((platform) => platform.direction === platforms[0]?.direction)
        ? (platforms[0]?.direction ?? null)
        : null;
    const metadata = {
      ...(classification.mark ? { mark: classification.mark } : {}),
      ...(until ? { until } : {}),
      ...(towards ? { towards } : {}),
      ...(compass ? { compass } : {}),
      ...(direction ? { direction } : {}),
      ...(platforms.length > 0 ? { platforms } : {}),
      ...(classification.analysis.viaToll ? { viaToll: true } : {}),
      ...(classification.diversion ? { diversion: classification.diversion } : {}),
      ...(duration ? { duration } : {}),
      ...(research?.endsAt ? { research } : {}),
      sources,
    };
    const values = {
      systemId: classification.analysis.affectedSystemIds[0] ?? null,
      lineId: classification.lineIds[0] ?? null,
      stationId: classification.stationIds[0] ?? null,
      severity: classification.analysis.severity,
      status: ended ? ("resolved" as const) : ("active" as const),
      kind: classification.analysis.kind,
      title: classification.analysis.title,
      body: classification.analysis.summary,
      url: input.url,
      confidence: classification.analysis.confidence,
      eventKey,
      startsAt: start ? new Date(start) : null,
      endsAt: until ? new Date(until) : null,
      reviewAt,
      reviewState: reviewAt ? "scheduled" : "none",
      durationAssessment: duration ?? {},
      publishedAt: input.publishedAt,
      observedAt: new Date(),
      lastSeenAt: input.publishedAt,
      resolvedAt: ended ? new Date() : null,
      resolvedReason: ended ? "announcement-end" : null,
      affectedStationIds: classification.stationIds,
      affectedLineIds: classification.lineIds,
      scope: classification.scope,
      lineCodes: classification.lineCodes,
      roads: classification.roads,
      metadata,
    };

    if (existing) {
      const current = existing.metadata && typeof existing.metadata === "object"
        ? (existing.metadata as Record<string, unknown>)
        : {};
      const previousSources = Array.isArray(current["sources"])
        ? (current["sources"] as unknown[]).filter(
            (entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null,
          )
        : [];
      const sourceKey = (entry: Record<string, unknown>): string =>
        `${String(entry["source"] ?? "")}:${String(entry["externalId"] ?? "")}`;
      const knownSources = new Set(previousSources.map(sourceKey));
      const mergedSources = [
        ...previousSources,
        ...sources.filter((entry) => !knownSources.has(sourceKey(entry))),
      ].slice(-12);
      const effectiveStart = earlierDate(existing.startsAt, start ? new Date(start) : null);
      const effectiveEnd = laterDate(existing.endsAt, until ? new Date(until) : null);
      const closedByEnd =
        effectiveEnd !== null && effectiveEnd.getTime() <= Date.now();
      const currentDuration =
        current["duration"] && typeof current["duration"] === "object"
          ? (current["duration"] as typeof duration)
          : null;
      const effectiveDuration = duration ?? currentDuration;
      const effectiveReviewAt = effectiveEnd
        ? null
        : effectiveDuration
          ? reviewAtFor(effectiveDuration, effectiveStart ?? input.publishedAt)
          : existing.reviewAt;
      const lastSeenAt = new Date(
        Math.max(existing.lastSeenAt.getTime(), input.publishedAt.getTime()),
      );
      const updated = await updateNotice(this.#options.db, existing.id, {
        systemId: existing.systemId ?? values.systemId,
        lineId: existing.lineId ?? values.lineId,
        stationId: existing.stationId ?? values.stationId,
        severity: maxSeverity(existing.severity, values.severity),
        kind: existing.kind === "unknown" ? values.kind : existing.kind,
        // The first report owns the headline; a route-specific follow-up
        // must not rename a network-wide event.
        title: existing.title.trim().length > 0 ? existing.title : values.title,
        body: existing.body.trim().length > 0 ? existing.body : values.body,
        url: existing.url ?? values.url,
        confidence: Math.max(existing.confidence, values.confidence),
        eventKey: existing.eventKey ?? eventKey,
        startsAt: effectiveStart,
        endsAt: effectiveEnd,
        reviewAt: effectiveReviewAt,
        reviewState: effectiveReviewAt ? "scheduled" : existing.reviewState,
        durationAssessment: effectiveDuration ?? existing.durationAssessment,
        status: closedByEnd ? "resolved" : "active",
        resolvedAt: closedByEnd ? new Date() : existing.resolvedAt,
        resolvedReason: closedByEnd ? "announcement-end" : existing.resolvedReason,
        publishedAt: new Date(
          Math.min(existing.publishedAt.getTime(), input.publishedAt.getTime()),
        ),
        observedAt: new Date(),
        lastSeenAt,
        affectedStationIds: unionIds(
          stringArray(existing.affectedStationIds),
          values.affectedStationIds,
        ),
        affectedLineIds: unionIds(stringArray(existing.affectedLineIds), values.affectedLineIds),
        // A later announcement may narrow the event to a stop; it must not
        // widen it back to the whole network.
        scope: strongerScope(existing.scope, values.scope),
        lineCodes: unionIds(stringArray(existing.lineCodes), values.lineCodes),
        roads: mergeRoads(existing.roads, values.roads),
        metadata: {
          ...current,
          ...(classification.mark ? { mark: classification.mark } : {}),
          ...(effectiveEnd ? { until: effectiveEnd.toISOString() } : {}),
          ...(effectiveDuration ? { duration: effectiveDuration } : {}),
          sources: mergedSources,
        },
      });
      this.#options.cache.invalidate();
      return {
        noticeId: updated?.id ?? existing.id,
        created: false,
        updated: true,
        resolved,
      };
    }

    const inserted = await insertNotice(this.#options.db, {
      source: input.source,
      sourceType: input.sourceType,
      externalId: input.externalId,
      ...values,
    });
    if (!inserted) {
      return { noticeId: null, created: false, updated: false, resolved };
    }
    this.#options.cache.invalidate();
    return { noticeId: inserted.id, created: true, updated: false, resolved };
  }

  async #activeNotice(id: string) {
    const rows = await this.#options.db
      .select()
      .from(disruptions)
      .where(and(eq(disruptions.id, id), eq(disruptions.status, "active")))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * Review the notices whose model-chosen review instant is due.
   *
   * This is the only place that closes a notice from the agentic path. A
   * notice with `review_at` is skipped by the kind fallback; if the review
   * agent is unavailable or cannot find evidence, it stays active and
   * unverified instead of disappearing.
   */
  async #reviewDueNotices(
    note: ActivityLog | undefined,
    result: PollResult,
  ): Promise<void> {
    if (!this.#options.reviewNotice) return;
    const limit = Math.max(0, Math.min(5, this.#options.reviewLimit ?? 2));
    if (limit === 0) return;
    const now = new Date();
    const rows = await this.#options.db
      .select()
      .from(disruptions)
      .where(
        and(
          eq(disruptions.status, "active"),
          isNotNull(disruptions.reviewAt),
          lte(disruptions.reviewAt, now),
          or(isNull(disruptions.endsAt), gt(disruptions.endsAt, now)),
        ),
      )
      .orderBy(asc(disruptions.reviewAt))
      .limit(limit);
    if (rows.length === 0) return;

    for (const row of rows) {
      note?.push({
        phase: "classify",
        source: "monitor",
        message: `Reviewing: ${row.title.slice(0, 60)}`,
      });
      try {
        const since = new Date(Math.max(row.lastSeenAt.getTime(), now.getTime() - 7 * 24 * 3_600_000));
        const posts = await listRecentPosts(this.#options.db, { since, limit: 40 });
        const metadata: Record<string, unknown> =
          row.metadata && typeof row.metadata === "object"
            ? (row.metadata as Record<string, unknown>)
            : {};
        const sourceUrls = Array.isArray((metadata as Record<string, unknown>)["sources"])
          ? ((metadata as Record<string, unknown>)["sources"] as unknown[])
              .flatMap((source) =>
                source && typeof source === "object" && typeof (source as Record<string, unknown>)["url"] === "string"
                  ? [(source as Record<string, unknown>)["url"] as string]
                  : [],
              )
          : [];
        const previous = (row.durationAssessment ?? {}) as Record<string, unknown>;
        const previousDuration =
          typeof previous["horizon"] === "string"
            ? {
                horizon: previous["horizon"],
                reviewAfterHours:
                  typeof previous["reviewAfterHours"] === "number"
                    ? previous["reviewAfterHours"]
                    : null,
                reason: typeof previous["reason"] === "string" ? previous["reason"] : "",
              }
            : null;
        const reviewed = await this.#options.reviewNotice({
          id: row.id,
          title: row.title,
          body: row.body,
          kind: row.kind,
          severity: row.severity,
          scope: row.scope,
          lineCodes: Array.isArray(row.lineCodes) ? (row.lineCodes as string[]) : [],
          publishedAt: row.publishedAt.toISOString(),
          startsAt: row.startsAt?.toISOString() ?? null,
          endsAt: row.endsAt?.toISOString() ?? null,
          lastSeenAt: row.lastSeenAt.toISOString(),
          previousDuration,
          recentPosts: posts.map((post) => ({
            text: post.text,
            authorHandle: post.authorHandle,
            publishedAt: post.publishedAt.toISOString(),
            url: post.url,
          })),
          sourceUrls,
          ...(this.#pollId ? { pollId: this.#pollId } : {}),
        });
        result.reviewed += 1;
        const at = new Date();
        const history = Array.isArray(metadata["reviewHistory"])
          ? (metadata["reviewHistory"] as unknown[]).slice(-4)
          : [];
        const reviewRecord = {
          at: at.toISOString(),
          verdict: reviewed.verdict,
          confidence: reviewed.confidence,
          summary: reviewed.summary,
          evidence: reviewed.evidence,
        };
        const ended = reviewed.verdict === "ended" && reviewed.evidence.length > 0;
        if (ended) {
          await updateNotice(this.#options.db, row.id, {
            status: "resolved",
            resolvedAt: at,
            resolvedReason: "review-agent",
            lastSeenAt: row.lastSeenAt,
            lastVerifiedAt: at,
            lastCheckedAt: at,
            reviewState: "verified",
            reviewAt: null,
            ...(reviewed.endsAt ? { endsAt: new Date(reviewed.endsAt) } : {}),
            metadata: { ...metadata, reviewHistory: [...history, reviewRecord] },
          });
          result.resolvedByReview += 1;
          this.#options.cache.invalidate();
          continue;
        }
        const hours = reviewed.reviewAfterHours ?? (reviewed.verdict === "unknown" ? 6 : 24);
        await updateNotice(this.#options.db, row.id, {
          lastSeenAt: row.lastSeenAt,
          reviewAt: new Date(at.getTime() + hours * 3_600_000),
          lastVerifiedAt: at,
          lastCheckedAt: at,
          reviewState:
            reviewed.verdict === "active" && reviewed.evidence.length > 0
              ? "verified"
              : "unverified",
          metadata: { ...metadata, reviewHistory: [...history, reviewRecord] },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(`Review ${row.id}: ${message}`);
        // A failed review must not close the notice or retry in a tight loop.
        await updateNotice(this.#options.db, row.id, {
          lastSeenAt: row.lastSeenAt,
          reviewAt: new Date(now.getTime() + 3_600_000),
          reviewState: "unverified",
        }).catch(() => null);
      }
    }
  }

  /**
   * Re-read a few open notices against the recent post corpus.
   *
   * This catches the case the queue cannot: a "service is back" post was
   * read before the notice it closes existed. The sweep is deliberately
   * small and cheap; Jev screens each candidate before the chat model.
   */
  async #sweepOpenNotices(
    note: ActivityLog | undefined,
    _result: PollResult,
  ): Promise<{ resolved: number; updated: number }> {
    const limit = this.#sweepLimit();
    if (limit === 0) return { resolved: 0, updated: 0 };

    const { network } = await this.#options.cache.get();
    const cutoff = new Date(Date.now() - 30 * 60_000);
    const rows = await this.#options.db
      .select()
      .from(disruptions)
      .where(
        and(
          eq(disruptions.status, "active"),
          or(isNull(disruptions.lastCheckedAt), lt(disruptions.lastCheckedAt, cutoff)),
          or(isNull(disruptions.endsAt), gte(disruptions.endsAt, new Date())),
        ),
      )
      .orderBy(sql`${disruptions.lastCheckedAt} asc nulls first`, desc(disruptions.publishedAt))
      .limit(limit);

    if (rows.length === 0) return { resolved: 0, updated: 0 };

    const since = new Date(Date.now() - 24 * 3_600_000);
    const posts = await listRecentPosts(this.#options.db, { since, limit: 200 });
    let resolved = 0;
    const updated = 0;

    for (const row of rows) {
      note?.push({
        phase: "classify",
        source: "monitor",
        message: `Checking an open notice: ${row.title.slice(0, 60)}`,
      });
      const notice = toDisruption(row);
      const candidate = candidateForNotice(notice, network);
      const matching = posts
        .filter((post) => post.text.trim().length > 0)
        .filter((post) => postMentionsNotice(post.text, notice, network))
        .filter((post) => looksLikeRestoration(post.text))
        .slice(0, 2);

      let closed = false;
      for (const post of matching) {
        try {
          const outcome = await this.#options.classify({
            text: post.text,
            url: post.url,
            publishedAt: post.publishedAt,
            source: `x:${post.authorHandle}`,
            sourceType: "social",
            externalId: post.externalId,
            systemHint: metadataString(post.metadata, "systemId"),
            images: metadataImages(post.metadata),
            candidates: [candidate],
            route: "sweep",
          });
          if (
            outcome.analysis.confidence >= 0.6 &&
            outcome.resolvesDisruptionIds.includes(notice.id)
          ) {
            const didResolve = await resolveNotice(this.#options.db, notice.id, {
              reason: "follow-up",
              sourcePublishedAt: post.publishedAt,
            });
            if (didResolve) {
              closed = true;
              resolved += 1;
            }
            break;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          note?.push({
            phase: "error",
            source: "monitor",
            message: `Follow-up failed: ${message.slice(0, 120)}`,
          });
        }
      }
      if (!closed) {
        // A "normal" post that the model did not confirm must not extend the
        // notice's life. The next check waits for real evidence.
        await markNoticeChecked(this.#options.db, notice.id);
      }
    }

    if (resolved > 0 || updated > 0) this.#options.cache.invalidate();
    return { resolved, updated };
  }

  #classificationBudgetMs(): number {
    return this.#options.classificationBudgetMs ?? 4 * 60_000;
  }

  #leaseMs(): number {
    return this.#options.leaseMs ?? 10 * 60_000;
  }

  #concurrency(): number {
    return this.#options.concurrency ?? 3;
  }

  #sweepLimit(): number {
    return this.#options.sweepLimit ?? 4;
  }
}

type ClassifyOutcome = {
  noticeId: string | null;
  created: boolean;
  updated: boolean;
  resolved: number;
};

const MAX_CLASSIFY_ATTEMPTS = 8;
const BACKOFF_MIN_MS = 15 * 60_000;
const BACKOFF_MAX_MS = 6 * 3_600_000;

function retryAt(attempts: number): Date {
  const exponent = Math.max(0, Math.min(attempts - 1, 6));
  const base = Math.min(BACKOFF_MIN_MS * 2 ** exponent, BACKOFF_MAX_MS);
  const jitter = Math.floor(Math.random() * 30_000);
  return new Date(Date.now() + base + jitter);
}

const SEVERITY_RANK: Record<string, number> = {
  info: 0,
  warning: 1,
  severe: 2,
  critical: 3,
};

function maxSeverity(left: string, right: string): string {
  return (SEVERITY_RANK[right] ?? 0) > (SEVERITY_RANK[left] ?? 0) ? right : left;
}

function earlierDate(left: Date | null, right: Date | null): Date | null {
  if (!left) return right;
  if (!right) return left;
  return left.getTime() <= right.getTime() ? left : right;
}

function laterDate(left: Date | null, right: Date | null): Date | null {
  if (!left) return right;
  if (!right) return left;
  return left.getTime() >= right.getTime() ? left : right;
}

function unionIds(left: readonly string[], right: readonly string[]): string[] {
  return [...new Set([...left, ...right])];
}

const SCOPE_RANK: Record<string, number> = { network: 0, line: 1, stop: 2 };

/**
 * The narrower of two scopes.
 *
 * A follow-up that names the halte at fault is more useful than the first
 * report's "the corridor is diverted", so the narrower scope wins. It never
 * goes the other way: a later post must not turn a stop into "somewhere on
 * the network".
 */
function strongerScope(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return (SCOPE_RANK[right] ?? 0) > (SCOPE_RANK[left] ?? 0) ? right : left;
}

/** The roads of both reports, with the stops of each one kept together. */
function mergeRoads(left: unknown, right: unknown): RoadRef[] {
  const merged = new Map<string, RoadRef>();
  for (const road of [...roadsOf(left), ...roadsOf(right)]) {
    const key = `${road.osmType}:${road.osmId}`;
    const existing = merged.get(key);
    if (existing) {
      existing.stationIds = unionIds(existing.stationIds, road.stationIds);
      continue;
    }
    merged.set(key, { ...road, stationIds: [...road.stationIds] });
  }
  return [...merged.values()];
}

function roadsOf(value: unknown): RoadRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const road = entry as Partial<RoadRef>;
    if (typeof road.name !== "string" || typeof road.osmId !== "number") return [];
    return [
      {
        name: road.name,
        osmType: road.osmType ?? "way",
        osmId: road.osmId,
        latitude: typeof road.latitude === "number" ? road.latitude : 0,
        longitude: typeof road.longitude === "number" ? road.longitude : 0,
        stationIds: Array.isArray(road.stationIds)
          ? road.stationIds.filter((id): id is string => typeof id === "string")
          : [],
      },
    ];
  });
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

/**
 * A deterministic fallback for the model's event slug.
 *
 * Two announcements of the same kind about the same grounded line or stop
 * on the same Jakarta day collapse into one row. The model's key is
 * preferred when it gives one; this exists so a missing or unstable key
 * does not create a duplicate every poll.
 */
export function deterministicEventKey(input: {
  systemId: string | null;
  kind: string;
  lineIds: readonly string[];
  stationIds: readonly string[];
  publishedAt: Date;
}): string | null {
  const scope = [...new Set([...input.stationIds, ...input.lineIds])].sort();
  if (scope.length === 0) return null;
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(input.publishedAt);
  return normalizeEventKey(
    `${input.systemId ?? "network"}-${input.kind}-${scope.join("-")}-${day}`,
  );
}

/**
 * A notice's lifetime, by kind, when it has no end of its own.
 *
 * A Jakarta diversion is usually measured in hours, not days. The old 36/72
 * hour fallback kept a finished road closure on the board for a day and a
 * half. Eight hours is the default; every newer Post that still says the
 * route is disrupted moves `lastSeenAt`, and the deadline moves with it
 * (for example 06:00 + 08:00 = 14:00, then a 08:00 confirmation gives
 * 16:00). A notice with an explicit end or a validity window never uses this
 * fallback.
 */
export const INCIDENT_FALLBACK_HOURS = 8;

export function noticeTtlHours(kind: string, _severity: string): number {
  if (kind === "delay") return 4;
  if (kind === "weather") return 8;
  if (kind === "diversion" || kind === "closure" || kind === "service-change") {
    return INCIDENT_FALLBACK_HOURS;
  }
  if (kind === "maintenance") return 72;
  if (kind === "strike") return 48;
  return INCIDENT_FALLBACK_HOURS;
}

/**
 * Close notices whose own end instant is already past.
 *
 * The instant comes from the classifier. This function only compares it
 * with the clock.
 */
export async function closeElapsedNotices(db: Database, now = new Date()): Promise<number> {
  const rows = await db
    .update(disruptions)
    .set({ status: "resolved", resolvedAt: now, resolvedReason: "announcement-end" })
    .where(and(eq(disruptions.status, "active"), lte(disruptions.endsAt, now)))
    .returning({ id: disruptions.id });
  return rows.length;
}

/**
 * Mark notices as stale when their kind's lifetime has passed.
 *
 * A notice that named its own end is left to `closeElapsedNotices`; this
 * function must not cut a planned change short just because its
 * announcement is old. The anchor is `lastSeenAt`, the most recent
 * announcement that confirmed the condition, not the first one.
 */
export async function expireStaleDisruptions(db: Database, now = new Date()): Promise<number> {
  const rows = await db
    .select()
    .from(disruptions)
    .where(eq(disruptions.status, "active"))
    .orderBy(desc(disruptions.publishedAt));

  const stale: string[] = [];
  for (const row of rows) {
    if (row.endsAt && row.endsAt.getTime() > now.getTime()) continue;
    // A row with a model-assigned review instant is governed by the review
    // agent. It is never closed merely because a kind's fallback expired.
    if (row.reviewAt) continue;
    // A planned event with its own windows is governed by those windows,
    // not by the incidental fallback.
    if (Array.isArray(row.validityWindows) && row.validityWindows.length > 0) continue;
    // An announced future event is not stale before it starts. Once it
    // starts, give it the fallback window from its start, not from an
    // announcement made days earlier.
    if (row.startsAt && row.startsAt.getTime() > now.getTime()) continue;
    const lastSeen = row.lastSeenAt ?? row.publishedAt;
    const anchor = row.startsAt && row.startsAt.getTime() > lastSeen.getTime()
      ? row.startsAt
      : lastSeen;
    const hours =
      row.sourceType === "news"
        ? Math.min(noticeTtlHours(row.kind, row.severity), 24)
        : noticeTtlHours(row.kind, row.severity);
    if (now.getTime() - anchor.getTime() <= hours * 3_600_000) continue;
    stale.push(row.id);
  }
  if (stale.length === 0) return 0;

  await db
    .update(disruptions)
    .set({ status: "resolved", resolvedAt: now, resolvedReason: "expired" })
    .where(and(inArray(disruptions.id, stale), eq(disruptions.status, "active")));
  return stale.length;
}

/** The disruptions that were updated most recently. */
export async function recentDisruptions(db: Database, limit = 20) {
  return db
    .select()
    .from(disruptions)
    .where(gte(disruptions.observedAt, new Date(Date.now() - 7 * 24 * 3_600_000)))
    .orderBy(desc(disruptions.observedAt))
    .limit(limit);
}

function finishLine(result: PollResult): string {
  if (
    result.errors.length > 0 &&
    result.disruptions === 0 &&
    result.updated === 0 &&
    result.temporaryServices === 0
  ) {
    return "The check stopped.";
  }
  if (
    result.disruptions === 0 &&
    result.updated === 0 &&
    result.resolved === 0 &&
    result.temporaryServices === 0
  ) {
    return result.queued > 0
      ? `${result.queued} announcements are still being read.`
      : "No new notices.";
  }
  const parts: string[] = [];
  if (result.disruptions > 0) parts.push(`${result.disruptions} new`);
  if (result.updated > 0) parts.push(`${result.updated} updated`);
  if (result.resolved > 0) parts.push(`${result.resolved} closed`);
  if (result.temporaryServices > 0) parts.push(`${result.temporaryServices} temporary service`);
  if (result.reviewed > 0) parts.push(`${result.reviewed} reviewed`);
  return `${parts.join(", ")}.`;
}

function linesServing(network: { lineStops: readonly { lineId: string; stationId: string }[] }, stationIds: readonly string[]): string[] {
  const wanted = new Set(stationIds);
  return [
    ...new Set(
      network.lineStops
        .filter((stop) => wanted.has(stop.stationId))
        .map((stop) => stop.lineId),
    ),
  ];
}

function metadataImages(
  metadata: unknown,
): { url: string; altText?: string }[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const value = (metadata as Record<string, unknown>)["media"];
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const entry = item as Record<string, unknown>;
    const url = typeof entry["url"] === "string" ? entry["url"] : null;
    if (!url) return [];
    const altText = typeof entry["altText"] === "string" ? entry["altText"] : undefined;
    return [{ url, ...(altText ? { altText } : {}) }];
  });
}

function metadataString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toDisruption(row: {
  id: string;
  source: string;
  sourceType: string;
  systemId: string | null;
  lineId: string | null;
  stationId: string | null;
  stationGroupId: string | null;
  severity: string;
  status: string;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  confidence: number;
  eventKey: string | null;
  endsAt: Date | null;
  publishedAt: Date;
  observedAt: Date;
  lastSeenAt: Date;
  resolvedAt: Date | null;
  affectedStationIds: unknown;
  affectedLineIds: unknown;
  scope: string | null;
  lineCodes: unknown;
  roads: unknown;
  metadata: unknown;
}): Disruption {
  return {
    id: row.id,
    source: row.source,
    sourceType: row.sourceType as Disruption["sourceType"],
    systemId: row.systemId,
    lineId: row.lineId,
    stationId: row.stationId,
    stationGroupId: row.stationGroupId,
    severity: row.severity as Disruption["severity"],
    status: row.status as Disruption["status"],
    kind: row.kind as Disruption["kind"],
    title: row.title,
    body: row.body,
    url: row.url,
    confidence: row.confidence,
    eventKey: row.eventKey,
    endsAt: row.endsAt?.toISOString() ?? null,
    publishedAt: row.publishedAt.toISOString(),
    observedAt: row.observedAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    affectedStationIds: Array.isArray(row.affectedStationIds)
      ? row.affectedStationIds.filter((id): id is string => typeof id === "string")
      : [],
    affectedLineIds: Array.isArray(row.affectedLineIds)
      ? row.affectedLineIds.filter((id): id is string => typeof id === "string")
      : [],
    scope: row.scope === "stop" || row.scope === "line" || row.scope === "network" ? row.scope : null,
    lineCodes: stringArray(row.lineCodes),
    roads: roadsOf(row.roads),
  };
}

const RESTORATION = [
  "normal",
  "kembali",
  "beroperasi kembali",
  "berjalan normal",
  "dibuka kembali",
  "sudah dibuka",
  "tidak ada pengalihan",
];

function looksLikeRestoration(text: string): boolean {
  const normalized = normalizeText(text);
  return RESTORATION.some((word) => normalized.includes(normalizeText(word)));
}

function postMentionsNotice(text: string, notice: Disruption, network: TransitNetwork): boolean {
  const normalized = normalizeText(text);
  for (const lineId of [notice.lineId, ...notice.affectedLineIds]) {
    if (!lineId) continue;
    const line = network.lines.find((entry) => entry.id === lineId);
    if (line && mentionsCode(normalized, line.code)) return true;
  }
  for (const stationId of [notice.stationId, ...notice.affectedStationIds]) {
    if (!stationId) continue;
    const station = network.stations.find((entry) => entry.id === stationId);
    if (station && station.name.length >= 4 && normalized.includes(normalizeText(station.name))) {
      return true;
    }
  }
  const tokens = new Set(
    normalizeText(notice.title)
      .split(" ")
      .filter((token) => token.length >= 5),
  );
  let shared = 0;
  for (const token of normalized.split(" ")) {
    if (tokens.has(token)) shared += 1;
  }
  return shared >= 3;
}

function mentionsCode(text: string, code: string): boolean {
  const normalized = code.toLowerCase().trim();
  if (normalized.length === 0) return false;
  if (normalized.length >= 3) return text.includes(normalized);
  return new RegExp(`(?:koridor|rute|jalur)\\s+${normalized}(?:\\D|$)`, "i").test(text);
}
