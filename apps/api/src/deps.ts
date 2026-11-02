import type { Agent } from "@anvia/core";
import type { Database } from "@daily-route/db";
import type { Env } from "@daily-route/env";
import type { NetworkCache } from "@daily-route/agent";
import type { PlaceResolver } from "@daily-route/semantic";

import type { AttemptLimiter } from "./attempts.js";

/**
 * The API's dependencies.
 *
 * They are passed into `createApp` instead of read from module scope, so a
 * test can run the whole API against a scratch database and a stub agent.
 */
export type ApiDeps = {
  db: Database;
  env: Env;
  cache: NetworkCache;
  resolver: PlaceResolver;
  /** Absent when no model provider is configured. */
  agent: Agent | null;
  /** The id of the most recent provider error, for the health endpoint. */
  lastProviderError: { at: string; message: string } | null;
  /** The failed-attempt limiter behind the account endpoints. */
  attempts: AttemptLimiter;
};
