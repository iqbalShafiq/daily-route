/**
 * The rider behind the current chat turn, as the API sees it.
 *
 * The `AsyncLocalStorage` instances live in `@daily-route/agent`, because the
 * tools are what read them and a package cannot import the application that
 * uses it. This module is the API's import point: the route fills each store
 * once, and every tool in the same `run` sees the same rider and the same
 * marked current place.
 */
export { currentPlaceStore, riderStore } from "@daily-route/agent";
export type { CurrentPlace, RiderIdentity } from "@daily-route/agent";
