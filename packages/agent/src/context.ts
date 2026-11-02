import type { Database } from "@daily-route/db";
import {
  listActiveDisruptions,
  listTemporaryServices,
  loadFareRules,
  loadNetwork,
} from "@daily-route/db";
import type { PlaceResolver } from "@daily-route/semantic";
import {
  diversionsFromMetadata,
  withDiversions,
  withTemporaryServices,
  type Disruption,
  type FareRules,
  type TemporaryService,
  type TransitNetwork,
} from "@daily-route/transit";

import { storedMark } from "./marks.js";

function diversionDescriptionOf(value: unknown): Disruption["diversionDescription"] {
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  const from = typeof entry["from"] === "string" ? entry["from"] : null;
  const to = typeof entry["to"] === "string" ? entry["to"] : null;
  const via = Array.isArray(entry["via"])
    ? entry["via"].filter((name): name is string => typeof name === "string")
    : [];
  const follows = Array.isArray(entry["follows"])
    ? entry["follows"].filter((name): name is string => typeof name === "string")
    : [];
  return { from, to, via, follows };
}

/**
 * The runtime context the agent's tools work against.
 *
 * It is passed explicitly into every tool rather than read from a global, so
 * a test can build a context over a different database or a stub resolver
 * without touching the process environment.
 */
export type TransitAgentContext = {
  db: Database;
  resolver: PlaceResolver;
  /** How long a cached network snapshot stays fresh, in milliseconds. */
  cacheTtlMs?: number;
};

type CacheEntry = {
  network: TransitNetwork;
  disruptions: Disruption[];
  /** The published tariffs, when the snapshot carries them. */
  fareRules: FareRules | null;
  /** The announced temporary services applied to `network`. */
  temporaryServices: TemporaryService[];
  loadedAt: number;
};

/**
 * A short-lived cache of the routable network.
 *
 * The network is read-only between seeds, so a minute of caching removes the
 * database round trip from every agent turn without letting it go stale in a
 * way that matters.
 */
export class NetworkCache {
  readonly #context: TransitAgentContext;
  readonly #ttlMs: number;
  #entry: CacheEntry | null = null;
  #inFlight: Promise<CacheEntry> | null = null;

  constructor(context: TransitAgentContext) {
    this.#context = context;
    this.#ttlMs = context.cacheTtlMs ?? 60_000;
  }

  async get(): Promise<CacheEntry> {
    const now = Date.now();
    if (this.#entry && now - this.#entry.loadedAt < this.#ttlMs) {
      return this.#entry;
    }
    if (!this.#inFlight) {
      this.#inFlight = this.#load().finally(() => {
        this.#inFlight = null;
      });
    }
    this.#entry = await this.#inFlight;
    return this.#entry;
  }

  /** Drop the cache so the next read reloads from the database. */
  invalidate(): void {
    this.#entry = null;
  }

  async #load(): Promise<CacheEntry> {
    const [network, disruptionRows, fareRules, temporaryServices] = await Promise.all([
      loadNetwork(this.#context.db),
      listActiveDisruptions(this.#context.db, { limit: 200 }),
      loadFareRules(this.#context.db),
      listTemporaryServices(this.#context.db),
    ]);

    const disruptions: Disruption[] = disruptionRows.map((row) => {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      const direction =
        metadata["direction"] === "forward" || metadata["direction"] === "backward"
          ? metadata["direction"]
          : null;
      const platforms = Array.isArray(metadata["platforms"])
        ? (metadata["platforms"] as { lineId?: unknown; direction?: unknown; stationId?: unknown; platformId?: unknown }[])
            .flatMap((entry): NonNullable<Disruption["platforms"]> => {
              const direction = entry.direction;
              if (
                typeof entry.lineId !== "string" ||
                (direction !== "forward" && direction !== "backward")
              ) {
                return [];
              }
              return [{
                lineId: entry.lineId,
                direction,
                ...(typeof entry.stationId === "string" ? { stationId: entry.stationId } : {}),
                ...(typeof entry.platformId === "string" ? { platformId: entry.platformId } : {}),
              }];
            })
        : [];
      return {
      id: row.id,
      source: row.source,
      sourceType: row.sourceType as Disruption["sourceType"],
      systemId: row.systemId,
      lineId: row.lineId,
      stationId: row.stationId,
      stationGroupId: row.stationGroupId,
      severity: row.severity as Disruption["severity"],
      status: row.status as Disruption["status"],
      kind: row.kind as Disruption["kind"],
      title: row.title,
      body: row.body,
      url: row.url,
      confidence: row.confidence,
      publishedAt: row.publishedAt.toISOString(),
      observedAt: row.observedAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      eventKey: row.eventKey,
      startsAt: row.startsAt?.toISOString() ?? null,
      endsAt: row.endsAt?.toISOString() ?? null,
      reviewAt: row.reviewAt?.toISOString() ?? null,
      reviewState: row.reviewState ?? null,
      lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
      validityWindows: (row.validityWindows as Disruption["validityWindows"]) ?? [],
      lastSeenAt: row.lastSeenAt.toISOString(),
      affectedStationIds: (row.affectedStationIds as string[]) ?? [],
      affectedLineIds: (row.affectedLineIds as string[]) ?? [],
      scope:
        row.scope === "stop" || row.scope === "line" || row.scope === "network"
          ? row.scope
          : null,
      lineCodes: Array.isArray(row.lineCodes) ? (row.lineCodes as string[]) : [],
      roads: Array.isArray(row.roads)
        ? (row.roads as NonNullable<Disruption["roads"]>)
        : [],
      direction,
      towards: typeof metadata["towards"] === "string" ? metadata["towards"] : null,
      platforms,
      viaToll: metadata["viaToll"] === true,
      diversions: diversionsFromMetadata(metadata["diversions"]),
      ...(diversionDescriptionOf(metadata["diversion"])
        ? { diversionDescription: diversionDescriptionOf(metadata["diversion"]) }
        : {}),
      mark: storedMark(row.metadata),
    };
    });

    return {
      network: withTemporaryServices(withDiversions(network, disruptions), temporaryServices),
      disruptions,
      fareRules,
      temporaryServices,
      loadedAt: Date.now(),
    };
  }
}
