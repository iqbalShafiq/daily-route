import { useCallback, useState } from "react";

/**
 * Places and journeys the reader has already used.
 *
 * They live in the browser. There is no account: the same machine
 * remembers them, and nothing is sent anywhere until the reader asks
 * for a route.
 */

export type ChosenPlace = {
  kind: "station" | "place";
  id: string;
  name: string;
  /** The full address, when the place was marked from the rider's position. */
  address?: string | null;
  latitude: number;
  longitude: number;
  systemId?: string | null;
  systemName?: string | null;
};

/**
 * What the route field shows for a place.
 *
 * A marked current location is useful as the address the rider is standing
 * on, not as the short name of the nearest object. A station keeps its
 * name because it has no address in the graph.
 */
export function displayNameOf(place: ChosenPlace): string {
  const address = typeof place.address === "string" ? place.address.trim() : "";
  return address.length > 0 ? address : place.name;
}

export type RecentJourney = {
  originName: string;
  destinationName: string;
  origin: ChosenPlace | null;
  destination: ChosenPlace | null;
};

const SAVED_KEY = "daily-route.saved-places";
const RECENT_KEY = "daily-route.recent-places";
const JOURNEY_KEY = "daily-route.recent-journeys";

const PLACE_LIMIT = 8;
const JOURNEY_LIMIT = 6;

export function isPlace(value: unknown): value is ChosenPlace {
  if (!value || typeof value !== "object") return false;
  const place = value as Record<string, unknown>;
  return (
    (place["kind"] === "station" || place["kind"] === "place") &&
    typeof place["id"] === "string" &&
    typeof place["name"] === "string" &&
    typeof place["latitude"] === "number" &&
    typeof place["longitude"] === "number" &&
    (place["address"] === undefined ||
      place["address"] === null ||
      typeof place["address"] === "string")
  );
}

export function isJourney(value: unknown): value is RecentJourney {
  if (!value || typeof value !== "object") return false;
  const journey = value as Record<string, unknown>;
  const origin = journey["origin"];
  const destination = journey["destination"];
  return (
    typeof journey["originName"] === "string" &&
    typeof journey["destinationName"] === "string" &&
    (origin === null || isPlace(origin)) &&
    (destination === null || isPlace(destination))
  );
}

function readPlaces(key: string): ChosenPlace[] {
  return readList(key, isPlace);
}

function readJourneys(): RecentJourney[] {
  return readList(JOURNEY_KEY, isJourney);
}

function readList<T>(key: string, guard: (value: unknown) => value is T): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(guard);
  } catch {
    return [];
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function remember<T>(items: readonly T[], next: T, same: (item: T) => boolean, limit: number): T[] {
  return [next, ...items.filter((item) => !same(item))].slice(0, limit);
}

/**
 * The three local lists, as a signed-in client reads them once.
 *
 * This is the same store the hook uses while nobody is signed in, exposed
 * so the account sync can move it to the server without a second parser.
 */
export function readStoredPlaces(): {
  saved: ChosenPlace[];
  recentPlaces: ChosenPlace[];
  journeys: RecentJourney[];
} {
  return {
    saved: readPlaces(SAVED_KEY),
    recentPlaces: readPlaces(RECENT_KEY),
    journeys: readJourneys(),
  };
}

/** Remove the three local keys. The account owns the lists after a sync. */
export function clearStoredPlaces(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SAVED_KEY);
  window.localStorage.removeItem(RECENT_KEY);
  window.localStorage.removeItem(JOURNEY_KEY);
}

export function usePlaceMemory() {
  const [saved, setSaved] = useState<ChosenPlace[]>(() => readPlaces(SAVED_KEY));
  const [recentPlaces, setRecentPlaces] = useState<ChosenPlace[]>(() => readPlaces(RECENT_KEY));
  const [journeys, setJourneys] = useState<RecentJourney[]>(() => readJourneys());

  const rememberPlace = useCallback((place: ChosenPlace) => {
    setRecentPlaces((current) => {
      const next = remember(current, place, (item) => item.id === place.id, PLACE_LIMIT);
      write(RECENT_KEY, next);
      return next;
    });
  }, []);

  const toggleSaved = useCallback((place: ChosenPlace) => {
    setSaved((current) => {
      const exists = current.some((item) => item.id === place.id);
      const next = exists
        ? current.filter((item) => item.id !== place.id)
        : remember(current, place, (item) => item.id === place.id, PLACE_LIMIT);
      write(SAVED_KEY, next);
      return next;
    });
  }, []);

  const rememberJourney = useCallback((journey: RecentJourney) => {
    setJourneys((current) => {
      const next = remember(
        current,
        journey,
        (item) =>
          item.originName === journey.originName && item.destinationName === journey.destinationName,
        JOURNEY_LIMIT,
      );
      write(JOURNEY_KEY, next);
      return next;
    });
  }, []);

  const isSaved = useCallback(
    (place: ChosenPlace | null) => Boolean(place && saved.some((item) => item.id === place.id)),
    [saved],
  );

  /**
   * Forget everything on this device.
   *
   * It is called after a successful sign-out or account deletion, so the
   * next rider on a shared phone does not see the previous one's places in
   * React state. The signed-out store is emptied with it.
   */
  const reset = useCallback(() => {
    setSaved([]);
    setRecentPlaces([]);
    setJourneys([]);
    clearStoredPlaces();
  }, []);

  return {
    saved,
    recentPlaces,
    journeys,
    rememberPlace,
    toggleSaved,
    rememberJourney,
    isSaved,
    reset,
  };
}
