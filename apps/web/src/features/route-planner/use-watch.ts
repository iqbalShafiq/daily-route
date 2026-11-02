import { useCallback, useState } from "react";

/**
 * Journeys the rider asked to keep an eye on.
 *
 * The notices are already on the journey when it is planned. This is the
 * local memory that lets the interface say "you are watching this one" and
 * keep it across a reload. It does not pretend to push a notification.
 */
const KEY = "daily-route.watched-trips";

export type WatchedTrip = {
  key: string;
  origin: string;
  destination: string;
  lines: string[];
  savedAt: string;
};

export function isWatchedTrip(value: unknown): value is WatchedTrip {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row["key"] === "string" &&
    typeof row["origin"] === "string" &&
    typeof row["destination"] === "string" &&
    Array.isArray(row["lines"]) &&
    typeof row["savedAt"] === "string"
  );
}

export function readStoredWatches(): WatchedTrip[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter(isWatchedTrip);
  } catch {
    return [];
  }
}

export function clearStoredWatches(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(KEY);
}

function write(trips: WatchedTrip[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(trips.slice(0, 12)));
}

export function useWatch() {
  const [trips, setTrips] = useState<WatchedTrip[]>(readStoredWatches);
  const toggle = useCallback((trip: WatchedTrip) => {
    setTrips((current) => {
      const exists = current.some((entry) => entry.key === trip.key);
      const next = exists
        ? current.filter((entry) => entry.key !== trip.key)
        : [trip, ...current].slice(0, 12);
      write(next);
      return next;
    });
  }, []);
  const isWatching = useCallback(
    (key: string | null) => (key ? trips.some((entry) => entry.key === key) : false),
    [trips],
  );

  /** Forget the local watches after the account has taken them over. */
  const reset = useCallback(() => {
    setTrips([]);
    clearStoredWatches();
  }, []);

  return { trips, toggle, isWatching, reset };
}
