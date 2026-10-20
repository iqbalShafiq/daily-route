import type { Database } from "@daily-route/db";
import { listActiveDisruptions, loadNetwork } from "@daily-route/db";
import type { PlaceResolver } from "@daily-route/semantic";
import type { Disruption, TransitNetwork } from "@daily-route/transit";

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
    const [network, disruptionRows] = await Promise.all([
      loadNetwork(this.#context.db),
      listActiveDisruptions(this.#context.db, { limit: 200 }),
    ]);

    const disruptions: Disruption[] = disruptionRows.map((row) => ({
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
      affectedStationIds: (row.affectedStationIds as string[]) ?? [],
      affectedLineIds: (row.affectedLineIds as string[]) ?? [],
    }));

    return { network, disruptions, loadedAt: Date.now() };
  }
}
