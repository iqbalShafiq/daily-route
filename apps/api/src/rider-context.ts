/**
 * The rider behind the current chat turn, as the API sees it.
 *
 * The `AsyncLocalStorage` instance lives in `@daily-route/agent`, because the
 * tools are what read it and a package cannot import the application that
 * uses it. This module is the API's import point: the route fills the store
 * once, and every tool in the same `run` sees the same rider.
 */
export { riderStore } from "@daily-route/agent";
export type { RiderIdentity } from "@daily-route/agent";
