import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ApiError,
  api,
  type AccountMemoryItem,
  type AccountMemoryWrite,
} from "../../lib/api.js";
import {
  clearStoredPlaces,
  isJourney,
  isPlace,
  readStoredPlaces,
  usePlaceMemory,
  type ChosenPlace,
  type RecentJourney,
} from "../route-planner/place-memory.js";
import {
  clearStoredWatches,
  isWatchedTrip,
  readStoredWatches,
  useWatch,
  type WatchedTrip,
} from "../route-planner/use-watch.js";

/**
 * The rider's places and watches, in one store.
 *
 * A signed-out rider keeps them in this browser. A signed-in rider keeps
 * them on the account, and the local store is imported once and then
 * emptied, so a shared phone does not keep a copy of the account's places
 * after the next rider signs out. The page reads the same fields either
 * way; nothing above this hook knows where they were stored.
 */

/** The local stores cap themselves at 8, 8, 6 and 12 items. */
const IMPORT_LIMIT = 34;

function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : "Could not save your places.";
}

function placePayload(place: ChosenPlace): Record<string, unknown> {
  return {
    kind: place.kind,
    id: place.id,
    name: place.name,
    address: place.address ?? null,
    latitude: place.latitude,
    longitude: place.longitude,
    systemId: place.systemId ?? null,
    systemName: place.systemName ?? null,
  };
}

function journeyKey(journey: RecentJourney): string {
  const { origin, destination } = journey;
  if (origin && destination) return `${origin.id}|${destination.id}`;
  return `${journey.originName}|${journey.destinationName}`;
}

function liveItems(items: AccountMemoryItem[] | undefined): AccountMemoryItem[] {
  return (items ?? []).filter((item) => item.deletedAt === null);
}

function placesOf(
  items: AccountMemoryItem[],
  kind: "saved-place" | "recent-place",
): ChosenPlace[] {
  const places: ChosenPlace[] = [];
  for (const item of items) {
    if (item.kind !== kind) continue;
    if (isPlace(item.payload)) places.push(item.payload);
  }
  return places;
}

function journeysOf(items: AccountMemoryItem[]): RecentJourney[] {
  const journeys: RecentJourney[] = [];
  for (const item of items) {
    if (item.kind !== "recent-journey") continue;
    if (isJourney(item.payload)) journeys.push(item.payload);
  }
  return journeys;
}

function watchesOf(items: AccountMemoryItem[]): WatchedTrip[] {
  const watches: WatchedTrip[] = [];
  for (const item of items) {
    if (item.kind !== "watch") continue;
    if (isWatchedTrip(item.payload)) watches.push(item.payload);
  }
  return watches;
}

/** The local store as the writes that move it to the account. */
function importWrites(
  places: { saved: ChosenPlace[]; recentPlaces: ChosenPlace[]; journeys: RecentJourney[] },
  watches: WatchedTrip[],
): AccountMemoryWrite[] {
  const writes: AccountMemoryWrite[] = [
    ...places.saved.map((place) => ({
      kind: "saved-place" as const,
      itemKey: place.id,
      payload: placePayload(place),
    })),
    ...places.recentPlaces.map((place) => ({
      kind: "recent-place" as const,
      itemKey: place.id,
      payload: placePayload(place),
    })),
    ...places.journeys.map((journey) => ({
      kind: "recent-journey" as const,
      itemKey: journeyKey(journey),
      payload: journey,
    })),
    ...watches.map((trip) => ({
      kind: "watch" as const,
      itemKey: trip.key,
      payload: trip,
    })),
  ];
  return writes.slice(0, IMPORT_LIMIT);
}

export function useRiderMemory(userId: string | null) {
  const queryClient = useQueryClient();
  const {
    saved: localSaved,
    recentPlaces: localRecentPlaces,
    journeys: localJourneys,
    rememberPlace: rememberLocalPlace,
    toggleSaved: toggleLocalSaved,
    rememberJourney: rememberLocalJourney,
    reset: resetLocalPlaces,
  } = usePlaceMemory();
  const {
    trips: localTrips,
    toggle: toggleLocalWatch,
    reset: resetLocalWatches,
  } = useWatch();

  const [memoryError, setMemoryError] = useState<string | null>(null);

  const memory = useQuery({
    queryKey: ["account", "memory"],
    queryFn: () => api.accountMemory(),
    enabled: userId !== null,
  });
  const { refetch } = memory;

  const items = useMemo(() => liveItems(memory.data?.items), [memory.data]);
  const server = useMemo(
    () => ({
      saved: placesOf(items, "saved-place"),
      recentPlaces: placesOf(items, "recent-place"),
      journeys: journeysOf(items),
      trips: watchesOf(items),
    }),
    [items],
  );

  /**
   * Move the local store into a fresh account, once.
   *
   * The local keys are removed only after the account has accepted the
   * whole batch. A failed import keeps the local copy and says so, rather
   * than showing the rider an empty list that is also gone from the phone.
   */
  const importedFor = useRef<string | null>(null);
  useEffect(() => {
    // Signing out clears the mark, so a later sign-in can import whatever
    // this browser saved while the rider was signed out.
    if (userId === null) {
      importedFor.current = null;
      return;
    }
    if (importedFor.current === userId) return;
    importedFor.current = userId;

    const writes = importWrites(readStoredPlaces(), readStoredWatches());
    if (writes.length === 0) return;

    const run = async (): Promise<void> => {
      try {
        const result = await api.putAccountMemory(writes);
        queryClient.setQueryData(["account", "memory"], result);
        clearStoredPlaces();
        clearStoredWatches();
        resetLocalPlaces();
        resetLocalWatches();
        await queryClient.invalidateQueries({ queryKey: ["account", "memory"] });
      } catch (error) {
        setMemoryError(messageOf(error));
      }
    };
    void run();
  }, [userId, queryClient, resetLocalPlaces, resetLocalWatches]);

  const writeMemory = useCallback(
    async (write: AccountMemoryWrite): Promise<void> => {
      try {
        const result = await api.putAccountMemory([write]);
        queryClient.setQueryData(["account", "memory"], result);
        setMemoryError(null);
      } catch (error) {
        // The previous server list stays untouched: a save that failed is
        // not shown as saved.
        setMemoryError(messageOf(error));
      }
    },
    [queryClient],
  );

  const rememberPlace = useCallback(
    (place: ChosenPlace) => {
      if (userId === null) {
        rememberLocalPlace(place);
        return;
      }
      void writeMemory({
        kind: "recent-place",
        itemKey: place.id,
        payload: placePayload(place),
      });
    },
    [userId, rememberLocalPlace, writeMemory],
  );

  const toggleSaved = useCallback(
    (place: ChosenPlace) => {
      if (userId === null) {
        toggleLocalSaved(place);
        return;
      }
      const exists = server.saved.some((item) => item.id === place.id);
      void writeMemory(
        exists
          ? { kind: "saved-place", itemKey: place.id, deleted: true }
          : {
              kind: "saved-place",
              itemKey: place.id,
              payload: placePayload(place),
            },
      );
    },
    [userId, server.saved, toggleLocalSaved, writeMemory],
  );

  const rememberJourney = useCallback(
    (journey: RecentJourney) => {
      if (userId === null) {
        rememberLocalJourney(journey);
        return;
      }
      void writeMemory({
        kind: "recent-journey",
        itemKey: journeyKey(journey),
        payload: journey,
      });
    },
    [userId, rememberLocalJourney, writeMemory],
  );

  const isSaved = useCallback(
    (place: ChosenPlace | null) => {
      if (!place) return false;
      const list = userId === null ? localSaved : server.saved;
      return list.some((item) => item.id === place.id);
    },
    [userId, localSaved, server.saved],
  );

  const toggleWatch = useCallback(
    (trip: WatchedTrip) => {
      if (userId === null) {
        toggleLocalWatch(trip);
        return;
      }
      const exists = server.trips.some((item) => item.key === trip.key);
      void writeMemory(
        exists
          ? { kind: "watch", itemKey: trip.key, deleted: true }
          : { kind: "watch", itemKey: trip.key, payload: trip },
      );
    },
    [userId, server.trips, toggleLocalWatch, writeMemory],
  );

  const isWatching = useCallback(
    (key: string | null) => {
      if (!key) return false;
      const list = userId === null ? localTrips : server.trips;
      return list.some((item) => item.key === key);
    },
    [userId, localTrips, server.trips],
  );

  /**
   * Empty this browser's copy.
   *
   * The page calls it after a successful sign-out or account deletion, so
   * the previous rider's places and watches do not stay in React state.
   */
  const resetLocal = useCallback(() => {
    resetLocalPlaces();
    resetLocalWatches();
    setMemoryError(null);
  }, [resetLocalPlaces, resetLocalWatches]);

  const retryMemory = useCallback(() => {
    void refetch();
  }, [refetch]);

  return {
    saved: userId === null ? localSaved : server.saved,
    recentPlaces: userId === null ? localRecentPlaces : server.recentPlaces,
    journeys: userId === null ? localJourneys : server.journeys,
    rememberPlace,
    toggleSaved,
    rememberJourney,
    isSaved,
    trips: userId === null ? localTrips : server.trips,
    toggle: toggleWatch,
    isWatching,
    memoryError,
    memoryLoadFailed: userId !== null && memory.isError,
    retryMemory,
    resetLocal,
  };
}
