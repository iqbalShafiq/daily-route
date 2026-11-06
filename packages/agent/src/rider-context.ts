import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The rider behind the current chat turn.
 *
 * The tools are read-only from the model's point of view, so the rider is
 * not a tool argument: it reaches the tool through this store, which the
 * chat route fills once for the whole run. An empty `userId` means the rider
 * is signed out. The store lives in this package because the tool layer and
 * the API must share one instance; a package cannot import the application
 * that uses it.
 */
export type RiderIdentity = { userId: string };

export const riderStore = new AsyncLocalStorage<RiderIdentity>();

/**
 * The place the rider marked as "here" for this turn.
 *
 * The browser gives the position and the server grounds it; the model never
 * supplies a coordinate. The value reaches `plan_journey` through this store,
 * so `originCurrent: true` is a fact about the turn rather than a place name
 * the model has to invent. The store is empty when the rider has not marked a
 * location, and a tool must say so instead of guessing one.
 */
export type CurrentPlace = {
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
};

export const currentPlaceStore = new AsyncLocalStorage<CurrentPlace>();
