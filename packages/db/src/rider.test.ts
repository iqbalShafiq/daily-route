import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { insertUser } from "./account.js";
import { createDb, disconnect } from "./client.js";
import {
  deleteRiderPlace,
  insertObservation,
  listRecentObservations,
  listRiderPlaces,
  readToolCache,
  upsertRiderPlace,
  writeToolCache,
} from "./rider.js";
import { stations, systems } from "./schema.js";

/**
 * Rider personalization, against the real database.
 *
 * The suite owns its rows through the unique `fixture_rider_` address and
 * removes only those users in `afterAll`; it never truncates a table the
 * worker shares. The cache rows carry no user, so they are removed by their
 * fixture prefix.
 */

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. Run through `pnpm test`.");
}

const db = createDb(databaseUrl);

type StationFixture = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  systemId: string;
  systemName: string;
};

let station: StationFixture;

beforeAll(async () => {
  const rows = await db
    .select({
      id: stations.id,
      name: stations.name,
      latitude: stations.latitude,
      longitude: stations.longitude,
      systemId: stations.systemId,
      systemName: systems.name,
    })
    .from(stations)
    .innerJoin(systems, eq(stations.systemId, systems.id))
    .where(eq(stations.systemId, "transjakarta"))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error("The database is empty. Run `pnpm db:seed` before the tests.");
  }
  station = row;
});

afterAll(async () => {
  await db.execute(`DELETE FROM users WHERE email LIKE 'fixture_rider_%@example.test'`);
  await db.execute(`DELETE FROM tool_result_cache WHERE cache_key LIKE 'fixture_rider_%'`);
  await disconnect(db);
});

function uniqueEmail(): string {
  return `fixture_rider_${randomUUID()}@example.test`;
}

async function createUser(): Promise<{ id: string; email: string }> {
  const created = await insertUser(db, { email: uniqueEmail(), passwordHash: "test-hash" });
  if (!created.ok) {
    throw new Error("The fixture user could not be created.");
  }
  return created.user;
}

function stationPlace(name: string): Record<string, unknown> {
  return {
    kind: "station",
    id: station.id,
    name,
    latitude: 0,
    longitude: 0,
    systemId: null,
    systemName: null,
  };
}

describe("rider places", () => {
  it("grounds a real station and refuses an unknown id", async () => {
    const user = await createUser();

    const saved = await upsertRiderPlace(db, user.id, {
      label: "Home",
      payload: stationPlace("A name the rider made up"),
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    expect(saved.places).toHaveLength(1);
    const place = saved.places[0]?.place;
    expect(place).toEqual({
      kind: "station",
      id: station.id,
      name: station.name,
      latitude: station.latitude,
      longitude: station.longitude,
      systemId: station.systemId,
      systemName: station.systemName,
    });

    const refused = await upsertRiderPlace(db, user.id, {
      label: "Office",
      payload: { ...stationPlace("Nowhere"), id: `fixture_rider_missing_${randomUUID()}` },
    });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.reason).toBe("unknown-station");
    expect(refused.id).toContain("fixture_rider_missing_");

    // The refusal wrote nothing: the rider still has exactly one place.
    expect(await listRiderPlaces(db, user.id)).toHaveLength(1);
  });

  it("replaces a label that differs only in case instead of duplicating it", async () => {
    const user = await createUser();

    const first = await upsertRiderPlace(db, user.id, {
      label: "Home",
      payload: stationPlace(station.name),
    });
    expect(first.ok).toBe(true);

    const second = await upsertRiderPlace(db, user.id, {
      label: "hOME",
      payload: {
        kind: "place",
        id: `fixture_rider_place_${randomUUID()}`,
        name: "The new place",
        latitude: -6.2,
        longitude: 106.8,
        systemId: null,
        systemName: null,
      },
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.places).toHaveLength(1);
    expect(second.places[0]?.label).toBe("hOME");
    expect(second.places[0]?.place.name).toBe("The new place");
  });

  it("refuses a seventeenth distinct label but still replaces at the cap", async () => {
    const user = await createUser();

    for (let index = 1; index <= 16; index += 1) {
      const result = await upsertRiderPlace(db, user.id, {
        label: `Place ${index}`,
        payload: stationPlace(station.name),
      });
      expect(result.ok).toBe(true);
    }

    const seventeenth = await upsertRiderPlace(db, user.id, {
      label: "Place 17",
      payload: stationPlace(station.name),
    });
    expect(seventeenth).toEqual({ ok: false, reason: "too-many" });

    const listed = await listRiderPlaces(db, user.id);
    expect(listed).toHaveLength(16);
    expect(listed.some((place) => place.label === "Place 17")).toBe(false);

    // The cap limits distinct labels, not the rider's ability to correct one.
    const replaced = await upsertRiderPlace(db, user.id, {
      label: "place 1",
      payload: stationPlace(station.name),
    });
    expect(replaced.ok).toBe(true);
    expect(await listRiderPlaces(db, user.id)).toHaveLength(16);
  });

  it("deletes a label case-insensitively", async () => {
    const user = await createUser();
    await upsertRiderPlace(db, user.id, {
      label: "Office",
      payload: stationPlace(station.name),
    });

    expect(await deleteRiderPlace(db, user.id, "office")).toBe(true);
    expect(await deleteRiderPlace(db, user.id, "office")).toBe(false);
    expect(await listRiderPlaces(db, user.id)).toEqual([]);
  });
});

describe("rider observations", () => {
  it("does not count a reload in the same fifteen-minute bucket", async () => {
    const user = await createUser();
    await upsertRiderPlace(db, user.id, {
      label: "Home",
      payload: stationPlace(station.name),
    });

    const input = {
      originKey: station.id,
      destinationKey: "fixture_rider_destination",
      originName: station.name,
      destinationName: "Senen",
      lineCodes: ["9"],
      weekday: 1,
      minuteOfDay: 480,
      source: "plan" as const,
    };

    expect((await insertObservation(db, user.id, input)).inserted).toBe(true);
    expect((await insertObservation(db, user.id, { ...input, minuteOfDay: 481 })).inserted).toBe(
      false,
    );

    let observations = await listRecentObservations(db, user.id, new Date(Date.now() - 60_000));
    expect(observations).toHaveLength(1);
    // The label follows the place the rider named, without the caller passing
    // it again.
    expect(observations[0]?.originLabel).toBe("Home");

    expect((await insertObservation(db, user.id, { ...input, minuteOfDay: 500 })).inserted).toBe(
      true,
    );
    observations = await listRecentObservations(db, user.id, new Date(Date.now() - 60_000));
    expect(observations).toHaveLength(2);
  });

  it("lists only observations newer than the given instant", async () => {
    const user = await createUser();
    const old = new Date(Date.now() - 40 * 24 * 60 * 60_000);

    await insertObservation(db, user.id, {
      originKey: "fixture_rider_origin",
      destinationKey: "fixture_rider_destination",
      originName: "Origin",
      destinationName: "Destination",
      lineCodes: [],
      weekday: 2,
      minuteOfDay: 600,
      source: "chat",
    });

    expect(await listRecentObservations(db, user.id, old)).toHaveLength(1);
    expect(await listRecentObservations(db, user.id, new Date(Date.now() + 60_000))).toEqual([]);
  });
});

describe("tool result cache", () => {
  it("returns a live value, ignores an expired one and has no user column", async () => {
    const key = `fixture_rider_cache_${randomUUID()}`;
    await writeToolCache(db, key, { value: "fresh" }, new Date(Date.now() + 60_000));
    expect(await readToolCache(db, key)).toEqual({ value: "fresh" });

    await writeToolCache(db, key, { value: "replaced" }, new Date(Date.now() + 60_000));
    expect(await readToolCache(db, key)).toEqual({ value: "replaced" });

    const expiredKey = `fixture_rider_cache_${randomUUID()}`;
    await writeToolCache(db, expiredKey, { value: "stale" }, new Date(Date.now() - 1_000));
    expect(await readToolCache(db, expiredKey)).toBeNull();

    const columns = await db.$client<{ column_name: string }[]>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tool_result_cache'
    `;
    const names = columns.map((column) => column.column_name);
    expect(names).toEqual(expect.arrayContaining(["cache_key", "value", "expires_at"]));
    expect(names).not.toContain("user_id");
  });
});
