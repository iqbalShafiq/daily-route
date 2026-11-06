import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { NetworkCache } from "@daily-route/agent";
import { createDb, findUserByEmail, sessions, stations } from "@daily-route/db";
import { parseEnv } from "@daily-route/env";
import { createEmbeddingProvider, PlaceResolver } from "@daily-route/semantic";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import { createAttemptLimiter } from "./attempts.js";
import type { ApiDeps } from "./deps.js";

/**
 * The account endpoints, against the real database and a real cookie jar.
 *
 * Every test owns its rows through the unique `fixture_auth_` address and
 * the delete in `afterAll`; the suite never truncates a table the worker
 * shares. The limiter is generous here so one test cannot trip another, and
 * the limiter test builds its own small app with a limit of two.
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

const PASSWORD = "correct horse battery";
const NEW_PASSWORD = "another quiet morning";

type Browser = InstanceType<typeof request.agent>;

type StoredItem = {
  kind: string;
  itemKey: string;
  payload: { id: string; name: string };
  deletedAt: string | null;
};

type StationFixture = { id: string; name: string };

let station: StationFixture;

beforeAll(async () => {
  const rows = await db.select({ id: stations.id, name: stations.name }).from(stations).limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error("The database is empty. Run `pnpm db:seed` before the tests.");
  }
  station = row;
});

afterAll(async () => {
  await db.execute(`DELETE FROM users WHERE email LIKE 'fixture_auth_%@example.test'`);
  await db.$client.end({ timeout: 5 });
});

function uniqueEmail(): string {
  return `fixture_auth_${randomUUID()}@example.test`;
}

function signUp(agent: Browser, email: string, password: string = PASSWORD): request.Test {
  return agent
    .post("/api/account")
    .set("Origin", env.WEB_ORIGIN)
    .send({ email, password });
}

function signIn(agent: Browser, email: string, password: string = PASSWORD): request.Test {
  return agent
    .post("/api/account/session")
    .set("Origin", env.WEB_ORIGIN)
    .send({ email, password });
}

function saveMemory(agent: Browser, items: unknown[]): request.Test {
  return agent
    .put("/api/account/memory")
    .set("Origin", env.WEB_ORIGIN)
    .send({ items });
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

function freePlace(): Record<string, unknown> {
  return {
    kind: "place",
    id: `fixture_auth_place_${randomUUID()}`,
    name: "A free place",
    latitude: -6.2,
    longitude: 106.8,
    systemId: null,
    systemName: null,
  };
}

function itemsOf(body: { items: StoredItem[] }): StoredItem[] {
  return body.items;
}

function itemOf(items: StoredItem[], itemKey: string): StoredItem | undefined {
  return items.find((item) => item.itemKey === itemKey);
}

/** The `name=value` part of the session cookie a response sets. */
function cookiePairOf(response: request.Response): string {  const values = response.get("Set-Cookie");
  const first = values?.[0];
  if (!first) {
    throw new Error("The response did not set a session cookie.");
  }
  const pair = first.split(";")[0];
  if (!pair) {
    throw new Error("The session cookie has no value.");
  }
  return pair;
}

/** The activity mark of the one session the fixture user holds. */
async function lastSeenOf(userId: string): Promise<Date | undefined> {
  const rows = await db
    .select({ lastSeenAt: sessions.lastSeenAt })
    .from(sessions)
    .where(eq(sessions.userId, userId));
  return rows[0]?.lastSeenAt;
}

describe("sign-up", () => {
  it("creates the account, reads it back and refuses a request with no cookie", async () => {
    const agent = request.agent(app);
    const email = uniqueEmail();

    const created = await signUp(agent, email);
    expect(created.status).toBe(201);
    expect(created.body.user.email).toBe(email);

    const read = await agent.get("/api/account");
    expect(read.status).toBe(200);
    expect(read.body.user).toEqual({ id: created.body.user.id, email });

    const anonymous = await request(app).get("/api/account");
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error).toBe("Sign in to continue.");
  });

  it("refuses a second account for the same address, whatever its case", async () => {
    const email = uniqueEmail();
    expect((await signUp(request(app), email)).status).toBe(201);

    const duplicate = await signUp(request(app), `  ${email.toUpperCase()}  `);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toBe("That email is already registered.");
  });

  it("rejects a short password and a malformed address", async () => {
    const short = await signUp(request(app), uniqueEmail(), "short");
    expect(short.status).toBe(400);
    expect(short.body.error).toBe("Use at least 8 characters.");

    const eight = await signUp(request(app), uniqueEmail(), "Test@123");
    expect(eight.status).toBe(201);

    const malformed = await request(app)
      .post("/api/account")
      .set("Origin", env.WEB_ORIGIN)
      .send({ email: "not an address", password: PASSWORD });
    expect(malformed.status).toBe(400);
    expect(malformed.body.error).toBe("Enter a valid email.");
  });
});

describe("sign-in", () => {
  it("answers a wrong password and an unknown address the same way", async () => {
    const email = uniqueEmail();
    expect((await signUp(request(app), email)).status).toBe(201);

    const wrongPassword = await signIn(request(app), email, "the wrong password");
    expect(wrongPassword.status).toBe(401);

    const unknownEmail = await signIn(request(app), uniqueEmail());
    expect(unknownEmail.status).toBe(401);

    expect(wrongPassword.body.error).toBe(unknownEmail.body.error);
    expect(wrongPassword.body.error).toBe("Email or password is wrong.");
  });

  it("clears the session on sign-out so the old cookie no longer works", async () => {
    const agent = request.agent(app);
    const email = uniqueEmail();
    expect((await signUp(agent, email)).status).toBe(201);

    const signedIn = await signIn(agent, email);
    expect(signedIn.status).toBe(200);
    const cookie = cookiePairOf(signedIn);

    const signedOut = await agent
      .delete("/api/account/session")
      .set("Origin", env.WEB_ORIGIN);
    expect(signedOut.status).toBe(204);

    // The cookie the browser held before the sign-out is dead, not merely
    // forgotten by this agent.
    const reused = await request(app).get("/api/account").set("Cookie", cookie);
    expect(reused.status).toBe(401);
    expect((await agent.get("/api/account")).status).toBe(401);
  });

  it("signs out cleanly even when no session is named", async () => {
    const response = await request(app)
      .delete("/api/account/session")
      .set("Origin", env.WEB_ORIGIN);
    expect(response.status).toBe(204);
  });
});

describe("memory", () => {
  it("shows the same rider's saved place to a second signed-in browser", async () => {
    const email = uniqueEmail();
    const first = request.agent(app);
    expect((await signUp(first, email)).status).toBe(201);

    const saved = await saveMemory(first, [
      { kind: "saved-place", itemKey: "saved-shared", payload: freePlace() },
    ]);
    expect(saved.status).toBe(200);

    const second = request.agent(app);
    expect((await signIn(second, email)).status).toBe(200);
    const listed = await second.get("/api/account/memory");
    expect(listed.status).toBe(200);
    const items = itemsOf(listed.body);
    expect(itemOf(items, "saved-shared")).toBeDefined();
  });

  it("does not show one rider's place to another rider", async () => {
    const owner = request.agent(app);
    expect((await signUp(owner, uniqueEmail())).status).toBe(201);
    expect(
      (
        await saveMemory(owner, [
          { kind: "saved-place", itemKey: "saved-private", payload: freePlace() },
        ])
      ).status,
    ).toBe(200);

    const stranger = request.agent(app);
    expect((await signUp(stranger, uniqueEmail())).status).toBe(201);
    const listed = await stranger.get("/api/account/memory");
    expect(listed.status).toBe(200);
    expect(itemOf(itemsOf(listed.body), "saved-private")).toBeUndefined();
  });

  it("takes a station's name from the network, not from the caller", async () => {
    const agent = request.agent(app);
    expect((await signUp(agent, uniqueEmail())).status).toBe(201);

    const saved = await saveMemory(agent, [
      { kind: "saved-place", itemKey: "saved-station", payload: stationPlace("A name I made up") },
    ]);
    expect(saved.status).toBe(200);

    const item = itemOf(itemsOf(saved.body), "saved-station");
    expect(item).toBeDefined();
    expect(item?.payload.id).toBe(station.id);
    expect(item?.payload.name).toBe(station.name);
  });

  it("refuses a station the network does not have and stores nothing", async () => {
    const agent = request.agent(app);
    expect((await signUp(agent, uniqueEmail())).status).toBe(201);

    const refused = await saveMemory(agent, [
      {
        kind: "saved-place",
        itemKey: "saved-nowhere",
        payload: {
          ...stationPlace("Nowhere"),
          id: `fixture_auth_missing_${randomUUID()}`,
        },
      },
    ]);
    expect(refused.status).toBe(400);
    expect(refused.body.error).toBe("That stop is not on the network.");

    const listed = await agent.get("/api/account/memory");
    expect(itemOf(itemsOf(listed.body), "saved-nowhere")).toBeUndefined();
  });

  it("shows an unsaved place to another browser as a tombstone", async () => {
    const email = uniqueEmail();
    const owner = request.agent(app);
    expect((await signUp(owner, email)).status).toBe(201);
    expect(
      (
        await saveMemory(owner, [
          { kind: "saved-place", itemKey: "saved-going", payload: freePlace() },
        ])
      ).status,
    ).toBe(200);

    const other = request.agent(app);
    expect((await signIn(other, email)).status).toBe(200);

    // A minute before the unsave, so the tombstone is inside the window
    // even when the clock has not moved between the two requests.
    const after = new Date(Date.now() - 60_000).toISOString();

    const removed = await saveMemory(owner, [
      { kind: "saved-place", itemKey: "saved-going", deleted: true },
    ]);
    expect(removed.status).toBe(200);

    const synced = await other.get(`/api/account/memory?after=${encodeURIComponent(after)}`);
    expect(synced.status).toBe(200);
    const tombstone = itemOf(itemsOf(synced.body), "saved-going");
    expect(tombstone).toBeDefined();
    expect(tombstone?.deletedAt).not.toBeNull();

    const live = await other.get("/api/account/memory");
    expect(itemOf(itemsOf(live.body), "saved-going")).toBeUndefined();
  });

  it("keeps eight live saved places after the ninth", async () => {
    const agent = request.agent(app);
    expect((await signUp(agent, uniqueEmail())).status).toBe(201);

    const items = Array.from({ length: 9 }, (_, index) => ({
      kind: "saved-place",
      itemKey: `saved-${index + 1}`,
      payload: stationPlace(station.name),
    }));
    const saved = await saveMemory(agent, items);
    expect(saved.status).toBe(200);

    const listed = await agent.get("/api/account/memory");
    const places = itemsOf(listed.body).filter((item) => item.kind === "saved-place");
    expect(places).toHaveLength(8);
  });

  it("rejects an invalid after timestamp", async () => {
    const agent = request.agent(app);
    expect((await signUp(agent, uniqueEmail())).status).toBe(201);

    const response = await agent.get("/api/account/memory?after=yesterday");
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("That time is not valid.");
  });
});

describe("the session", () => {
  it("does not rewrite a fresh session on every read", async () => {
    const agent = request.agent(app);
    const email = uniqueEmail();
    expect((await signUp(agent, email)).status).toBe(201);

    const user = await findUserByEmail(db, email);
    expect(user).not.toBeNull();
    if (!user) return;

    const before = await lastSeenOf(user.id);
    expect(before).toBeDefined();

    expect((await agent.get("/api/account")).status).toBe(200);

    const after = await lastSeenOf(user.id);
    expect(after?.getTime()).toBe(before?.getTime());
  });

  it("slides a session that is within fifteen days of its end", async () => {
    const agent = request.agent(app);
    const email = uniqueEmail();
    expect((await signUp(agent, email)).status).toBe(201);

    const user = await findUserByEmail(db, email);
    expect(user).not.toBeNull();
    if (!user) return;

    // A session one day from its end is close enough to be extended by the
    // next read, instead of expiring in the middle of a rider's journey.
    const soon = new Date(Date.now() + 24 * 60 * 60_000);
    await db.update(sessions).set({ expiresAt: soon }).where(eq(sessions.userId, user.id));

    const read = await agent.get("/api/account");
    expect(read.status).toBe(200);
    expect(read.get("Set-Cookie")).toBeDefined();

    const rows = await db
      .select({ expiresAt: sessions.expiresAt })
      .from(sessions)
      .where(eq(sessions.userId, user.id));
    const expiresAt = rows[0]?.expiresAt;
    expect(expiresAt).toBeDefined();
    expect(expiresAt?.getTime() ?? 0).toBeGreaterThan(
      Date.now() + 29 * 24 * 60 * 60_000,
    );
  });
});

describe("password", () => {
  it("changes the password, refuses the old one and accepts the new one", async () => {
    const agent = request.agent(app);
    const email = uniqueEmail();
    expect((await signUp(agent, email)).status).toBe(201);

    const changed = await agent
      .post("/api/account/password")
      .set("Origin", env.WEB_ORIGIN)
      .send({ currentPassword: PASSWORD, password: NEW_PASSWORD });
    expect(changed.status).toBe(204);

    const old = await signIn(request(app), email, PASSWORD);
    expect(old.status).toBe(401);

    const fresh = await signIn(request(app), email, NEW_PASSWORD);
    expect(fresh.status).toBe(200);
  });

  it("refuses a password change with the wrong current password", async () => {
    const agent = request.agent(app);
    const email = uniqueEmail();
    expect((await signUp(agent, email)).status).toBe(201);

    const refused = await agent
      .post("/api/account/password")
      .set("Origin", env.WEB_ORIGIN)
      .send({ currentPassword: "not my password", password: NEW_PASSWORD });
    expect(refused.status).toBe(401);
    expect(refused.body.error).toBe("The current password is wrong.");

    // The account still answers to the password it had.
    expect((await signIn(request(app), email, PASSWORD)).status).toBe(200);
  });
});

describe("delete account", () => {
  it("requires the password, then kills the cookie and frees the address", async () => {
    const agent = request.agent(app);
    const email = uniqueEmail();
    expect((await signUp(agent, email)).status).toBe(201);

    const signedIn = await signIn(agent, email);
    expect(signedIn.status).toBe(200);
    const cookie = cookiePairOf(signedIn);

    const refused = await agent
      .delete("/api/account")
      .set("Origin", env.WEB_ORIGIN)
      .send({ password: "the wrong password" });
    expect(refused.status).toBe(401);
    expect(refused.body.error).toBe("The current password is wrong.");

    const removed = await agent
      .delete("/api/account")
      .set("Origin", env.WEB_ORIGIN)
      .send({ password: PASSWORD });
    expect(removed.status).toBe(204);

    const dead = await request(app).get("/api/account").set("Cookie", cookie);
    expect(dead.status).toBe(401);

    const registeredAgain = await signUp(request(app), email);
    expect(registeredAgain.status).toBe(201);
  });
});

describe("the origin check", () => {
  it("refuses a mutation that does not come from the web origin", async () => {
    const response = await request(app)
      .post("/api/account")
      .send({ email: uniqueEmail(), password: PASSWORD });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("This request was refused.");
  });

  it("still answers a read with no cookie and no origin", async () => {
    const systems = await request(app).get("/api/systems");
    expect(systems.status).toBe(200);

    const account = await request(app).get("/api/account");
    expect(account.status).toBe(401);
  });
});

describe("the attempt limiter", () => {
  it("answers 429 on the third failed sign-in when the limit is two", async () => {
    const limited = createApp({
      ...deps,
      attempts: createAttemptLimiter(2, 60_000),
  jpos: null,
    });
    const email = uniqueEmail();
    expect((await signUp(request(app), email)).status).toBe(201);

    const first = await signIn(request(limited), email, "the wrong password one");
    expect(first.status).toBe(401);

    const second = await signIn(request(limited), email, "the wrong password two");
    expect(second.status).toBe(401);

    const third = await signIn(request(limited), email, "the wrong password three");
    expect(third.status).toBe(429);
    expect(third.body.error).toBe("Too many attempts. Try again later.");
  });
});
