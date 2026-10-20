import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb } from "./client.js";
import {
  findStationsNear,
  listActiveDisruptions,
  listLines,
  listSystems,
  loadInterchangeSiblings,
  loadNetwork,
  searchStationsLexical,
} from "./queries.js";

/**
 * The database layer, against the real database.
 *
 * These tests are the integrity check of the seeded network: every stop
 * belongs to a line that exists, every line has stops in both directions,
 * and the search functions find what they promise.
 */

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. Run through `pnpm test`.");
}

const db = createDb(databaseUrl);

beforeAll(async () => {
  const { count } = await db.execute<{ count: number }>(
    "SELECT count(*)::int AS count FROM stations",
  );
  if (!count || count === 0) {
    throw new Error("The database is empty. Run `pnpm db:seed` before the tests.");
  }
});

afterAll(async () => {
  await db.$client.end({ timeout: 5 });
});

describe("loadNetwork", () => {
  it("returns a coherent network", async () => {
    const network = await loadNetwork(db);

    expect(network.lines.length).toBeGreaterThan(100);
    expect(network.stations.length).toBeGreaterThan(1000);
    expect(network.lineStops.length).toBeGreaterThan(1000);

    const lineIds = new Set(network.lines.map((line) => line.id));
    const stationIds = new Set(network.stations.map((station) => station.id));

    for (const stop of network.lineStops) {
      expect(lineIds.has(stop.lineId)).toBe(true);
      expect(stationIds.has(stop.stationId)).toBe(true);
    }
  });

  it("gives every operating line stops in both directions", async () => {
    const network = await loadNetwork(db);
    const directions = new Map<string, Set<string>>();

    for (const stop of network.lineStops) {
      const set = directions.get(stop.lineId) ?? new Set<string>();
      set.add(stop.direction);
      directions.set(stop.lineId, set);
    }

    for (const line of network.lines) {
      if (line.status !== "operating") continue;
      const stops = network.lineStops.filter((stop) => stop.lineId === line.id);
      if (stops.length === 0) continue;
      const set = directions.get(line.id);
      expect(set?.has("forward")).toBe(true);
      expect(set?.has("backward")).toBe(true);
    }
  });

  it("orders the stops of a line without gaps", async () => {
    const network = await loadNetwork(db);

    for (const line of network.lines) {
      const forward = network.lineStops
        .filter((stop) => stop.lineId === line.id && stop.direction === "forward")
        .sort((a, b) => a.position - b.position);
      if (forward.length === 0) continue;
      forward.forEach((stop, index) => {
        expect(stop.position).toBe(index + 1);
      });
    }
  });

  it("places every station inside Greater Jakarta", async () => {
    const network = await loadNetwork(db);
    for (const station of network.stations) {
      expect(station.latitude).toBeGreaterThan(-7);
      expect(station.latitude).toBeLessThan(-5.5);
      expect(station.longitude).toBeGreaterThan(106);
      expect(station.longitude).toBeLessThan(108);
    }
  });
});

describe("listSystems and listLines", () => {
  it("lists every operator with its lines", async () => {
    const systems = await listSystems(db);
    expect(systems.map((system) => system.id)).toEqual(
      expect.arrayContaining([
        "transjakarta",
        "mrt-jakarta",
        "lrt-jakarta",
        "lrt-jabodebek",
        "krl-jabodetabek",
      ]),
    );

    const lines = await listLines(db, "mrt-jakarta");
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.systemId).toBe("mrt-jakarta");
    }
  });
});

describe("searchStationsLexical", () => {
  it("finds a station by a fragment of its name", async () => {
    const results = await searchStationsLexical(db, "Kelapa Gading", { limit: 5 });
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((result) => result.name.includes("Kelapa Gading"))).toBe(true);
  });

  it("is restricted to one system when asked", async () => {
    const results = await searchStationsLexical(db, "Cawang", {
      limit: 10,
      systemId: "krl-jabodetabek",
    });
    for (const result of results) {
      expect(result.systemId).toBe("krl-jabodetabek");
    }
  });
});

describe("findStationsNear", () => {
  it("finds the stations around a coordinate", async () => {
    const results = await findStationsNear(
      db,
      { latitude: -6.19447, longitude: 106.82297 },
      { radiusKm: 1, limit: 5 },
    );
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(result.distanceKm).toBeLessThanOrEqual(1);
    }
  });
});

describe("loadInterchangeSiblings", () => {
  it("links the stations of one hub to each other", async () => {
    const network = await loadNetwork(db);
    const hub = network.stationGroups.find((group) => group.stationIds.length > 1);
    expect(hub).toBeDefined();

    const siblings = await loadInterchangeSiblings(db, hub?.stationIds ?? []);
    expect(siblings.size).toBeGreaterThan(0);
  });
});

describe("listActiveDisruptions", () => {
  it("returns the rows that are still open", async () => {
    const rows = await listActiveDisruptions(db, { limit: 10 });
    for (const row of rows) {
      expect(row.status).toBe("active");
    }
  });
});
