import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";

import type {
  FareRules,
  LineServiceWindow,
  LineStop,
  TemporaryService,
  TemporaryServiceDirection,
  TransitNetwork,
} from "@daily-route/transit";

import type { Database } from "./client.js";
import {
  disruptions,
  fareRules,
  lineGeometry,
  linePatterns,
  lineStops,
  lines,
  socialPosts,
  stationGroupMembers,
  stationGroups,
  stations,
  systems,
  temporaryServices,
  usageEvents,
} from "./schema.js";

/**
 * Read helpers over the transit schema.
 *
 * Every query the API and the agent need lives here, so the raw SQL surface
 * stays in one file and the rest of the codebase never assembles filters by
 * hand.
 */

/** Load the whole routable network in one round trip. */
export async function loadNetwork(db: Database): Promise<TransitNetwork> {
  const [lineRows, stationRows, stopRows, groupRows, memberRows, geometryRows, patternRows] = await Promise.all([
    db.select().from(lines).orderBy(asc(lines.systemId), asc(lines.code)),
    db.select().from(stations).orderBy(asc(stations.systemId), asc(stations.name)),
    db.select().from(lineStops).orderBy(asc(lineStops.lineId), asc(lineStops.position)),
    db.select().from(stationGroups),
    db.select().from(stationGroupMembers),
    db.select().from(lineGeometry),
    db.select().from(linePatterns),
  ]);

  const membersByGroup = new Map<string, string[]>();
  for (const member of memberRows) {
    const list = membersByGroup.get(member.groupId) ?? [];
    list.push(member.stationId);
    membersByGroup.set(member.groupId, list);
  }

  return {
    patterns: patternRows.map((row) => ({
      id: row.id,
      lineId: row.lineId,
      code: row.code,
      headsign: row.headsign,
      direction: row.direction === "backward" ? "backward" : "forward",
      patternType: row.patternType as NonNullable<TransitNetwork["patterns"]>[number]["patternType"],
      stopIds: (row.stopIds as string[]) ?? [],
      geometry: (row.geometry as number[]) ?? [],
      stopOffsets: (row.stopOffsets as number[]) ?? [],
      serviceDays: (row.serviceDays as string[]) ?? [],
      serviceLabel: row.serviceLabel,
      toll: row.toll,
      isDefault: row.isDefault,
      source: row.source,
      sourceUrl: row.sourceUrl,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
    })),
    geometries: geometryRows.map((row) => ({
      lineId: row.lineId,
      direction: row.direction === "backward" ? "backward" : "forward",
      coordinates: (row.geometry as number[]) ?? [],
      stopOffsets: (row.stopOffsets as number[]) ?? [],
      lengthKm: row.lengthKm,
    })),
    lines: lineRows.map((row) => ({
      id: row.id,
      systemId: row.systemId,
      code: row.code,
      name: row.name,
      mode: row.mode as TransitNetwork["lines"][number]["mode"],
      serviceClass: row.serviceClass as TransitNetwork["lines"][number]["serviceClass"],
      operator: row.operator,
      status: row.status as TransitNetwork["lines"][number]["status"],
      color: row.color,
      lengthKm: row.lengthKm,
      description: row.description,
      aliases: (row.aliases as string[]) ?? [],
      metadata: (row.metadata as Record<string, unknown>) ?? {},
    })),
    stations: stationRows.map((row) => ({
      id: row.id,
      systemId: row.systemId,
      name: row.name,
      code: row.code,
      latitude: row.latitude,
      longitude: row.longitude,
      stationType: row.stationType as TransitNetwork["stations"][number]["stationType"],
      zone: row.zone,
      isInterchange: row.isInterchange,
      description: row.description,
      area: row.area,
      aliases: (row.aliases as string[]) ?? [],
    })),
    lineStops: stopRows.map((row) => {
      const platform = (row.metadata as { platform?: LineStop["platform"] } | null)?.platform;
      return {
        lineId: row.lineId,
        stationId: row.stationId,
        direction: row.direction as "forward" | "backward",
        position: row.position,
        distanceFromOriginKm: row.distanceFromOriginKm,
        ...(platform ? { platform } : {}),
      };
    }),
    stationGroups: groupRows.map((row) => ({
      id: row.id,
      name: row.name,
      latitude: row.latitude,
      longitude: row.longitude,
      stationIds: membersByGroup.get(row.id) ?? [],
    })),
  };
}

/**
 * The announced temporary services that may still be used.
 *
 * `ends_at` is an operational end, not a cleanup timestamp. A row that starts
 * in the future is included: a journey can be planned for its first day.
 */
export async function listTemporaryServices(db: Database): Promise<TemporaryService[]> {
  const rows = await db
    .select()
    .from(temporaryServices)
    .where(eq(temporaryServices.status, "active"))
    .orderBy(asc(temporaryServices.startsAt), asc(temporaryServices.code));
  return rows.map(temporaryServiceOfRow);
}

/** Insert or refresh one announced service, keyed by its stable event. */
export async function saveTemporaryService(
  db: Database,
  service: TemporaryService,
): Promise<TemporaryService> {
  const now = new Date();
  const values = {
    id: service.id,
    eventKey: service.eventKey,
    code: service.code,
    name: service.name,
    systemId: service.systemId,
    operator: service.operator,
    mode: service.mode,
    serviceClass: service.serviceClass,
    color: service.color,
    directions: service.directions,
    startsAt: new Date(service.startsAt),
    endsAt: service.endsAt ? new Date(service.endsAt) : null,
    reviewAt: service.reviewAt ? new Date(service.reviewAt) : null,
    status: service.status,
    source: service.source,
    confidence: service.confidence,
    metadata: service.metadata,
    updatedAt: now,
  };
  await db
    .insert(temporaryServices)
    .values(values)
    .onConflictDoUpdate({
      target: temporaryServices.eventKey,
      set: {
        code: values.code,
        name: values.name,
        systemId: values.systemId,
        operator: values.operator,
        mode: values.mode,
        serviceClass: values.serviceClass,
        color: values.color,
        directions: values.directions,
        startsAt: values.startsAt,
        endsAt: values.endsAt,
        reviewAt: values.reviewAt,
        status: values.status,
        source: values.source,
        confidence: values.confidence,
        metadata: values.metadata,
        updatedAt: now,
      },
    });
  return service;
}

/** Remove one fixture. The writer never calls this. */
export async function deleteTemporaryService(db: Database, id: string): Promise<void> {
  await db.delete(temporaryServices).where(eq(temporaryServices.id, id));
}

function temporaryServiceOfRow(row: typeof temporaryServices.$inferSelect): TemporaryService {
  return {
    id: row.id,
    eventKey: row.eventKey,
    code: row.code,
    name: row.name,
    systemId: row.systemId,
    operator: row.operator,
    mode: row.mode as TemporaryService["mode"],
    serviceClass: row.serviceClass as TemporaryService["serviceClass"],
    color: row.color,
    directions: directionsOf(row.directions),
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    reviewAt: row.reviewAt?.toISOString() ?? null,
    status: row.status as TemporaryService["status"],
    source: sourceOf(row.source),
    confidence: row.confidence,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}

function directionsOf(value: unknown): TemporaryServiceDirection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): TemporaryServiceDirection[] => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const direction = item["direction"] === "backward" ? "backward" : "forward";
    const headsign = typeof item["headsign"] === "string" ? item["headsign"] : "";
    const stationIds = Array.isArray(item["stationIds"])
      ? item["stationIds"].filter((id): id is string => typeof id === "string")
      : [];
    const windows: LineServiceWindow[] = Array.isArray(item["windows"])
      ? item["windows"].flatMap((window): LineServiceWindow[] => {
          if (!window || typeof window !== "object") return [];
          const row = window as Record<string, unknown>;
          const startMinute = Number(row["startMinute"]);
          const endMinute = Number(row["endMinute"]);
          const headwayMinutes = Number(row["headwayMinutes"]);
          const days = Array.isArray(row["days"])
            ? row["days"].filter((day): day is number => Number.isInteger(day) && day >= 1 && day <= 7)
            : [];
          if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute) || !Number.isFinite(headwayMinutes)) {
            return [];
          }
          return [{
            days,
            startMinute,
            endMinute,
            headwayMinutes,
            ...(row["estimated"] === true ? { estimated: true } : {}),
          }];
        })
      : [];
    if (stationIds.length < 2 || windows.length === 0) return [];
    return [{ direction, headsign, stationIds, windows }];
  });
}

function sourceOf(value: unknown): TemporaryService["source"] {
  if (!value || typeof value !== "object") {
    return { postId: "", url: null, authorHandle: "", publishedAt: "", quote: "", images: [] };
  }
  const source = value as Record<string, unknown>;
  return {
    postId: typeof source["postId"] === "string" ? source["postId"] : "",
    url: typeof source["url"] === "string" ? source["url"] : null,
    authorHandle: typeof source["authorHandle"] === "string" ? source["authorHandle"] : "",
    publishedAt: typeof source["publishedAt"] === "string" ? source["publishedAt"] : "",
    quote: typeof source["quote"] === "string" ? source["quote"] : "",
    images: Array.isArray(source["images"])
      ? source["images"].filter((url): url is string => typeof url === "string")
      : [],
  };
}

/** Load the systems, ordered by name. */
export async function listSystems(db: Database) {
  return db.select().from(systems).orderBy(asc(systems.name));
}

/** Load the lines of one system, or all of them. */
export async function listLines(db: Database, systemId?: string) {
  if (!systemId) return db.select().from(lines).orderBy(asc(lines.systemId), asc(lines.code));
  return db.select().from(lines).where(eq(lines.systemId, systemId)).orderBy(asc(lines.code));
}

/** One notice by id, for the review worker and its tests. */
export async function findDisruptionById(db: Database, id: string) {
  const rows = await db.select().from(disruptions).where(eq(disruptions.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Remove test fixtures by their source. The worker never calls this. */
export async function deleteDisruptionsBySource(
  db: Database,
  source: string | readonly string[],
): Promise<void> {
  const list = typeof source === "string" ? [source] : source;
  if (list.length === 0) return;
  await db.delete(disruptions).where(inArray(disruptions.source, [...list]));
}

/** Load one station by id. */
export async function findStation(db: Database, stationId: string) {
  const rows = await db.select().from(stations).where(eq(stations.id, stationId)).limit(1);
  return rows[0] ?? null;
}

/**
 * Lexical station search.
 *
 * Two signals are combined: a case-insensitive substring match on the
 * normalised search text, and the trigram similarity of PostgreSQL. The
 * trigram score is what rescues a typo ("Kemang" → "Kemang Raya").
 */
export async function searchStationsLexical(
  db: Database,
  query: string,
  options: { limit?: number; systemId?: string } = {},
) {
  const limit = options.limit ?? 10;
  const pattern = `%${query.trim()}%`;

  const conditions = [
    sql`${stations.searchText} ILIKE ${pattern}`,
    sql`${stations.name} ILIKE ${pattern}`,
  ];

  const where = options.systemId
    ? and(or(...conditions), eq(stations.systemId, options.systemId))
    : or(...conditions);

  return db
    .select({
      id: stations.id,
      name: stations.name,
      systemId: stations.systemId,
      code: stations.code,
      latitude: stations.latitude,
      longitude: stations.longitude,
      isInterchange: stations.isInterchange,
      aliases: stations.aliases,
      /** The road the station stands on, when it is known. */
      street: sql<string | null>`${stations.metadata} ->> 'street'`,
      systemName: systems.name,
      systemMode: systems.mode,
      similarity: sql<number>`GREATEST(
        similarity(${stations.searchText}, ${query}),
        similarity(${stations.name}, ${query})
      )`,
    })
    .from(stations)
    .innerJoin(systems, eq(systems.id, stations.systemId))
    .where(where)
    .orderBy(desc(sql`similarity(${stations.searchText}, ${query})`))
    .limit(limit);
}

/** Stations near a coordinate, nearest first. */
export async function findStationsNear(
  db: Database,
  coordinates: { latitude: number; longitude: number },
  options: { radiusKm?: number; limit?: number } = {},
) {
  const radiusKm = options.radiusKm ?? 2;
  const limit = options.limit ?? 8;
  const latDelta = radiusKm / 111.32;
  const lonDelta = radiusKm / (111.32 * Math.cos((coordinates.latitude * Math.PI) / 180));

  return db
    .select({
      id: stations.id,
      name: stations.name,
      systemId: stations.systemId,
      code: stations.code,
      latitude: stations.latitude,
      longitude: stations.longitude,
      isInterchange: stations.isInterchange,
      systemName: systems.name,
      distanceKm: sql<number>`6371.0088 * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS(${stations.latitude} - ${coordinates.latitude}) / 2), 2) +
        COS(RADIANS(${coordinates.latitude})) * COS(RADIANS(${stations.latitude})) *
        POWER(SIN(RADIANS(${stations.longitude} - ${coordinates.longitude}) / 2), 2)
      )) AS "distanceKm"`,
    })
    .from(stations)
    .innerJoin(systems, eq(systems.id, stations.systemId))
    .where(
      and(
        gte(stations.latitude, coordinates.latitude - latDelta),
        sql`${stations.latitude} <= ${coordinates.latitude + latDelta}`,
        gte(stations.longitude, coordinates.longitude - lonDelta),
        sql`${stations.longitude} <= ${coordinates.longitude + lonDelta}`,
      ),
    )
    // The alias is quoted: Postgres folds an unquoted alias to lower case.
    .orderBy(sql`"distanceKm" ASC`)
    .limit(limit);
}

/** The station groups a set of stations belong to. */
export async function loadStationGroupsFor(db: Database, stationIds: readonly string[]) {
  if (stationIds.length === 0) return new Map<string, string[]>();
  const rows = await db
    .select({ groupId: stationGroupMembers.groupId, stationId: stationGroupMembers.stationId })
    .from(stationGroupMembers)
    .where(inArray(stationGroupMembers.stationId, [...stationIds]));

  const map = new Map<string, string[]>();
  for (const row of rows) {
    const list = map.get(row.stationId) ?? [];
    list.push(row.groupId);
    map.set(row.stationId, list);
  }
  return map;
}

/** Every station id that shares an interchange group with the given stations. */
export async function loadInterchangeSiblings(db: Database, stationIds: readonly string[]) {
  if (stationIds.length === 0) return new Map<string, string[]>();
  const groups = await loadStationGroupsFor(db, stationIds);
  const groupIds = [...new Set([...groups.values()].flat())];
  if (groupIds.length === 0) return new Map<string, string[]>();

  const members = await db
    .select({ groupId: stationGroupMembers.groupId, stationId: stationGroupMembers.stationId })
    .from(stationGroupMembers)
    .where(inArray(stationGroupMembers.groupId, groupIds));

  const byGroup = new Map<string, string[]>();
  for (const member of members) {
    const list = byGroup.get(member.groupId) ?? [];
    list.push(member.stationId);
    byGroup.set(member.groupId, list);
  }

  const siblings = new Map<string, string[]>();
  for (const [stationId, stationGroupIds] of groups) {
    const all = new Set<string>([stationId]);
    for (const groupId of stationGroupIds) {
      for (const sibling of byGroup.get(groupId) ?? []) all.add(sibling);
    }
    siblings.set(stationId, [...all]);
  }
  return siblings;
}

/**
 * Still on the board.
 *
 * `metadata.until` is the end the notice itself wrote. A row past that
 * instant is not active, even when its status has not been flipped yet.
 */
function stillInForce() {
  return and(
    eq(disruptions.status, "active"),
    sql`(${disruptions.endsAt} is null or ${disruptions.endsAt} > now())`,
  );
}

/** Disruptions that are still active, newest first. */
export async function listActiveDisruptions(
  db: Database,
  options: { since?: Date; limit?: number } = {},
) {
  const limit = options.limit ?? 100;
  const query = db
    .select()
    .from(disruptions)
    .where(stillInForce())
    .orderBy(desc(disruptions.publishedAt))
    .limit(limit);

  if (options.since) {
    return db
      .select()
      .from(disruptions)
      .where(and(stillInForce(), gte(disruptions.publishedAt, options.since)))
      .orderBy(desc(disruptions.publishedAt))
      .limit(limit);
  }
  return query;
}

/**
 * Notices from the archive, newest first.
 *
 * The monitor keeps notices after they close; the chat assistant reads this
 * list so it can answer "is it open now" and "what happened earlier" with the
 * same history the board used.
 */
export async function listNoticeHistory(
  db: Database,
  options: {
    query?: string;
    status?: "active" | "resolved" | "all";
    since?: Date;
    limit?: number;
  } = {},
) {
  const conditions = [];
  if (options.query?.trim()) {
    const pattern = `%${options.query.trim()}%`;
    conditions.push(or(ilike(disruptions.title, pattern), ilike(disruptions.body, pattern)));
  }
  if (options.status === "active") conditions.push(isNull(disruptions.resolvedAt));
  if (options.status === "resolved") conditions.push(isNotNull(disruptions.resolvedAt));
  if (options.since) conditions.push(gte(disruptions.publishedAt, options.since));
  const query = db
    .select()
    .from(disruptions)
    .orderBy(desc(disruptions.publishedAt))
    .limit(options.limit ?? 10);
  return conditions.length > 0 ? query.where(and(...conditions)) : query;
}

/** Disruptions that touch any of the given lines or stations. */
export async function listDisruptionsFor(
  db: Database,
  scope: { lineIds?: readonly string[]; stationIds?: readonly string[] },
) {
  const clauses = [];
  const lineIds = scope.lineIds ?? [];
  const stationIds = scope.stationIds ?? [];
  if (lineIds.length > 0) {
    clauses.push(
      sql`(${disruptions.lineId} = ANY(${lineIds}) OR ${disruptions.affectedLineIds} ?| ${lineIds})`,
    );
  }
  if (stationIds.length > 0) {
    clauses.push(
      sql`(${disruptions.stationId} = ANY(${stationIds}) OR ${disruptions.affectedStationIds} ?| ${stationIds})`,
    );
  }
  if (clauses.length === 0) return [];

  return db
    .select()
    .from(disruptions)
    .where(and(stillInForce(), or(...clauses)))
    .orderBy(desc(disruptions.publishedAt));
}

/** Resolve a disruption that no longer applies. */
export async function resolveDisruption(db: Database, id: string, resolvedAt = new Date()) {
  await db
    .update(disruptions)
    .set({ status: "resolved", resolvedAt })
    .where(eq(disruptions.id, id));
}

/** Stations that no longer serve any line, used to verify a seed. */
export async function countOrphanStations(db: Database): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(stations)
    .where(isNull(stations.id));
  return rows[0]?.count ?? 0;
}

/**
 * The fare rules in force.
 *
 * The table holds one row. A missing row means the snapshot was loaded
 * without the fares, which the caller reports rather than guesses around.
 */
export async function loadFareRules(db: Database): Promise<FareRules | null> {
  const rows = await db.select().from(fareRules).limit(1);
  const row = rows[0];
  if (!row) return null;
  return row.rules as FareRules;
}

/* ---------------------------------------------------------------------------
   The monitor's queue, cursors and notice lifecycle.
--------------------------------------------------------------------------- */

export type QueueItem = {
  id: string;
  externalId: string;
  authorHandle: string;
  text: string;
  url: string;
  publishedAt: Date;
  metadata: unknown;
  classificationAttempts: number;
};

/**
 * Claim a batch of social posts for classification.
 *
 * The update is the lease: `nextAttemptAt` moves into the future before the
 * model sees the item, so a worker that dies mid-call does not leave the row
 * stuck as `processing`. `skip locked` lets a second worker take the next
 * batch without waiting for the first.
 */
export async function claimSocialPosts(
  db: Database,
  options: { limit: number; leaseMs: number; now?: Date },
): Promise<QueueItem[]> {
  const now = options.now ?? new Date();
  const lease = new Date(now.getTime() + options.leaseMs);
  const rows = await db.execute<{
    id: string;
    externalId: string;
    authorHandle: string;
    text: string;
    url: string;
    publishedAt: Date;
    metadata: unknown;
    classificationAttempts: number;
  }>(sql`
    with picked as (
      select id
      from social_posts
      where classification_status in ('pending', 'error', 'processing')
        and next_attempt_at <= ${now.toISOString()}::timestamptz
        and author_handle not like 'test!_%' escape '!'
      order by published_at asc
      limit ${options.limit}
      for update skip locked
    )
    update social_posts as p
    set classification_status = 'processing',
        classification_attempts = p.classification_attempts + 1,
        next_attempt_at = ${lease.toISOString()}::timestamptz,
        classification_error = null
    from picked
    where p.id = picked.id
    returning
      p.id,
      p.external_id as "externalId",
      p.author_handle as "authorHandle",
      p.text,
      p.url,
      p.published_at as "publishedAt",
      p.metadata,
      p.classification_attempts as "classificationAttempts"
  `);
  return rows.map((row) => ({
    id: row.id,
    externalId: row.externalId,
    authorHandle: row.authorHandle,
    text: row.text,
    url: row.url,
    publishedAt: new Date(row.publishedAt),
    metadata: row.metadata,
    classificationAttempts: row.classificationAttempts,
  }));
}

/** Finish one queue item. An error keeps it claimable after the backoff. */
export async function completeSocialPost(
  db: Database,
  id: string,
  input: {
    status: "classified" | "skipped" | "error" | "needs_review";
    disruptionId?: string | null;
    error?: string | null;
    retryAt?: Date | null;
  },
): Promise<void> {
  await db
    .update(socialPosts)
    .set({
      classificationStatus: input.status,
      classificationError: input.error ?? null,
      disruptionId: input.disruptionId ?? null,
      classifiedAt: input.status === "error" || input.status === "needs_review" ? null : new Date(),
      nextAttemptAt: input.retryAt ?? new Date(),
    })
    .where(eq(socialPosts.id, id));
}

/**
 * The newest Post or Reply stored for one account, with its publication time.
 *
 * The worker uses the id as the `since_id` for a catch-up. The time lets the
 * catch-up cap the lookback at eight hours even when the last stored item is
 * older than that.
 */
export async function newestSocialPost(
  db: Database,
  authorHandle: string,
): Promise<{ id: string; publishedAt: Date } | null> {
  const rows = await db.execute<{ id: string; publishedAt: Date | string }>(sql`
    select external_id as id, published_at as "publishedAt"
    from social_posts
    where author_handle = ${authorHandle}
      and external_id ~ '^[0-9]+$'
    order by external_id::numeric desc
    limit 1
  `);
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, publishedAt: new Date(row.publishedAt) };
}

/** Counts for the worker health response and the activity line. */
export async function monitorQueueStats(db: Database): Promise<{
  socialQueued: number;
  socialFailed: number;
  activeNotices: number;
  oldestQueuedAt: Date | null;
}> {
  const rows = await db.execute<{
    socialQueued: number;
    socialFailed: number;
    activeNotices: number;
    oldestQueuedAt: Date | null;
  }>(sql`
    select
      (select count(*)::int from social_posts where classification_status in ('pending', 'processing')) as "socialQueued",
      (select count(*)::int from social_posts where classification_status = 'error') as "socialFailed",
      (select count(*)::int from disruptions where status = 'active') as "activeNotices",
      (select min(published_at) from social_posts where classification_status in ('pending', 'processing')) as "oldestQueuedAt"
  `);
  return (
    rows[0] ?? {
      socialQueued: 0,
      socialFailed: 0,
      activeNotices: 0,
      oldestQueuedAt: null,
    }
  );
}

/** The active notice for an event key, if one is still on the board. */
export async function findActiveNoticeByEventKey(db: Database, eventKey: string) {
  const rows = await db
    .select()
    .from(disruptions)
    .where(and(eq(disruptions.eventKey, eventKey), stillInForce()))
    .orderBy(desc(disruptions.publishedAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Insert a notice unless this exact announcement already made one. */
export async function insertNotice(
  db: Database,
  values: typeof disruptions.$inferInsert,
) {
  const rows = await db
    .insert(disruptions)
    .values(values)
    .onConflictDoNothing({
      target: [disruptions.source, disruptions.externalId],
    })
    .returning();
  return rows[0] ?? null;
}

/** Refresh an existing notice from a newer announcement about the same event. */
export async function updateNotice(
  db: Database,
  id: string,
  values: Partial<typeof disruptions.$inferInsert>,
) {
  const rows = await db
    .update(disruptions)
    // The monitor computes `lastSeenAt` from the source Post. It must not
    // be replaced by "now" when a historical Post is replayed, or an old
    // notice never reaches the end of its lifetime.
    .set({ ...values, ...(values.lastSeenAt ? {} : { lastSeenAt: new Date() }) })
    .where(eq(disruptions.id, id))
    .returning();
  return rows[0] ?? null;
}

/**
 * Rewrite where a notice points, without touching its life.
 *
 * A repair pass fixes the grounding of a row that was read before the
 * resolver could ground it. `last_seen_at` is the record of when the
 * operator last confirmed the condition, not when a reader looked at it, so
 * a repair must not move it: that would keep an old notice on the board.
 */
export async function updateNoticeGrounding(
  db: Database,
  id: string,
  values: Pick<
    typeof disruptions.$inferInsert,
    "scope" | "lineCodes" | "roads" | "affectedStationIds" | "affectedLineIds" | "stationId" | "lineId"
  >,
) {
  const rows = await db
    .update(disruptions)
    .set({ ...values, observedAt: new Date() })
    .where(eq(disruptions.id, id))
    .returning({ id: disruptions.id });
  return rows[0] ?? null;
}

/** Close a notice and record why. */
export async function resolveNotice(
  db: Database,
  id: string,
  options: { reason: string; resolvedAt?: Date; sourcePublishedAt?: Date } = {
    reason: "announcement",
  },
): Promise<boolean> {
  const clauses = [eq(disruptions.id, id), eq(disruptions.status, "active")];
  if (options.sourcePublishedAt) {
    clauses.push(lte(disruptions.lastSeenAt, options.sourcePublishedAt));
  }
  const rows = await db
    .update(disruptions)
    .set({
      status: "resolved",
      resolvedAt: options.resolvedAt ?? new Date(),
      resolvedReason: options.reason,
      lastCheckedAt: options.resolvedAt ?? new Date(),
    })
    .where(and(...clauses))
    .returning({ id: disruptions.id });
  return rows.length > 0;
}

/** Record that a notice was re-examined, even when nothing closed. */
export async function markNoticeChecked(db: Database, id: string, at = new Date()): Promise<void> {
  await db.update(disruptions).set({ lastCheckedAt: at }).where(eq(disruptions.id, id));
}

/** Recent posts, newest first, for the resolution sweep. */
export async function listRecentPosts(
  db: Database,
  options: { since: Date; limit?: number },
) {
  return db
    .select()
    .from(socialPosts)
    .where(gte(socialPosts.publishedAt, options.since))
    .orderBy(desc(socialPosts.publishedAt))
    .limit(options.limit ?? 200);
}

/** One paid call, as the dashboard will read it later. */
export type UsageEvent = {
  kind: "x" | "ai";
  provider: string;
  operation: string;
  model?: string | null | undefined;
  providerName?: string | null | undefined;
  endpoint?: string | null | undefined;
  status?: string | null | undefined;
  requests?: number | undefined;
  posts?: number | undefined;
  promptTokens?: number | undefined;
  completionTokens?: number | undefined;
  costUsd?: number | undefined;
  latencyMs?: number | undefined;
  traceId?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export async function recordUsage(db: Database, event: UsageEvent): Promise<void> {
  await db.insert(usageEvents).values({
    kind: event.kind,
    provider: event.provider,
    operation: event.operation,
    model: event.model ?? null,
    providerName: event.providerName ?? null,
    endpoint: event.endpoint ?? null,
    status: event.status ?? null,
    requests: event.requests ?? 1,
    posts: event.posts ?? 0,
    promptTokens: event.promptTokens ?? 0,
    completionTokens: event.completionTokens ?? 0,
    costUsd: String(event.costUsd ?? 0),
    latencyMs: event.latencyMs ?? null,
    traceId: event.traceId ?? null,
    metadata: event.metadata ?? {},
  });
}

/** A sink for the agent layer; it never throws into the model call. */
export function createUsageSink(db: Database): (event: UsageEvent) => Promise<void> {
  return async (event) => {
    try {
      await recordUsage(db, event);
    } catch (error) {
      console.warn(
        `usage record failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
}

/** One piece of evidence behind a notice, ready for the detail panel. */
export type NoticeSource = {
  type: "x" | "news" | "link";
  /** The post text, the quoted news sentence, or null for a bare link. */
  text: string | null;
  authorHandle: string | null;
  authorName: string | null;
  publishedAt: string | null;
  url: string;
  /** A short label for a news source. */
  title: string | null;
};

export type NoticeEvidence = {
  id: string;
  title: string;
  sources: NoticeSource[];
};

/**
 * The stored evidence for one notice.
 *
 * The monitor stores the original Post in `social_posts`; the research
 * reader stores a quote and its URL in `metadata.research`. This reads both
 * without calling X or Tavily at click time. A source that has no stored
 * text is still returned as a link, so the reader can open it.
 */
export async function listNoticeEvidence(
  db: Database,
  id: string,
): Promise<NoticeEvidence | null> {
  const [notice] = await db
    .select()
    .from(disruptions)
    .where(eq(disruptions.id, id))
    .limit(1);
  if (!notice) return null;

  const metadata = (notice.metadata ?? {}) as Record<string, unknown>;
  const rawSources = Array.isArray(metadata["sources"]) ? metadata["sources"] : [];
  const entries = rawSources.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const entry = raw as { url?: unknown; externalId?: unknown; publishedAt?: unknown };
    if (typeof entry.url !== "string") return [];
    return [{
      url: entry.url,
      externalId: typeof entry.externalId === "string" ? entry.externalId : null,
      publishedAt: typeof entry.publishedAt === "string" ? entry.publishedAt : null,
    }];
  });
  const externalIds = entries
    .map((entry) => entry.externalId)
    .filter((value): value is string => value !== null);
  const posts = externalIds.length
    ? await db
        .select()
        .from(socialPosts)
        .where(and(eq(socialPosts.platform, "x"), inArray(socialPosts.externalId, externalIds)))
    : [];
  const postsById = new Map(posts.map((post) => [post.externalId, post]));

  const sources: NoticeSource[] = [];
  const seen = new Set<string>();
  const add = (source: NoticeSource): void => {
    const key = `${source.type}:${source.url}`;
    if (seen.has(key)) return;
    seen.add(key);
    sources.push(source);
  };

  for (const entry of entries) {
    const post = entry.externalId ? postsById.get(entry.externalId) : undefined;
    if (post) {
      add({
        type: "x",
        text: post.text,
        authorHandle: post.authorHandle,
        authorName: post.authorName,
        publishedAt: post.publishedAt.toISOString(),
        url: post.url,
        title: null,
      });
    } else {
      add({
        type: "link",
        text: null,
        authorHandle: null,
        authorName: null,
        publishedAt: entry.publishedAt,
        url: entry.url,
        title: null,
      });
    }
  }

  const research = metadata["research"];
  if (research && typeof research === "object") {
    const value = research as {
      event?: unknown;
      quote?: unknown;
      excerpt?: unknown;
      sourceTitle?: unknown;
      sourceUrl?: unknown;
      startsAt?: unknown;
      endsAt?: unknown;
    };
    if (typeof value.sourceUrl === "string") {
      add({
        type: "news",
        text:
          typeof value.quote === "string"
            ? value.quote
            : typeof value.excerpt === "string"
              ? value.excerpt
              : null,
        authorHandle: null,
        authorName: null,
        publishedAt: null,
        url: value.sourceUrl,
        title:
          typeof value.sourceTitle === "string"
            ? value.sourceTitle
            : typeof value.event === "string"
              ? value.event
              : "Research source",
      });
    }
  }

  return { id: notice.id, title: notice.title, sources };
}
