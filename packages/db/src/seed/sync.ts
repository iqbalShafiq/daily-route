import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildSearchDocument, type FareRules } from "@daily-route/transit";
import { inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  fareRules,
  lineGeometry,
  linePatterns,
  lineStops,
  lines,
  stationGroupMembers,
  stationGroups,
  stations,
  systems,
} from "../schema.js";

/**
 * Apply the committed snapshot to a database that already has one.
 *
 * `pnpm db:seed` truncates every table, the notices included, because it is
 * the loader for a fresh database. This one exists for the other case: the
 * network gained a stop or a corridor and the board must keep the notices it
 * already holds. The snapshot owns the network: a station, line or group that
 * it no longer contains is removed, so a stop deleted upstream does not stay
 * behind. Notices are untouched.
 */

type Snapshot = {
  systems: {
    id: string;
    name: string;
    mode: string;
    operator: string;
    description: string;
    color: string;
    website: string | null;
    timezone: string;
  }[];
  lines: {
    id: string;
    systemId: string;
    code: string;
    name: string;
    mode: string;
    serviceClass: string;
    operator: string;
    status: string;
    color: string | null;
    lengthKm: number | null;
    description: string;
    aliases: string[];
    metadata: Record<string, unknown>;
  }[];
  stations: {
    id: string;
    systemId: string;
    name: string;
    code: string | null;
    latitude: number;
    longitude: number;
    stationType: string;
    isInterchange: boolean;
    description: string;
    area: string | null;
    aliases: string[];
    metadata: Record<string, unknown>;
  }[];
  lineStops: {
    lineId: string;
    stationId: string;
    direction: "forward" | "backward";
    position: number;
    distanceFromOriginKm: number | null;
    platform?: {
      id: string;
      name: string;
      latitude: number;
      longitude: number;
      code: string | null;
    };
  }[];
  stationGroups: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    stationIds: string[];
  }[];
  lineGeometries: {
    lineId: string;
    direction: "forward" | "backward";
    coordinates: number[];
    stopOffsets: number[];
    lengthKm: number;
  }[];
  fareRules: FareRules;
};

const ROOT = resolve(import.meta.dirname, "../../../..");
const SNAPSHOT = resolve(ROOT, "data/transit-network.json");
const PATTERNS = resolve(ROOT, "data/line-patterns.json");
const CHUNK = 1_000;

async function main(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required. Run through `pnpm db:sync` so dotenv-cli loads the root .env.");
  }

  const snapshot = JSON.parse(await readFile(SNAPSHOT, "utf8")) as Snapshot;
  const patterns = JSON.parse(await readFile(PATTERNS, "utf8")) as {
    id: string;
    lineId: string;
    code: string;
    headsign: string;
    direction: "forward" | "backward";
    patternType: string;
    stopIds: string[];
    geometry: number[];
    stopOffsets: number[];
    serviceDays: string[];
    serviceLabel: string;
    toll: boolean;
    isDefault: boolean;
    source: string;
    sourceUrl: string | null;
    metadata: Record<string, unknown>;
  }[];
  const client = postgres(databaseUrl, { max: 4 });
  const db = drizzle(client);

  console.log(`· syncing ${snapshot.systems.length} systems`);
  for (const system of snapshot.systems) {
    const values = {
      id: system.id,
      name: system.name,
      mode: system.mode,
      operator: system.operator,
      description: system.description,
      color: system.color,
      website: system.website,
      timezone: system.timezone ?? "Asia/Jakarta",
      updatedAt: new Date(),
    };
    await db.insert(systems).values(values).onConflictDoUpdate({
      target: systems.id,
      set: values,
    });
  }

  console.log(`· syncing ${snapshot.lines.length} lines`);
  for (const line of snapshot.lines) {
    const values = {
      id: line.id,
      systemId: line.systemId,
      code: line.code,
      name: line.name,
      mode: line.mode,
      serviceClass: line.serviceClass,
      operator: line.operator,
      status: line.status,
      color: line.color,
      lengthKm: line.lengthKm,
      description: line.description,
      aliases: line.aliases,
      metadata: line.metadata,
      updatedAt: new Date(),
    };
    await db.insert(lines).values(values).onConflictDoUpdate({
      target: lines.id,
      set: values,
    });
  }

  const linesPerStation = new Map<string, Set<string>>();
  for (const stop of snapshot.lineStops) {
    const set = linesPerStation.get(stop.stationId) ?? new Set<string>();
    set.add(stop.lineId);
    linesPerStation.set(stop.stationId, set);
  }

  console.log(`· syncing ${snapshot.stations.length} stations`);
  const stationRows = snapshot.stations.map((station) => ({
    id: station.id,
    systemId: station.systemId,
    name: station.name,
    code: station.code,
    latitude: station.latitude,
    longitude: station.longitude,
    stationType: station.stationType,
    isInterchange: station.isInterchange,
    lineCount: linesPerStation.get(station.id)?.size ?? 0,
    description: station.description,
    area: station.area,
    aliases: station.aliases,
    searchText: buildSearchDocument({
      name: station.name,
      code: station.code,
      aliases: station.aliases,
      area: station.area,
      description: station.description,
    }),
    metadata: station.metadata,
    updatedAt: new Date(),
  }));
  for (let index = 0; index < stationRows.length; index += CHUNK) {
    await db
      .insert(stations)
      .values(stationRows.slice(index, index + CHUNK))
      .onConflictDoUpdate({
        target: stations.id,
        // `excluded` is the row the insert proposed, so a changed name or
        // coordinate replaces the old one instead of the first chunk's.
        set: {
          systemId: sql`excluded.system_id`,
          name: sql`excluded.name`,
          code: sql`excluded.code`,
          latitude: sql`excluded.latitude`,
          longitude: sql`excluded.longitude`,
          stationType: sql`excluded.station_type`,
          isInterchange: sql`excluded.is_interchange`,
          lineCount: sql`excluded.line_count`,
          description: sql`excluded.description`,
          area: sql`excluded.area`,
          aliases: sql`excluded.aliases`,
          searchText: sql`excluded.search_text`,
          metadata: sql`excluded.metadata`,
          updatedAt: sql`now()`,
        },
      });
  }

  // A station the snapshot no longer has must not linger: a name that was
  // removed upstream (a stop that turned out to be planned, a duplicate)
  // would otherwise stay routable. Children cascade.
  await client`DELETE FROM stations WHERE id <> ALL(${client.array(snapshot.stations.map((station) => station.id))}::text[])`;

  console.log(`· replacing ${snapshot.lineStops.length} line stops`);
  const lineIds = snapshot.lines.map((line) => line.id);
  await db.delete(lineStops).where(inArray(lineStops.lineId, lineIds));
  for (let index = 0; index < snapshot.lineStops.length; index += 5_000) {
    await db
      .insert(lineStops)
      .values(
        snapshot.lineStops.slice(index, index + 5_000).map((stop) => ({
          lineId: stop.lineId,
          stationId: stop.stationId,
          direction: stop.direction,
          position: stop.position,
          distanceFromOriginKm: stop.distanceFromOriginKm,
          metadata: stop.platform ? { platform: stop.platform } : {},
        })),
      )
      .onConflictDoNothing();
  }

  console.log(`· replacing ${snapshot.lineGeometries.length} route geometries`);
  await db.delete(lineGeometry).where(inArray(lineGeometry.lineId, lineIds));
  for (let index = 0; index < snapshot.lineGeometries.length; index += 5_000) {
    const slice = snapshot.lineGeometries.slice(index, index + 5_000);
    await db
      .insert(lineGeometry)
      .values(
        slice.map((geometry) => ({
          lineId: geometry.lineId,
          direction: geometry.direction,
          geometry: geometry.coordinates,
          stopOffsets: geometry.stopOffsets,
          lengthKm: geometry.lengthKm,
          pointCount: Math.floor(geometry.coordinates.length / 2),
        })),
      )
      .onConflictDoNothing();
  }

  console.log(`· replacing ${patterns.length} line patterns`);
  await db.delete(linePatterns);
  if (patterns.length > 0) {
    await db.insert(linePatterns).values(patterns).onConflictDoNothing();
  }

  console.log("· syncing the fare rules");
  await db
    .insert(fareRules)
    .values({ id: "current", rules: snapshot.fareRules, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: fareRules.id,
      set: { rules: snapshot.fareRules, updatedAt: new Date() },
    });

  await client`DELETE FROM lines WHERE id <> ALL(${client.array(lineIds)}::text[])`;

  console.log(`· syncing ${snapshot.stationGroups.length} interchange hubs`);
  const groupIds = snapshot.stationGroups.map((group) => group.id);
  for (const group of snapshot.stationGroups) {
    const values = {
      id: group.id,
      name: group.name,
      latitude: group.latitude,
      longitude: group.longitude,
      updatedAt: new Date(),
    };
    await db.insert(stationGroups).values(values).onConflictDoUpdate({
      target: stationGroups.id,
      set: values,
    });
  }
  await db.delete(stationGroupMembers).where(inArray(stationGroupMembers.groupId, groupIds));
  await db
    .insert(stationGroupMembers)
    .values(
      snapshot.stationGroups.flatMap((group) =>
        group.stationIds.map((stationId) => ({ groupId: group.id, stationId })),
      ),
    )
    .onConflictDoNothing();

  const counts = await db.execute<{ table_name: string; row_count: number }>(`
    SELECT 'systems' AS table_name, count(*)::int AS row_count FROM systems
    UNION ALL SELECT 'lines', count(*)::int FROM lines
    UNION ALL SELECT 'stations', count(*)::int FROM stations
    UNION ALL SELECT 'line_stops', count(*)::int FROM line_stops
    UNION ALL SELECT 'line_geometry', count(*)::int FROM line_geometry
    UNION ALL SELECT 'line_patterns', count(*)::int FROM line_patterns
    UNION ALL SELECT 'station_groups', count(*)::int FROM station_groups
    UNION ALL SELECT 'disruptions', count(*)::int FROM disruptions
    ORDER BY table_name
  `);
  await client`DELETE FROM station_groups WHERE id <> ALL(${client.array(snapshot.stationGroups.map((group) => group.id))}::text[])`;

  console.log("✓ synced");
  for (const row of counts) {
    console.log(`  ${row.table_name}: ${row.row_count}`);
  }

  await client.end({ timeout: 5 });
}

main().catch((error: unknown) => {
  console.error("sync failed:", error);
  process.exitCode = 1;
});
