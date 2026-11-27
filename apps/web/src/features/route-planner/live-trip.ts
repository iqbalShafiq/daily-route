import type { Itinerary } from "../../lib/api.js";
import { transitModeTokenOf, type TransitModeTokenId } from "../../lib/format.js";

import type { ChosenPlace } from "./place-memory.js";

/**
 * The live journey, as pure rules.
 *
 * The tracker does not estimate a vehicle's position: it walks the real
 * stops of the chosen itinerary. The rider steps forward, or the browser
 * tells us that the next stop is within reach, and every screen derives
 * from that one index.
 */

export type TripStop = {
  /** The leg of the itinerary this stop belongs to. */
  legIndex: number;
  /** The M3E mode token of the vehicle that reaches it. */
  mode: TransitModeTokenId;
  stationId: string;
  name: string;
  latitude: number;
  longitude: number;
  /** The place where the rider changes vehicle. */
  isTransfer: boolean;
  /** The stop where the rider leaves the last vehicle. */
  isAlighting: boolean;
  /** The stop where the rider boards this vehicle. */
  isBoarding: boolean;
};

function isRail(mode: string): boolean {
  return mode === "rail" || mode === "metro" || mode === "tram";
}

/**
 * The ordered stops of a journey.
 *
 * A ride is the part of the journey the rider can follow stop by stop; a
 * walk is a way to reach a stop that the ride already names. The list
 * therefore reads the ride stops in order, and falls back to the walk's
 * own stops only when the whole journey is on foot.
 */
export function flattenTripStops(route: Itinerary): TripStop[] {
  const rideLegs = route.legs
    .map((leg, index) => ({ leg, index }))
    .filter((entry) => entry.leg.kind === "ride" && entry.leg.stops.length > 0);
  const chosen = rideLegs.length > 0
    ? rideLegs
    : route.legs
        .map((leg, index) => ({ leg, index }))
        .filter((entry) => entry.leg.stops.length > 0);

  const lastLegIndex = chosen[chosen.length - 1]?.index ?? -1;
  const stops: TripStop[] = [];
  let rideOrder = 0;

  for (const { leg, index } of chosen) {
    const mode = transitModeTokenOf({
      systemId: leg.lineId ? (leg.lineId.split(":")[0] ?? null) : null,
      serviceClass: leg.serviceClass,
      mode: leg.mode,
      lineCode: leg.lineCode,
    }).id;
    const ride = leg.kind === "ride";
    const firstOfRide = ride && rideOrder === 0;
    if (ride) rideOrder += 1;

    leg.stops.forEach((stop, stopIndex) => {
      const previous = stops[stops.length - 1];
      if (
        previous &&
        previous.stationId === stop.stationId &&
        Math.abs(previous.latitude - stop.latitude) < 0.00005 &&
        Math.abs(previous.longitude - stop.longitude) < 0.00005
      ) {
        // A change of vehicle at the same stop is one place on the map, but
        // it is still the moment the rider has to move. The existing stop
        // keeps the flag so the live strip can arm the alarm there.
        if (ride && !firstOfRide && stopIndex === 0) previous.isTransfer = true;
        return;
      }
      stops.push({
        legIndex: index,
        mode,
        stationId: stop.stationId,
        name: stop.name,
        latitude: stop.latitude,
        longitude: stop.longitude,
        isTransfer: ride && !firstOfRide && stopIndex === 0,
        isAlighting:
          ride && index === lastLegIndex && stopIndex === leg.stops.length - 1,
        isBoarding: ride && stopIndex === 0,
      });
    });
  }

  return stops;
}

/** The word for the place a vehicle stops at, from its mode token. */
export function tripStopNoun(mode: TransitModeTokenId): "stasiun" | "halte" {
  return mode === "krl" || mode === "mrt" || mode === "lrtj" || mode === "lrtk"
    ? "stasiun"
    : "halte";
}

/** The word for several places, made plural without inventing a new term. */
export function tripStopNounPlural(mode: TransitModeTokenId): string {
  return `${tripStopNoun(mode)} lagi`;
}

export type TripProgress = {
  /** The stops between the rider and the alighting stop. */
  remainingStops: number;
  nextStopName: string;
  alightStopName: string;
  /** 0..1, measured against the alighting stop. */
  progress: number;
  /** One stop before the alighting stop, or one before a change. */
  shouldWakeNow: boolean;
  /** True when the next stop is the one where the rider changes vehicle. */
  nextIsTransfer: boolean;
};

/**
 * How far the rider is from the stop where they get off.
 *
 * `shouldWakeNow` is the whole point of the tracker: the phone is asked to
 * speak up one stop before the rider has to move, not at the moment the
 * doors open. A change of vehicle earns the same warning, because the
 * rider has to stand up for it too.
 */
export function stopsRemainingBeforeAlight(
  stops: readonly TripStop[],
  currentIndex: number,
): TripProgress {
  if (stops.length === 0) {
    return {
      remainingStops: 0,
      nextStopName: "",
      alightStopName: "",
      progress: 0,
      shouldWakeNow: false,
      nextIsTransfer: false,
    };
  }

  const lastIndex = Math.max(0, stops.length - 1);
  const alightIndex = Math.max(
    stops.findLastIndex((stop) => stop.isAlighting),
    0,
  );
  const index = Math.min(Math.max(0, Math.round(currentIndex)), lastIndex);
  const remainingStops = Math.max(0, alightIndex - index);
  const next = stops[Math.min(index + 1, lastIndex)];
  const nextTransfer = stops.findIndex(
    (stop, stopIndex) => stopIndex > index && stop.isTransfer,
  );
  const nextIsTransfer = nextTransfer >= 0 && nextTransfer === index + 1;

  return {
    remainingStops,
    nextStopName: next?.name ?? stops[lastIndex]?.name ?? "",
    alightStopName: stops[alightIndex]?.name ?? stops[lastIndex]?.name ?? "",
    progress: alightIndex > 0 ? Math.min(1, index / alightIndex) : 1,
    shouldWakeNow: remainingStops === 1 || nextIsTransfer,
    nextIsTransfer,
  };
}

/** The straight-line distance between two coordinates, in metres. */
export function distanceMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const earthRadius = 6_371_000;
  const radians = Math.PI / 180;
  const dLat = (to.latitude - from.latitude) * radians;
  const dLon = (to.longitude - from.longitude) * radians;
  const lat1 = from.latitude * radians;
  const lat2 = to.latitude * radians;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* -------------------------------------------------------------------------
 * The local records that outlive one journey.
 *
 * `Sampai Tujuan` writes them, and the Saya surface reads them in PR 5.
 * They are browser memory, not an account: the rider can finish a journey
 * without signing in.
 * ---------------------------------------------------------------------- */

export const COMPLETED_TRIPS_KEY = "daily-route.completed-trips";
export const ROUTINES_KEY = "daily-route.routines";

export type CrowdRating = "lega" | "lumayan" | "desak-desakan";

export type CompletedTripRecord = {
  originName: string;
  destinationName: string;
  durationMinutes: number;
  fareIdr: number | null;
  walkKm: number;
  crowdRating: CrowdRating | null;
  /** The instant the journey ended. */
  completedAt: string;
};

/** The days a routine runs, 0 = Minggu (Sunday) through 6 = Sabtu. */
export type RoutineDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** The reminder lead times the routine editor offers. */
export type RoutineReminder = 5 | 10 | 15;

/** Monday to Friday, the default a new routine starts with. */
export const DEFAULT_ROUTINE_DAYS: readonly RoutineDay[] = [1, 2, 3, 4, 5];

export const ROUTINE_DAY_LABELS: Record<RoutineDay, string> = {
  0: "Min",
  1: "Sen",
  2: "Sel",
  3: "Rab",
  4: "Kam",
  5: "Jum",
  6: "Sab",
};

export type RoutineRecord = {
  id: string;
  originName: string;
  destinationName: string;
  origin: ChosenPlace | null;
  destination: ChosenPlace | null;
  /** The clock the rider usually leaves, "07:10", when one was chosen. */
  departureTime: string | null;
  createdAt: string;
  /** The rider's own name for the routine, such as "Rutinitas pagi". */
  label?: string | null;
  /** The clock the rider wants to arrive by, "07:50", when one was chosen. */
  arriveBy?: string | null;
  /** The days it runs. An older row without the field runs Monday to Friday. */
  days?: RoutineDay[];
  /** How many minutes before leaving the agent speaks up. */
  remindMinutes?: RoutineReminder;
  /** Whether the agent may swap in another route when this one is blocked. */
  autoReroute?: boolean;
};

function storage(): Storage | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function readList<T>(key: string, guard: (value: unknown) => value is T): T[] {
  const store = storage();
  if (!store) return [];
  try {
    const raw = store.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(guard);
  } catch {
    return [];
  }
}

function writeList(key: string, value: unknown[], limit: number): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value.slice(0, limit)));
  } catch {
    // A private window may refuse the write. The journey still finishes.
  }
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isCompletedTripRecord(value: unknown): value is CompletedTripRecord {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row["originName"] === "string" &&
    typeof row["destinationName"] === "string" &&
    isNumber(row["durationMinutes"]) &&
    isNumber(row["walkKm"]) &&
    (row["fareIdr"] === null || isNumber(row["fareIdr"])) &&
    (row["crowdRating"] === null ||
      row["crowdRating"] === "lega" ||
      row["crowdRating"] === "lumayan" ||
      row["crowdRating"] === "desak-desakan") &&
    typeof row["completedAt"] === "string"
  );
}

export function readCompletedTrips(): CompletedTripRecord[] {
  return readList(COMPLETED_TRIPS_KEY, isCompletedTripRecord);
}

/** Save one finished journey, newest first, and return the saved list. */
export function recordCompletedTrip(entry: CompletedTripRecord): CompletedTripRecord[] {
  const next = [entry, ...readCompletedTrips()];
  writeList(COMPLETED_TRIPS_KEY, next, 120);
  return readCompletedTrips();
}

function isClock(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isRoutineDay(value: unknown): value is RoutineDay {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6;
}

/** The days a stored routine runs, with the weekday default for older rows. */
export function routineDaysOf(routine: Pick<RoutineRecord, "days">): RoutineDay[] {
  const days = routine.days;
  if (!Array.isArray(days) || days.length === 0) return [...DEFAULT_ROUTINE_DAYS];
  return days.filter(isRoutineDay).filter((day, index, all) => all.indexOf(day) === index);
}

export function isRoutineRecord(value: unknown): value is RoutineRecord {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  const optionalClock =
    row["arriveBy"] === undefined || row["arriveBy"] === null || isClock(row["arriveBy"]);
  const optionalDays =
    row["days"] === undefined ||
    (Array.isArray(row["days"]) && row["days"].every(isRoutineDay));
  const optionalReminder =
    row["remindMinutes"] === undefined ||
    row["remindMinutes"] === 5 ||
    row["remindMinutes"] === 10 ||
    row["remindMinutes"] === 15;
  const optionalAuto =
    row["autoReroute"] === undefined || typeof row["autoReroute"] === "boolean";
  const optionalLabel =
    row["label"] === undefined || row["label"] === null || typeof row["label"] === "string";
  return (
    typeof row["id"] === "string" &&
    typeof row["originName"] === "string" &&
    typeof row["destinationName"] === "string" &&
    (row["origin"] === null || typeof row["origin"] === "object") &&
    (row["destination"] === null || typeof row["destination"] === "object") &&
    (row["departureTime"] === null || typeof row["departureTime"] === "string") &&
    typeof row["createdAt"] === "string" &&
    optionalClock &&
    optionalDays &&
    optionalReminder &&
    optionalAuto &&
    optionalLabel
  );
}

export function readRoutines(): RoutineRecord[] {
  return readList(ROUTINES_KEY, isRoutineRecord);
}

/**
 * Remember the journey as a routine.
 *
 * A pair that is already stored keeps its row and takes the newer clock,
 * so asking twice does not make two identical routines.
 */
export function saveRoutine(
  entry: Omit<RoutineRecord, "id" | "createdAt">,
): RoutineRecord[] {
  const current = readRoutines();
  const existing = current.find(
    (row) =>
      row.originName === entry.originName &&
      row.destinationName === entry.destinationName,
  );
  const row: RoutineRecord = {
    ...entry,
    days: routineDaysOf(entry),
    remindMinutes: entry.remindMinutes ?? 10,
    autoReroute: entry.autoReroute ?? true,
    label: entry.label ?? existing?.label ?? null,
    id: existing?.id ?? `routine-${Date.now()}-${current.length + 1}`,
    createdAt: new Date().toISOString(),
  };
  const next = [row, ...current.filter((item) => item.id !== row.id)];
  writeList(ROUTINES_KEY, next, 16);
  return readRoutines();
}

/**
 * Change one stored routine.
 *
 * The id and the creation instant stay with the row: an edit is the same
 * routine with a new clock, not a new routine that happens to look alike.
 */
export function updateRoutine(
  id: string,
  patch: Partial<Omit<RoutineRecord, "id" | "createdAt">>,
): RoutineRecord[] {
  const current = readRoutines();
  const existing = current.find((row) => row.id === id);
  if (!existing) return current;
  const merged: RoutineRecord = {
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
  };
  const row: RoutineRecord = {
    ...merged,
    days: routineDaysOf(merged),
    remindMinutes: merged.remindMinutes ?? 10,
    autoReroute: merged.autoReroute ?? true,
  };
  const next = current.map((item) => (item.id === id ? row : item));
  writeList(ROUTINES_KEY, next, 16);
  return readRoutines();
}

/** Remove one routine and return the list after the change. */
export function deleteRoutine(id: string): RoutineRecord[] {
  const next = readRoutines().filter((row) => row.id !== id);
  writeList(ROUTINES_KEY, next, 16);
  return readRoutines();
}

/** Whether the vehicle on this leg is a train, for "stasiun" versus "halte". */
export function modeIsRail(mode: string): boolean {
  return isRail(mode);
}
