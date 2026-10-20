import { and, asc, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";

import type { TransitNetwork } from "@daily-route/transit";

import type { Database } from "./client.js";
import {
  disruptions,
  lineStops,
  lines,
  stationGroupMembers,
  stationGroups,
  stations,
  systems,
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
  const [lineRows, stationRows, stopRows, groupRows, memberRows] = await Promise.all([
    db.select().from(lines).orderBy(asc(lines.systemId), asc(lines.code)),
    db.select().from(stations).orderBy(asc(stations.systemId), asc(stations.name)),
    db.select().from(lineStops).orderBy(asc(lineStops.lineId), asc(lineStops.position)),
    db.select().from(stationGroups),
    db.select().from(stationGroupMembers),
  ]);

  const membersByGroup = new Map<string, string[]>();
  for (const member of memberRows) {
    const list = membersByGroup.get(member.groupId) ?? [];
    list.push(member.stationId);
    membersByGroup.set(member.groupId, list);
  }

  return {
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
    lineStops: stopRows.map((row) => ({
      lineId: row.lineId,
      stationId: row.stationId,
      direction: row.direction as "forward" | "backward",
      position: row.position,
      distanceFromOriginKm: row.distanceFromOriginKm,
    })),
    stationGroups: groupRows.map((row) => ({
      id: row.id,
      name: row.name,
      latitude: row.latitude,
      longitude: row.longitude,
      stationIds: membersByGroup.get(row.id) ?? [],
    })),
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

/** Disruptions that are still active, newest first. */
export async function listActiveDisruptions(
  db: Database,
  options: { since?: Date; limit?: number } = {},
) {
  const limit = options.limit ?? 100;
  const query = db
    .select()
    .from(disruptions)
    .where(eq(disruptions.status, "active"))
    .orderBy(desc(disruptions.publishedAt))
    .limit(limit);

  if (options.since) {
    return db
      .select()
      .from(disruptions)
      .where(and(eq(disruptions.status, "active"), gte(disruptions.publishedAt, options.since)))
      .orderBy(desc(disruptions.publishedAt))
      .limit(limit);
  }
  return query;
}

/** Disruptions that touch any of the given lines or stations. */
export async function listDisruptionsFor(
  db: Database,
  scope: { lineIds?: readonly string[]; stationIds?: readonly string[] },
) {
  const clauses = [
    ...(scope.lineIds ?? []).map((lineId) => eq(disruptions.lineId, lineId)),
    ...(scope.stationIds ?? []).map((stationId) => eq(disruptions.stationId, stationId)),
  ];
  if (clauses.length === 0) return [];

  return db
    .select()
    .from(disruptions)
    .where(and(eq(disruptions.status, "active"), or(...clauses)))
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
