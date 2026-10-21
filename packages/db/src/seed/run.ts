import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildSearchDocument, type FareRules } from "@daily-route/transit";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  fareRules,
  lineGeometry,
  lineStops,
  lines,
  stationGroupMembers,
  stationGroups,
  stations,
  systems,
} from "../schema.js";

/**
 * Load the network snapshot into Postgres.
 *
 * The snapshot is a committed file (`data/transit-network.json`), so the
 * database always contains the same data that the repository describes. The
 * loader is idempotent: it truncates first, then inserts.
 */

const ROOT = resolve(import.meta.dirname, "../../../..");
const SNAPSHOT = resolve(ROOT, "data/transit-network.json");

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

async function main(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required. Run through `pnpm db:seed` so dotenv-cli loads the root .env.");
  }

  const snapshot = JSON.parse(await readFile(SNAPSHOT, "utf8")) as Snapshot;
  const client = postgres(databaseUrl, { max: 4 });
  const db = drizzle(client);

  console.log("· truncating");
  await db.execute(
    `TRUNCATE TABLE
       social_posts, news_items, disruptions, agent_messages, agent_sessions,
       route_plans, station_embeddings, station_group_members, station_groups,
       line_geometry, line_stops, stations, lines, systems, fare_rules
     RESTART IDENTITY CASCADE`,
  );

  console.log(`· inserting ${snapshot.systems.length} systems`);
  await db.insert(systems).values(
    snapshot.systems.map((system) => ({
      id: system.id,
      name: system.name,
      mode: system.mode,
      operator: system.operator,
      description: system.description,
      color: system.color,
      website: system.website,
      timezone: system.timezone ?? "Asia/Jakarta",
    })),
  );

  console.log(`· inserting ${snapshot.lines.length} lines`);
  await db.insert(lines).values(
    snapshot.lines.map((line) => ({
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
    })),
  );

  // How many lines serve each station decides which of two stations of
  // the same name a rider meant, so it is counted before they are written.
  const linesPerStation = new Map<string, Set<string>>();
  for (const stop of snapshot.lineStops) {
    const set = linesPerStation.get(stop.stationId) ?? new Set<string>();
    set.add(stop.lineId);
    linesPerStation.set(stop.stationId, set);
  }

  console.log(`· inserting ${snapshot.stations.length} stations`);
  await db.insert(stations).values(
    snapshot.stations.map((station) => ({
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
    })),
  );

  console.log(`· inserting ${snapshot.lineStops.length} line stops`);
  const chunk = 5000;
  for (let index = 0; index < snapshot.lineStops.length; index += chunk) {
    await db
      .insert(lineStops)
      .values(snapshot.lineStops.slice(index, index + chunk))
      .onConflictDoNothing();
  }

  console.log(`· inserting ${snapshot.lineGeometries.length} route geometries`);
  for (let index = 0; index < snapshot.lineGeometries.length; index += chunk) {
    const slice = snapshot.lineGeometries.slice(index, index + chunk);
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

  console.log("· inserting the fare rules");
  await db.insert(fareRules).values({
    id: "current",
    rules: snapshot.fareRules,
    updatedAt: new Date(),
  });

  console.log(`· inserting ${snapshot.stationGroups.length} interchange hubs`);
  await db.insert(stationGroups).values(
    snapshot.stationGroups.map((group) => ({
      id: group.id,
      name: group.name,
      latitude: group.latitude,
      longitude: group.longitude,
    })),
  );
  await db.insert(stationGroupMembers).values(
    snapshot.stationGroups.flatMap((group) =>
      group.stationIds.map((stationId) => ({ groupId: group.id, stationId })),
    ),
  );

  const counts = await db.execute<{ table_name: string; row_count: number }>(`
    SELECT 'systems' AS table_name, count(*)::int AS row_count FROM systems
    UNION ALL SELECT 'lines', count(*)::int FROM lines
    UNION ALL SELECT 'stations', count(*)::int FROM stations
    UNION ALL SELECT 'line_stops', count(*)::int FROM line_stops
    UNION ALL SELECT 'line_geometry', count(*)::int FROM line_geometry
    UNION ALL SELECT 'fare_rules', count(*)::int FROM fare_rules
    UNION ALL SELECT 'station_groups', count(*)::int FROM station_groups
    UNION ALL SELECT 'station_group_members', count(*)::int FROM station_group_members
    ORDER BY table_name
  `);
  console.log("✓ seeded");
  for (const row of counts) {
    console.log(`  ${row.table_name}: ${row.row_count}`);
  }

  await client.end({ timeout: 5 });
}

main().catch((error: unknown) => {
  console.error("seed failed:", error);
  process.exitCode = 1;
});
