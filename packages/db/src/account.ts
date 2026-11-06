import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";

import type { Database } from "./client.js";
import { riderMemoryItems, sessions, stations, systems, users } from "./schema.js";

/**
 * Account queries.
 *
 * The transit network lives in `queries.ts`; this module owns the rider's
 * account, the cookie session and the memory items the browser syncs. It
 * takes the database as an argument like every other query, so a test can
 * run it against the real database without a module-level connection.
 */

export const MEMORY_KINDS = ["saved-place", "recent-place", "recent-journey", "watch"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

/** How many live items one account may keep for each kind. */
export const MEMORY_CAPS: Record<MemoryKind, number> = {
  "saved-place": 8,
  "recent-place": 8,
  "recent-journey": 6,
  watch: 12,
};

export type MemoryPlace = {
  kind: "station" | "place";
  id: string;
  name: string;
  /** The full address a marked current location carries, when there is one. */
  address: string | null;
  latitude: number;
  longitude: number;
  systemId: string | null;
  systemName: string | null;
};

export type MemoryJourney = {
  originName: string;
  destinationName: string;
  origin: MemoryPlace | null;
  destination: MemoryPlace | null;
};

export type MemoryWatch = {
  key: string;
  origin: string;
  destination: string;
  lines: string[];
  savedAt: string;
};

export type MemoryPayload = MemoryPlace | MemoryJourney | MemoryWatch;

export type AccountUser = { id: string; email: string };

export type StoredMemoryItem = {
  kind: MemoryKind;
  itemKey: string;
  payload: MemoryPayload;
  updatedAt: string;
  deletedAt: string | null;
};

export type StoredUser = { id: string; email: string; passwordHash: string };

export type InsertUserResult =
  | { ok: true; user: AccountUser }
  | { ok: false; reason: "email-taken" };

/** Insert an account, or report that the address is already in use. */
export async function insertUser(
  db: Database,
  input: { email: string; passwordHash: string },
): Promise<InsertUserResult> {
  try {
    const rows = await db
      .insert(users)
      .values({ email: input.email, passwordHash: input.passwordHash })
      .returning({ id: users.id, email: users.email });
    const row = rows[0];
    if (!row) {
      throw new Error("insertUser returned no row");
    }
    return { ok: true, user: row };
  } catch (error) {
    // A duplicate address is an expected answer, not a failure of the call.
    if (isUniqueViolation(error)) {
      return { ok: false, reason: "email-taken" };
    }
    throw error;
  }
}

export async function findUserByEmail(db: Database, email: string): Promise<StoredUser | null> {
  const rows = await db
    .select({ id: users.id, email: users.email, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return rows[0] ?? null;
}

export async function findUserById(db: Database, id: string): Promise<AccountUser | null> {
  const rows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** Replace the stored hash and move `updated_at` with it. */
export async function updatePassword(
  db: Database,
  userId: string,
  passwordHash: string,
): Promise<void> {
  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

/** Delete the account. Its sessions and memory rows cascade with it. */
export async function deleteUser(db: Database, userId: string): Promise<void> {
  await db.delete(users).where(eq(users.id, userId));
}

export async function insertSession(
  db: Database,
  input: { userId: string; tokenHash: string; expiresAt: Date },
): Promise<{ id: string }> {
  const rows = await db
    .insert(sessions)
    .values({
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
    })
    .returning({ id: sessions.id });
  const row = rows[0];
  if (!row) {
    throw new Error("insertSession returned no row");
  }
  return row;
}

export type AccountSession = {
  id: string;
  userId: string;
  email: string;
  expiresAt: Date;
};

/**
 * Resolve a cookie by the hash of its token.
 *
 * An expired session is not found even though its row still exists; the
 * expiry is part of the lookup, not a check the caller has to remember.
 */
export async function findSession(
  db: Database,
  tokenHash: string,
): Promise<AccountSession | null> {
  const rows = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      email: users.email,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ?? null;
}

/** Slide the activity mark and the expiry of a session the rider still uses. */
export async function touchSession(
  db: Database,
  id: string,
  input: { lastSeenAt: Date; expiresAt: Date },
): Promise<void> {
  await db
    .update(sessions)
    .set({ lastSeenAt: input.lastSeenAt, expiresAt: input.expiresAt })
    .where(eq(sessions.id, id));
}

export async function deleteSession(db: Database, id: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, id));
}

/**
 * The account's live memory, or the rows that moved after an instant.
 *
 * With `after` the tombstones are included: that is how a browser learns
 * that an item the server used to hold has been removed. A row whose
 * payload does not match its kind is skipped, not thrown, so one bad write
 * cannot break the whole sync.
 */
export async function listMemory(
  db: Database,
  userId: string,
  after?: Date,
): Promise<StoredMemoryItem[]> {
  const rows = await db
    .select({
      kind: riderMemoryItems.kind,
      itemKey: riderMemoryItems.itemKey,
      payload: riderMemoryItems.payload,
      updatedAt: riderMemoryItems.updatedAt,
      deletedAt: riderMemoryItems.deletedAt,
    })
    .from(riderMemoryItems)
    .where(
      and(
        eq(riderMemoryItems.userId, userId),
        after ? gt(riderMemoryItems.updatedAt, after) : isNull(riderMemoryItems.deletedAt),
      ),
    )
    .orderBy(desc(riderMemoryItems.updatedAt));

  const items: StoredMemoryItem[] = [];
  for (const row of rows) {
    if (!isMemoryKind(row.kind)) continue;
    const payload = parseMemoryPayload(row.kind, row.payload);
    if (!payload) continue;
    items.push({
      kind: row.kind,
      itemKey: row.itemKey,
      payload,
      updatedAt: row.updatedAt.toISOString(),
      deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    });
  }
  return items;
}

export type MemoryWrite = {
  kind: MemoryKind;
  itemKey: string;
  payload?: MemoryPayload;
  deleted: boolean;
};

export type MemoryWriteFailure =
  | { ok: false; reason: "unknown-station"; id: string }
  | { ok: false; reason: "invalid-place"; id: string }
  | { ok: false; reason: "invalid-journey"; id: string }
  | { ok: false; reason: "invalid-watch"; id: string };

export type UpsertMemoryResult =
  | { ok: true; items: StoredMemoryItem[] }
  | MemoryWriteFailure;

type ResolvedWrite =
  | { kind: MemoryKind; itemKey: string; deleted: true; payload: MemoryPayload | null }
  | { kind: MemoryKind; itemKey: string; deleted: false; payload: MemoryPayload };

/**
 * Write a batch of memory items and answer with the live snapshot.
 *
 * The station rows own the name and the coordinate of a station place, so a
 * caller cannot pin a station to a point of its own. A deleted write is a
 * tombstone; the oldest rows above the cap are tombstoned too, never
 * hard-deleted, because the browser still has to learn they are gone.
 */
export async function upsertMemory(
  db: Database,
  userId: string,
  items: MemoryWrite[],
): Promise<UpsertMemoryResult> {
  const resolved: ResolvedWrite[] = [];
  for (const item of items) {
    const result = await resolveWrite(db, item);
    if (!result.ok) {
      // Nothing has been written yet, so a bad station in the middle of a
      // batch leaves the account exactly as it was.
      return result.failure;
    }
    resolved.push(result.write);
  }

  const now = new Date();
  const touched = new Set<MemoryKind>();

  await db.transaction(async (tx) => {
    for (const write of resolved) {
      touched.add(write.kind);
      if (write.deleted) {
        // An update, not an upsert: tombstoning a key the account never
        // had would create a row the browser cannot read.
        await tx
          .update(riderMemoryItems)
          .set({
            deletedAt: now,
            updatedAt: now,
            ...(write.payload ? { payload: write.payload } : {}),
          })
          .where(
            and(
              eq(riderMemoryItems.userId, userId),
              eq(riderMemoryItems.kind, write.kind),
              eq(riderMemoryItems.itemKey, write.itemKey),
            ),
          );
        continue;
      }
      await tx
        .insert(riderMemoryItems)
        .values({
          userId,
          kind: write.kind,
          itemKey: write.itemKey,
          payload: write.payload,
          deletedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [riderMemoryItems.userId, riderMemoryItems.kind, riderMemoryItems.itemKey],
          set: { payload: write.payload, deletedAt: null, updatedAt: now },
        });
    }

    for (const kind of touched) {
      const live = await tx
        .select({ id: riderMemoryItems.id })
        .from(riderMemoryItems)
        .where(
          and(
            eq(riderMemoryItems.userId, userId),
            eq(riderMemoryItems.kind, kind),
            isNull(riderMemoryItems.deletedAt),
          ),
        )
        .orderBy(desc(riderMemoryItems.updatedAt), desc(riderMemoryItems.createdAt));
      const overflow = live.slice(MEMORY_CAPS[kind]).map((row) => row.id);
      if (overflow.length > 0) {
        await tx
          .update(riderMemoryItems)
          // The tombstone moves to the front of the sync window, or the
          // browser would keep showing an item the server has dropped.
          .set({ deletedAt: now, updatedAt: now })
          .where(inArray(riderMemoryItems.id, overflow));
      }
    }
  });

  return { ok: true, items: await listMemory(db, userId) };
}

type ResolvedPlace =
  | { ok: true; place: MemoryPlace }
  | { ok: false; failure: MemoryWriteFailure };

async function resolveWrite(
  db: Database,
  item: MemoryWrite,
): Promise<{ ok: true; write: ResolvedWrite } | { ok: false; failure: MemoryWriteFailure }> {
  if (item.deleted && item.payload === undefined) {
    return { ok: true, write: tombstoneOf(item) };
  }
  const payload = item.payload;
  if (payload === undefined) {
    return { ok: false, failure: invalidPayload(item.kind, item.itemKey) };
  }

  switch (item.kind) {
    case "saved-place":
    case "recent-place": {
      const place = await resolvePlace(db, payload, item.itemKey);
      if (!place.ok) return place;
      return {
        ok: true,
        write: {
          kind: item.kind,
          itemKey: item.itemKey,
          deleted: item.deleted,
          payload: place.place,
        },
      };
    }
    case "recent-journey": {
      const journey = await resolveJourney(db, payload, item.itemKey);
      if (!journey.ok) return journey;
      return {
        ok: true,
        write: {
          kind: item.kind,
          itemKey: item.itemKey,
          deleted: item.deleted,
          payload: journey.journey,
        },
      };
    }
    case "watch": {
      const watch = memoryWatchOf(payload);
      if (!watch || watch.key !== item.itemKey) {
        return { ok: false, failure: invalidPayload("watch", item.itemKey) };
      }
      return {
        ok: true,
        write: {
          kind: "watch",
          itemKey: item.itemKey,
          deleted: item.deleted,
          payload: watch,
        },
      };
    }
  }
}

function tombstoneOf(item: MemoryWrite): ResolvedWrite {
  return {
    kind: item.kind,
    itemKey: item.itemKey,
    deleted: true,
    payload: null,
  };
}

function invalidPayload(kind: MemoryKind, id: string): MemoryWriteFailure {
  if (kind === "watch") return { ok: false, reason: "invalid-watch", id };
  if (kind === "recent-journey") return { ok: false, reason: "invalid-journey", id };
  return { ok: false, reason: "invalid-place", id };
}

async function resolveJourney(
  db: Database,
  value: unknown,
  itemKey: string,
): Promise<{ ok: true; journey: MemoryJourney } | { ok: false; failure: MemoryWriteFailure }> {
  if (!isRecord(value)) {
    return { ok: false, failure: { ok: false, reason: "invalid-journey", id: itemKey } };
  }
  const originName = value["originName"];
  const destinationName = value["destinationName"];
  if (!isNonEmptyString(originName) || !isNonEmptyString(destinationName)) {
    return { ok: false, failure: { ok: false, reason: "invalid-journey", id: itemKey } };
  }

  const origin = await resolveEndpoint(db, value["origin"], itemKey);
  if (!origin.ok) return { ok: false, failure: origin.failure };
  const destination = await resolveEndpoint(db, value["destination"], itemKey);
  if (!destination.ok) return { ok: false, failure: destination.failure };

  return {
    ok: true,
    journey: {
      originName,
      destinationName,
      origin: origin.place,
      destination: destination.place,
    },
  };
}

type ResolvedEndpoint =
  | { ok: true; place: MemoryPlace | null }
  | { ok: false; failure: MemoryWriteFailure };

async function resolveEndpoint(
  db: Database,
  value: unknown,
  fallbackId: string,
): Promise<ResolvedEndpoint> {
  if (value === null) return { ok: true, place: null };
  return resolvePlace(db, value, fallbackId);
}

/**
 * Ground a place against the network.
 *
 * A station place takes its name and coordinate from the station row, not
 * from the caller; a free place is stored as the caller validated it. A
 * station id the network does not have is a failure, so the whole batch
 * stops before any write.
 */
async function resolvePlace(
  db: Database,
  value: unknown,
  fallbackId: string,
): Promise<ResolvedPlace> {
  if (!isRecord(value)) {
    return { ok: false, failure: { ok: false, reason: "invalid-place", id: fallbackId } };
  }
  const id = typeof value["id"] === "string" ? value["id"] : "";
  const kind = value["kind"];

  if (kind === "station") {
    if (id.length === 0) {
      return { ok: false, failure: { ok: false, reason: "invalid-place", id: fallbackId } };
    }
    const station = await loadStation(db, id);
    if (!station) {
      return { ok: false, failure: { ok: false, reason: "unknown-station", id } };
    }
    return {
      ok: true,
      place: {
        kind: "station",
        id: station.id,
        name: station.name,
        address: null,
        latitude: station.latitude,
        longitude: station.longitude,
        systemId: station.systemId,
        systemName: station.systemName,
      },
    };
  }

  if (kind === "place") {
    const place = memoryPlaceOf(value);
    if (!place) {
      return { ok: false, failure: { ok: false, reason: "invalid-place", id: id || fallbackId } };
    }
    return { ok: true, place };
  }

  return { ok: false, failure: { ok: false, reason: "invalid-place", id: id || fallbackId } };
}

type StationTruth = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  systemId: string;
  systemName: string;
};

async function loadStation(db: Database, id: string): Promise<StationTruth | null> {
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
    .where(eq(stations.id, id))
    .limit(1);
  return rows[0] ?? null;
}

function parseMemoryPayload(kind: MemoryKind, value: unknown): MemoryPayload | null {
  switch (kind) {
    case "saved-place":
    case "recent-place":
      return memoryPlaceOf(value);
    case "recent-journey":
      return memoryJourneyOf(value);
    case "watch":
      return memoryWatchOf(value);
  }
}

/**
 * Narrow a stored place payload.
 *
 * The same shape is reused by the rider's named places, so the parser is
 * exported rather than copied: one definition of a place is enough.
 */
export function memoryPlaceOf(value: unknown): MemoryPlace | null {
  if (!isRecord(value)) return null;
  const kind = value["kind"];
  if (kind !== "station" && kind !== "place") return null;
  const id = value["id"];
  const name = value["name"];
  const latitude = value["latitude"];
  const longitude = value["longitude"];
  if (!isNonEmptyString(id) || !isNonEmptyString(name)) return null;
  if (typeof latitude !== "number" || !Number.isFinite(latitude)) return null;
  if (typeof longitude !== "number" || !Number.isFinite(longitude)) return null;
  return {
    kind,
    id,
    name,
    address: typeof value["address"] === "string" ? value["address"] : null,
    latitude,
    longitude,
    systemId: typeof value["systemId"] === "string" ? value["systemId"] : null,
    systemName: typeof value["systemName"] === "string" ? value["systemName"] : null,
  };
}

function memoryJourneyOf(value: unknown): MemoryJourney | null {
  if (!isRecord(value)) return null;
  const originName = value["originName"];
  const destinationName = value["destinationName"];
  if (!isNonEmptyString(originName) || !isNonEmptyString(destinationName)) return null;

  const originValue = value["origin"];
  const destinationValue = value["destination"];
  const origin = originValue === null ? null : memoryPlaceOf(originValue);
  const destination = destinationValue === null ? null : memoryPlaceOf(destinationValue);
  if (originValue !== null && !origin) return null;
  if (destinationValue !== null && !destination) return null;

  return { originName, destinationName, origin, destination };
}

function memoryWatchOf(value: unknown): MemoryWatch | null {
  if (!isRecord(value)) return null;
  const key = value["key"];
  const origin = value["origin"];
  const destination = value["destination"];
  const savedAt = value["savedAt"];
  if (!isNonEmptyString(key) || !isNonEmptyString(origin) || !isNonEmptyString(destination)) {
    return null;
  }
  if (!isNonEmptyString(savedAt)) return null;

  const rawLines = value["lines"];
  if (!Array.isArray(rawLines)) return null;
  const lines: string[] = [];
  for (const line of rawLines) {
    if (typeof line !== "string") return null;
    lines.push(line);
  }

  return { key, origin, destination, lines, savedAt };
}

function isMemoryKind(value: string): value is MemoryKind {
  return MEMORY_KINDS.some((kind) => kind === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** PostgreSQL reports a unique violation with SQLSTATE 23505. */
function isUniqueViolation(error: unknown): boolean {
  // Drizzle wraps a driver error in a `DrizzleQueryError`, so the SQLSTATE
  // sits on the cause chain rather than on the value that reaches the catch.
  let current: unknown = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current !== "object" || current === null) return false;
    if ("code" in current && (current as { code?: unknown }).code === "23505") {
      return true;
    }
    if (!("cause" in current)) return false;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
