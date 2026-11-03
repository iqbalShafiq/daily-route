import { and, desc, eq, gt, gte, lt, sql } from "drizzle-orm";

import { memoryPlaceOf, type MemoryPlace } from "./account.js";
import type { Database } from "./client.js";
import {
  riderObservations,
  riderPlaces,
  stations,
  systems,
  toolResultCache,
  users,
} from "./schema.js";

/**
 * Rider personalization queries.
 *
 * A rider can name a place, the server records the journeys they plan, and a
 * habit is derived later by the pure functions in `@daily-route/transit`.
 * None of these rows points at a station: `db:seed` truncates the network,
 * and the rider's places and observations must survive it. A station id in a
 * payload is looked up when it is written, not held as a key.
 */

/** How many named places one account may keep. Enforced on every write. */
export const RIDER_PLACE_CAP = 16;

/** A label is the rider's own word for a place, short enough to read. */
const LABEL_MAX_LENGTH = 32;

/** A reload inside this window is the same journey, not a new habit. */
const OBSERVATION_DEDUPE_MS = 2 * 60 * 60_000;

/** The bucket the duplicate test uses. */
const OBSERVATION_BUCKET_MINUTES = 15;

export type RiderPlace = {
  label: string;
  place: MemoryPlace;
  updatedAt: string;
};

export type RiderPlaceFailureReason =
  "invalid-label" | "invalid-place" | "unknown-station" | "too-many";

export type UpsertRiderPlaceResult =
  { ok: true; places: RiderPlace[] } | { ok: false; reason: RiderPlaceFailureReason; id?: string };

export type RiderObservationSource = "plan" | "chat";

export type RiderObservationInput = {
  originKey: string;
  destinationKey: string;
  originName: string;
  destinationName: string;
  originLabel?: string | null;
  destinationLabel?: string | null;
  lineCodes: string[];
  /** 0 Sunday … 6 Saturday, Asia/Jakarta. */
  weekday: number;
  minuteOfDay: number;
  source: RiderObservationSource;
};

export type StoredRiderObservation = {
  id: string;
  originKey: string;
  destinationKey: string;
  originName: string;
  destinationName: string;
  originLabel: string | null;
  destinationLabel: string | null;
  lineCodes: string[];
  weekday: number;
  minuteOfDay: number;
  source: RiderObservationSource;
  /** The instant the journey was planned, as an ISO string. */
  at: string;
};

/** The rider's named places, ordered by label the way a list reads. */
export async function listRiderPlaces(db: Database, userId: string): Promise<RiderPlace[]> {
  const rows = await db
    .select({
      label: riderPlaces.label,
      payload: riderPlaces.payload,
      updatedAt: riderPlaces.updatedAt,
    })
    .from(riderPlaces)
    .where(eq(riderPlaces.userId, userId))
    .orderBy(sql`lower(${riderPlaces.label})`);

  const places: RiderPlace[] = [];
  for (const row of rows) {
    const place = memoryPlaceOf(row.payload);
    // A payload this application wrote is always a place; a row it cannot
    // read is skipped rather than allowed to break the whole list.
    if (!place) continue;
    places.push({ label: row.label, place, updatedAt: row.updatedAt.toISOString() });
  }
  return places;
}

/**
 * The labels a rider gave these two ends, if they named them.
 *
 * A habit can then say "Home" instead of only the stop name. A stop the
 * rider never named stays unlabeled; nothing here invents Home or Office.
 */
export async function labelsForPlaces(
  db: Database,
  userId: string,
  originKey: string,
  destinationKey: string,
): Promise<{ originLabel: string | null; destinationLabel: string | null }> {
  const places = await listRiderPlaces(db, userId);
  return {
    originLabel: places.find((entry) => entry.place.id === originKey)?.label ?? null,
    destinationLabel: places.find((entry) => entry.place.id === destinationKey)?.label ?? null,
  };
}

/**
 * Save a label, replacing the row whose label differs only in case.
 *
 * The station name and coordinate come from the station row, not from the
 * caller, so a rider can never pin a named place to a stop it does not have.
 * The cap is counted inside the same transaction and behind a lock on the
 * user row, so two tabs cannot both see fifteen and write the sixteenth.
 */
export async function upsertRiderPlace(
  db: Database,
  userId: string,
  input: { label: string; payload: unknown },
): Promise<UpsertRiderPlaceResult> {
  const label = labelOf(input.label);
  if (label === null) return { ok: false, reason: "invalid-label" };

  const resolved = await resolvePlacePayload(db, input.payload);
  if (!resolved.ok) return resolved;

  const outcome = await db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");

    // The same `lower()` the unique index uses decides which row is replaced,
    // so the database and the writer cannot disagree about case.
    const existing = await tx
      .select({ id: riderPlaces.id })
      .from(riderPlaces)
      .where(
        and(eq(riderPlaces.userId, userId), sql`lower(${riderPlaces.label}) = lower(${label})`),
      )
      .limit(1);
    const live = await tx
      .select({ id: riderPlaces.id })
      .from(riderPlaces)
      .where(eq(riderPlaces.userId, userId));

    if (existing.length === 0 && live.length >= RIDER_PLACE_CAP) {
      return { ok: false as const };
    }

    const now = new Date();
    const row = existing[0];
    if (row) {
      await tx
        .update(riderPlaces)
        .set({ label, payload: resolved.place, updatedAt: now })
        .where(eq(riderPlaces.id, row.id));
    } else {
      await tx.insert(riderPlaces).values({
        userId,
        label,
        payload: resolved.place,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { ok: true as const };
  });

  if (!outcome.ok) return { ok: false, reason: "too-many" };
  return { ok: true, places: await listRiderPlaces(db, userId) };
}

/** Remove a label, whatever its case. */
export async function deleteRiderPlace(
  db: Database,
  userId: string,
  label: string,
): Promise<boolean> {
  const trimmed = label.trim();
  if (trimmed.length === 0) return false;
  const removed = await db
    .delete(riderPlaces)
    .where(
      and(eq(riderPlaces.userId, userId), sql`lower(${riderPlaces.label}) = lower(${trimmed})`),
    )
    .returning({ id: riderPlaces.id });
  return removed.length > 0;
}

/**
 * Record a planned journey.
 *
 * A duplicate in the same fifteen-minute bucket, for the same pair and
 * weekday within two hours, is a reload of one journey rather than a second
 * habit. A label is taken from the rider's named places when the caller did
 * not supply one, so "Home" follows the place the rider actually named.
 */
export async function insertObservation(
  db: Database,
  userId: string,
  observation: RiderObservationInput,
): Promise<{ inserted: boolean }> {
  assertObservation(observation);

  const bucketStart =
    Math.floor(observation.minuteOfDay / OBSERVATION_BUCKET_MINUTES) * OBSERVATION_BUCKET_MINUTES;
  const since = new Date(Date.now() - OBSERVATION_DEDUPE_MS);

  const duplicate = await db
    .select({ id: riderObservations.id })
    .from(riderObservations)
    .where(
      and(
        eq(riderObservations.userId, userId),
        eq(riderObservations.originKey, observation.originKey),
        eq(riderObservations.destinationKey, observation.destinationKey),
        eq(riderObservations.weekday, observation.weekday),
        gte(riderObservations.minuteOfDay, bucketStart),
        lt(riderObservations.minuteOfDay, bucketStart + OBSERVATION_BUCKET_MINUTES),
        gte(riderObservations.createdAt, since),
      ),
    )
    .limit(1);
  if (duplicate.length > 0) return { inserted: false };

  const labels = await riderLabelsByStation(db, userId);
  const originLabel =
    nonEmpty(observation.originLabel) ?? labels.get(observation.originKey) ?? null;
  const destinationLabel =
    nonEmpty(observation.destinationLabel) ?? labels.get(observation.destinationKey) ?? null;

  await db.insert(riderObservations).values({
    userId,
    originKey: observation.originKey,
    destinationKey: observation.destinationKey,
    originName: observation.originName,
    destinationName: observation.destinationName,
    originLabel,
    destinationLabel,
    lineCodes: observation.lineCodes,
    weekday: observation.weekday,
    minuteOfDay: observation.minuteOfDay,
    source: observation.source,
  });

  return { inserted: true };
}

/** The rider's observations newer than an instant, newest first, up to 200. */
export async function listRecentObservations(
  db: Database,
  userId: string,
  since: Date,
): Promise<StoredRiderObservation[]> {
  const rows = await db
    .select({
      id: riderObservations.id,
      originKey: riderObservations.originKey,
      destinationKey: riderObservations.destinationKey,
      originName: riderObservations.originName,
      destinationName: riderObservations.destinationName,
      originLabel: riderObservations.originLabel,
      destinationLabel: riderObservations.destinationLabel,
      lineCodes: riderObservations.lineCodes,
      weekday: riderObservations.weekday,
      minuteOfDay: riderObservations.minuteOfDay,
      source: riderObservations.source,
      createdAt: riderObservations.createdAt,
    })
    .from(riderObservations)
    .where(and(eq(riderObservations.userId, userId), gte(riderObservations.createdAt, since)))
    .orderBy(desc(riderObservations.createdAt))
    .limit(200);

  return rows.map((row) => ({
    id: row.id,
    originKey: row.originKey,
    destinationKey: row.destinationKey,
    originName: row.originName,
    destinationName: row.destinationName,
    originLabel: row.originLabel,
    destinationLabel: row.destinationLabel,
    lineCodes: stringList(row.lineCodes),
    weekday: row.weekday,
    minuteOfDay: row.minuteOfDay,
    source: row.source === "chat" ? "chat" : "plan",
    at: row.createdAt.toISOString(),
  }));
}

/** A public tool result, or null when the row has expired or is absent. */
export async function readToolCache(db: Database, key: string): Promise<unknown> {
  const rows = await db
    .select({ value: toolResultCache.value })
    .from(toolResultCache)
    .where(and(eq(toolResultCache.cacheKey, key), gt(toolResultCache.expiresAt, new Date())))
    .limit(1);
  return rows[0]?.value ?? null;
}

/** Store a public tool result until an instant. */
export async function writeToolCache(
  db: Database,
  key: string,
  value: unknown,
  expiresAt: Date,
): Promise<void> {
  await db.insert(toolResultCache).values({ cacheKey: key, value, expiresAt }).onConflictDoUpdate({
    target: toolResultCache.cacheKey,
    set: { value, expiresAt },
  });
}

type ResolvedPlacePayload =
  | { ok: true; place: MemoryPlace }
  | { ok: false; reason: "invalid-place" | "unknown-station"; id?: string };

/**
 * Ground a named place against the network.
 *
 * A station place takes its name and coordinate from the station row. A free
 * place is stored as the caller described it; only its shape is checked. A
 * station id the network does not have is a failure with that id, so the API
 * can say which stop was wrong.
 */
async function resolvePlacePayload(db: Database, payload: unknown): Promise<ResolvedPlacePayload> {
  if (!isRecord(payload)) return { ok: false, reason: "invalid-place" };

  const kind = payload["kind"];
  const id = typeof payload["id"] === "string" ? payload["id"] : "";

  if (kind === "station") {
    if (id.length === 0) return { ok: false, reason: "invalid-place" };
    const place = await loadStationPlace(db, id);
    if (!place) return { ok: false, reason: "unknown-station", id };
    return { ok: true, place };
  }

  if (kind === "place") {
    const place = memoryPlaceOf(payload);
    if (!place) {
      return {
        ok: false,
        reason: "invalid-place",
        ...(id.length > 0 ? { id } : {}),
      };
    }
    return { ok: true, place };
  }

  return {
    ok: false,
    reason: "invalid-place",
    ...(id.length > 0 ? { id } : {}),
  };
}

async function loadStationPlace(db: Database, id: string): Promise<MemoryPlace | null> {
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
  const row = rows[0];
  if (!row) return null;
  return { kind: "station", ...row };
}

/** The label a rider gave to each station place, by station id. */
async function riderLabelsByStation(db: Database, userId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ label: riderPlaces.label, payload: riderPlaces.payload })
    .from(riderPlaces)
    .where(eq(riderPlaces.userId, userId));

  const labels = new Map<string, string>();
  for (const row of rows) {
    const place = memoryPlaceOf(row.payload);
    if (place?.kind === "station") labels.set(place.id, row.label);
  }
  return labels;
}

function labelOf(value: string): string | null {
  const label = value.trim();
  if (label.length === 0 || label.length > LABEL_MAX_LENGTH) return null;
  // A label made only of punctuation is not a name the rider can recognise.
  if (!/[\p{L}\p{N}]/u.test(label)) return null;
  return label;
}

function assertObservation(observation: RiderObservationInput): void {
  if (observation.originKey.length === 0 || observation.destinationKey.length === 0) {
    throw new Error("An observation needs an origin and a destination key.");
  }
  if (
    !Number.isInteger(observation.weekday) ||
    observation.weekday < 0 ||
    observation.weekday > 6
  ) {
    throw new Error("An observation weekday must be 0 (Sunday) to 6 (Saturday).");
  }
  if (
    !Number.isInteger(observation.minuteOfDay) ||
    observation.minuteOfDay < 0 ||
    observation.minuteOfDay > 1439
  ) {
    throw new Error("An observation minute of day must be 0 to 1439.");
  }
}

function nonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
