import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  deleteSession,
  deleteUser,
  findSession,
  findUserByEmail,
  findUserById,
  insertSession,
  insertUser,
  listMemory,
  upsertMemory,
} from "./account.js";
import type { MemoryPlace, StoredMemoryItem } from "./account.js";
import { createDb, disconnect } from "./client.js";
import { stations, systems } from "./schema.js";

/**
 * The account layer, against the real database.
 *
 * The tests own their rows: a unique email prefix and a delete in
 * `afterAll`, never a truncate of a table the application shares.
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
  await db.execute(`DELETE FROM users WHERE email LIKE 'fixture_auth_%@example.test'`);
  await disconnect(db);
});

function uniqueEmail(): string {
  return `fixture_auth_${randomUUID()}@example.test`;
}

async function createUser(): Promise<{ id: string; email: string }> {
  const email = uniqueEmail();
  const created = await insertUser(db, { email, passwordHash: "test-hash" });
  if (!created.ok) {
    throw new Error("The fixture user could not be created.");
  }
  return created.user;
}

function stationPlace(overrides: Partial<MemoryPlace> = {}): MemoryPlace {
  return {
    kind: "station",
    id: station.id,
    name: station.name,
    address: null,
    latitude: station.latitude,
    longitude: station.longitude,
    systemId: station.systemId,
    systemName: station.systemName,
    ...overrides,
  };
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function itemOf(items: StoredMemoryItem[], kind: string, itemKey: string): StoredMemoryItem | undefined {
  return items.find((item) => item.kind === kind && item.itemKey === itemKey);
}

describe("users", () => {
  it("inserts an account, reports a duplicate and finds it both ways", async () => {
    const email = uniqueEmail();
    const created = await insertUser(db, { email, passwordHash: "test-hash" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(created.user.email).toBe(email);

    const duplicate = await insertUser(db, { email, passwordHash: "other-hash" });
    expect(duplicate).toEqual({ ok: false, reason: "email-taken" });

    const byEmail = await findUserByEmail(db, email);
    expect(byEmail?.id).toBe(created.user.id);
    expect(byEmail?.email).toBe(email);
    expect(byEmail?.passwordHash).toBe("test-hash");

    const byId = await findUserById(db, created.user.id);
    expect(byId).toEqual({ id: created.user.id, email });
  });
});

describe("sessions", () => {
  it("round-trips a session, hides an expired one and deletes it", async () => {
    const user = await createUser();
    const tokenHash = randomUUID();
    const created = await insertSession(db, {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const found = await findSession(db, tokenHash);
    expect(found?.id).toBe(created.id);
    expect(found?.userId).toBe(user.id);
    expect(found?.email).toBe(user.email);

    const expiredHash = randomUUID();
    await insertSession(db, {
      userId: user.id,
      tokenHash: expiredHash,
      expiresAt: new Date(Date.now() - 1_000),
    });
    expect(await findSession(db, expiredHash)).toBeNull();

    await deleteSession(db, created.id);
    expect(await findSession(db, tokenHash)).toBeNull();
  });
});

describe("memory", () => {
  it("takes a station's name and coordinate from the station row", async () => {
    const user = await createUser();
    const result = await upsertMemory(db, user.id, [
      {
        kind: "saved-place",
        itemKey: "saved-home",
        deleted: false,
        payload: stationPlace({
          name: "A name the caller made up",
          latitude: 0,
          longitude: 0,
          systemId: null,
          systemName: null,
        }),
      },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const written = itemOf(result.items, "saved-place", "saved-home");
    expect(written?.payload).toEqual({
      kind: "station",
      id: station.id,
      name: station.name,
      address: null,
      latitude: station.latitude,
      longitude: station.longitude,
      systemId: station.systemId,
      systemName: station.systemName,
    });
    expect(written?.deletedAt).toBeNull();

    const listed = await listMemory(db, user.id);
    expect(itemOf(listed, "saved-place", "saved-home")?.payload).toEqual(written?.payload);
  });

  it("rejects an unknown station and writes nothing from the batch", async () => {
    const user = await createUser();
    const result = await upsertMemory(db, user.id, [
      {
        kind: "saved-place",
        itemKey: "would-be-written",
        deleted: false,
        payload: stationPlace(),
      },
      {
        kind: "saved-place",
        itemKey: "unknown-station",
        deleted: false,
        payload: stationPlace({ id: `fixture_auth_missing_${randomUUID()}` }),
      },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("unknown-station");
    expect(result.id).toContain("fixture_auth_missing_");
    expect(await listMemory(db, user.id)).toEqual([]);
  });

  it("tombstones the oldest saved place when the ninth one arrives", async () => {
    const user = await createUser();
    const firstEight = Array.from({ length: 8 }, (_, index) => `saved-${index + 1}`);

    for (const itemKey of firstEight) {
      const result = await upsertMemory(db, user.id, [
        { kind: "saved-place", itemKey, deleted: false, payload: stationPlace() },
      ]);
      expect(result.ok).toBe(true);
      await sleep(5);
    }

    const after = new Date();
    await sleep(5);
    const ninth = await upsertMemory(db, user.id, [
      { kind: "saved-place", itemKey: "saved-9", deleted: false, payload: stationPlace() },
    ]);
    expect(ninth.ok).toBe(true);

    const listed = await listMemory(db, user.id);
    expect(listed).toHaveLength(8);
    expect(itemOf(listed, "saved-place", "saved-1")).toBeUndefined();
    expect(itemOf(listed, "saved-place", "saved-9")).toBeDefined();

    const changed = await listMemory(db, user.id, after);
    const tombstone = itemOf(changed, "saved-place", "saved-1");
    expect(tombstone?.deletedAt).not.toBeNull();
    expect(itemOf(changed, "saved-place", "saved-9")?.deletedAt).toBeNull();
  });
});

describe("deleteUser", () => {
  it("removes the account, its sessions and its memory", async () => {
    const user = await createUser();
    const tokenHash = randomUUID();
    await insertSession(db, {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const saved = await upsertMemory(db, user.id, [
      { kind: "saved-place", itemKey: "saved-home", deleted: false, payload: stationPlace() },
    ]);
    expect(saved.ok).toBe(true);

    await deleteUser(db, user.id);

    expect(await findUserById(db, user.id)).toBeNull();
    expect(await findSession(db, tokenHash)).toBeNull();
    expect(await listMemory(db, user.id)).toEqual([]);
  });
});
