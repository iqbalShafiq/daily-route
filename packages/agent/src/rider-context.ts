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
