import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import {
  cachedNewsSearch,
  NetworkCache,
  SharedWork,
  type NewsCacheStore,
  type NewsResult,
  type NewsSearch,
} from "@daily-route/agent";
import {
  createDb,
  disruptions,
  insertObservation,
  insertSession,
  insertUser,
  listRecentObservations,
  stations,
} from "@daily-route/db";
import { parseEnv } from "@daily-route/env";
import { createEmbeddingProvider, PlaceResolver } from "@daily-route/semantic";
import { habitsFrom, jakartaDayClock } from "@daily-route/transit";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import { createAttemptLimiter } from "./attempts.js";
import type { ApiDeps } from "./deps.js";
import { hashSessionToken } from "./session-cookie.js";

/**
 * The rider's own endpoints, against the real database.
 *
 * The suite owns its rows through the unique `fixture_rider_` address and the
 * `fixture_rider` notice source; it never truncates a shared table. No test
 * here sets an X token: the alerts are read from the notice table, which is
 * the point — personalization does not open a second stream.
 */

const env = parseEnv();
const db = createDb(env.DATABASE_URL);
const resolver = new PlaceResolver(db, createEmbeddingProvider(env));
const cache = new NetworkCache({ db, resolver });

const deps: ApiDeps = {
  db,
  env,
  cache,
  resolver,
  agent: null,
  lastProviderError: null,
  attempts: createAttemptLimiter(100, 15 * 60_000),
  jpos: null,
};

const app = createApp(deps);

type StationFixture = { id: string; name: string; latitude: number; longitude: number };

let station: StationFixture;

beforeAll(async () => {
  const rows = await db
    .select({
      id: stations.id,
      name: stations.name,
      latitude: stations.latitude,
      longitude: stations.longitude,
    })
    .from(stations)
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
  await db.execute(`DELETE FROM disruptions WHERE source = 'fixture_rider'`);
  await db.$client.end({ timeout: 5 });
});

function uniqueEmail(): string {
  return `fixture_rider_${randomUUID()}@example.test`;
}

async function createRider(): Promise<{ userId: string; cookie: string }> {
  const created = await insertUser(db, {
    email: uniqueEmail(),
    passwordHash: "test-hash",
  });
  if (!created.ok) {
    throw new Error("The fixture user could not be created.");
  }

  const token = `fixture_rider_session_${randomUUID()}`;
  await insertSession(db, {
    userId: created.user.id,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
  });
  return { userId: created.user.id, cookie: `dr_session=${token}` };
}

function stationPayload(): Record<string, unknown> {
  return {
    kind: "station",
    id: station.id,
    name: "A name the caller made up",
    latitude: 0,
    longitude: 0,
    systemId: null,
    systemName: null,
  };
}

function savePlace(cookie: string, label: string): request.Test {
  return request(app)
    .post("/api/account/places")
    .set("Origin", env.WEB_ORIGIN)
    .set("Cookie", cookie)
    .send({ label, payload: stationPayload() });
}

type AlertBody = {
  alerts: { habit: { originName: string; lineCodes: string[] }; notices: { id: string }[] }[];
};

/** Three minutes that fall in different 15-minute buckets around `minute`. */
function minutesAround(minute: number): number[] {
  if (minute < 60) return [minute, minute + 15, minute + 30];
  if (minute > 1_439 - 60) return [minute, minute - 15, minute - 30];
  return [minute - 15, minute, minute + 15];
}

describe("named places", () => {
  it("refuses a signed-out read", async () => {
    const response = await request(app).get("/api/account/places");
    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Sign in to continue.");
  });

  it("does not show one rider's labels to another rider", async () => {
    const owner = await createRider();
    const saved = await savePlace(owner.cookie, "Home");
    expect(saved.status).toBe(200);
    expect(saved.body.places).toHaveLength(1);
    expect(saved.body.places[0].label).toBe("Home");
    expect(saved.body.places[0].place.name).toBe(station.name);

    const stranger = await createRider();
    const listed = await request(app).get("/api/account/places").set("Cookie", stranger.cookie);
    expect(listed.status).toBe(200);
    expect(listed.body.places).toEqual([]);
  });

  it("deletes an encoded label for the signed-in rider", async () => {
    const rider = await createRider();
    expect((await savePlace(rider.cookie, "My Office")).status).toBe(200);

    const removed = await request(app)
      .delete(`/api/account/places/${encodeURIComponent("my office")}`)
      .set("Origin", env.WEB_ORIGIN)
      .set("Cookie", rider.cookie);
    expect(removed.status).toBe(200);
    expect(removed.body.removed).toBe(true);
    expect(removed.body.places).toEqual([]);
  });
});

describe("usual journeys", () => {
  it("records a signed-in plan as an observation", async () => {
    const rider = await createRider();
    const response = await request(app)
      .get("/api/routes/plan?origin=Bundaran%20HI&destination=Kelapa%20Gading")
      .set("Cookie", rider.cookie);
    expect(response.status).toBe(200);

    const observations = await listRecentObservations(
      db,
      rider.userId,
      new Date(Date.now() - 60_000),
    );
    expect(observations).toHaveLength(1);
    expect(observations[0]?.source).toBe("plan");
    expect(observations[0]?.originKey).toBe(response.body.origin.stationId);
    expect(observations[0]?.originName).toBe(response.body.origin.name);
    expect(observations[0]?.lineCodes.length).toBeGreaterThan(0);

    // A signed-out plan still answers and cannot write a row for this rider.
    const anonymous = await request(app).get(
      "/api/routes/plan?origin=Bundaran%20HI&destination=Kelapa%20Gading",
    );
    expect(anonymous.status).toBe(200);
    expect(
      await listRecentObservations(db, rider.userId, new Date(Date.now() - 60_000)),
    ).toHaveLength(1);
  });

  it("needs three observations, not two", async () => {
    const rider = await createRider();
    const destinationKey = `fixture_rider_destination_${randomUUID()}`;
    for (const minute of [480, 500, 520]) {
      const result = await insertObservation(db, rider.userId, {
        originKey: station.id,
        destinationKey,
        originName: station.name,
        destinationName: "Senen",
        lineCodes: ["9"],
        weekday: 1,
        minuteOfDay: minute,
        source: "plan",
      });
      expect(result.inserted).toBe(true);
    }

    const observations = await listRecentObservations(
      db,
      rider.userId,
      new Date(Date.now() - 28 * 24 * 60 * 60_000),
    );
    const habits = habitsFrom(observations, new Date());
    expect(habits).toHaveLength(1);
    expect(habits[0]?.count).toBe(3);
    expect(habits[0]?.weekday).toBe(1);
    expect(habits[0]?.minuteOfDay).toBe(500);

    const sparse = await createRider();
    const sparseDestination = `fixture_rider_destination_${randomUUID()}`;
    for (const minute of [480, 500]) {
      await insertObservation(db, sparse.userId, {
        originKey: station.id,
        destinationKey: sparseDestination,
        originName: station.name,
        destinationName: "Senen",
        lineCodes: ["9"],
        weekday: 1,
        minuteOfDay: minute,
        source: "plan",
      });
    }
    const sparseObservations = await listRecentObservations(
      db,
      sparse.userId,
      new Date(Date.now() - 28 * 24 * 60 * 60_000),
    );
    expect(habitsFrom(sparseObservations, new Date())).toEqual([]);
  });

  it("shows a stored notice on the habit's line and hides another line's notice", async () => {
    const rider = await createRider();
    const now = new Date();
    const clock = jakartaDayClock(now);
    const destinationKey = `fixture_rider_destination_${randomUUID()}`;

    for (const minute of minutesAround(clock.minuteOfDay)) {
      await insertObservation(db, rider.userId, {
        originKey: station.id,
        destinationKey,
        originName: station.name,
        destinationName: "Senen",
        lineCodes: ["9"],
        weekday: clock.weekday,
        minuteOfDay: minute,
        source: "plan",
      });
    }

    const fixture = randomUUID();
    const inserted = await db
      .insert(disruptions)
      .values([
        {
          source: "fixture_rider",
          sourceType: "official",
          externalId: `fixture_rider_nine_${fixture}`,
          severity: "warning",
          status: "active",
          kind: "closure",
          title: `Fixture notice on 9 ${fixture}`,
          body: "A stored notice for the test.",
          publishedAt: now,
          scope: "line",
          lineCodes: ["9"],
        },
        {
          source: "fixture_rider",
          sourceType: "official",
          externalId: `fixture_rider_seven_${fixture}`,
          severity: "warning",
          status: "active",
          kind: "closure",
          title: `Fixture notice on 7 ${fixture}`,
          body: "A stored notice for another corridor.",
          publishedAt: now,
          scope: "line",
          lineCodes: ["7"],
        },
      ])
      .returning({ id: disruptions.id, title: disruptions.title });

    const nine = inserted.find((row) => row.title.includes("on 9"));
    const seven = inserted.find((row) => row.title.includes("on 7"));
    expect(nine).toBeDefined();
    expect(seven).toBeDefined();

    // No X client is constructed here and no token is set. The alert can only
    // come from the notice table the worker wrote.
    const response = await request(app).get("/api/account/alerts").set("Cookie", rider.cookie);
    expect(response.status).toBe(200);

    const body = response.body as AlertBody;
    expect(body.alerts).toHaveLength(1);
    expect(body.alerts[0]?.habit.originName).toBe(station.name);
    expect(body.alerts[0]?.habit.lineCodes).toContain("9");
    expect(body.alerts[0]?.notices.map((notice) => notice.id)).toContain(nine?.id);
    expect(body.alerts[0]?.notices.map((notice) => notice.id)).not.toContain(seven?.id);
  });

  it("returns an empty list when no habit is due now", async () => {
    const rider = await createRider();
    const response = await request(app).get("/api/account/alerts").set("Cookie", rider.cookie);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ alerts: [] });
  });
});

/** A store that lives only for one test, sharing the shape of the real one. */
function memoryNewsStore(): NewsCacheStore {
  const rows = new Map<string, { value: NewsResult[]; expiresAt: Date }>();
  return {
    read: async (key) => {
      const row = rows.get(key);
      if (!row || row.expiresAt.getTime() <= Date.now()) return null;
      return row.value;
    },
    write: async (key, value, expiresAt) => {
      rows.set(key, { value, expiresAt });
    },
  };
}

describe("the shared news cache", () => {
  it("ignores word order and case, and keeps a different corridor separate", async () => {
    let calls = 0;
    const search: NewsSearch = async (options) => {
      calls += 1;
      return [
        {
          title: options.query,
          url: "https://example.test/notice",
          content: "A stored result.",
          source: "example.test",
          publishedAt: null,
          score: null,
        },
      ];
    };

    const store = memoryNewsStore();
    const work = new SharedWork(2);
    const cached = cachedNewsSearch(search, work, 60_000, store);
    expect(cached).not.toBeNull();
    if (!cached) return;

    const first = await cached({ query: "koridor 9 ditutup", timeRange: "day" });
    const second = await cached({ query: "ditutup koridor 9", timeRange: "day" });
    expect(calls).toBe(1);
    expect(second).toEqual(first);

    // A single-digit corridor number is meaningful, not a stop word.
    await cached({ query: "koridor 7 ditutup", timeRange: "day" });
    expect(calls).toBe(2);

    // The time range is part of the question, so it is part of the key.
    await cached({ query: "koridor 9 ditutup", timeRange: "week" });
    expect(calls).toBe(3);

    // A restarted process with the same store reads the answer without
    // paying for it again.
    const restarted = cachedNewsSearch(search, new SharedWork(2), 60_000, store);
    expect(restarted).not.toBeNull();
    if (!restarted) return;
    await restarted({ query: "Koridor 9, ditutup!", timeRange: "day" });
    expect(calls).toBe(3);
  });
});
