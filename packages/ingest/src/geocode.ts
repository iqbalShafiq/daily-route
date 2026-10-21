/**
 * Place names into coordinates.
 *
 * The official route maps print the names of the stops, but not where
 * they are. Most of those stops the network already knows, and the rest
 * are looked up here, with the address search of OpenStreetMap.
 *
 * The search is polite: one request at a time, and every answer is kept
 * on disk so the next run does not ask again.
 */

import { readFileSync, writeFileSync } from "node:fs";

const ENDPOINT = "https://nominatim.openstreetmap.org/search";
const USER_AGENT =
  "daily-route/0.1 (Jakarta transit data pipeline; https://github.com/iqbalShafiq/daily-route)";

export type GeocodeResult = {
  latitude: number;
  longitude: number;
  displayName: string;
};

export type GeocoderOptions = {
  /** The file the answers are kept in. */
  cachePath: string;
  /** The area the search is restricted to. */
  viewbox?: { south: number; west: number; north: number; east: number };
  /** How many names to look up in one run. */
  limit?: number;
};

export class Geocoder {
  readonly #cache: Map<string, GeocodeResult | null>;
  readonly #cachePath: string;
  readonly #viewbox: GeocoderOptions["viewbox"];
  readonly #limit: number;

  constructor(options: GeocoderOptions) {
    this.#cachePath = options.cachePath;
    this.#viewbox = options.viewbox;
    this.#limit = options.limit ?? 500;
    this.#cache = new Map();
    try {
      const stored = JSON.parse(readFileSync(options.cachePath, "utf8")) as Record<
        string,
        GeocodeResult | null
      >;
      for (const [key, value] of Object.entries(stored)) this.#cache.set(key, value);
    } catch {
      // No cache yet: every name is looked up.
    }
  }

  /** The answer for a name, when it has been looked up. */
  get(name: string): GeocodeResult | null | undefined {
    return this.#cache.get(name);
  }

  /** The names that still have to be looked up. */
  missing(names: readonly string[]): string[] {
    const pending = [...new Set(names)].filter((name) => !this.#cache.has(name));
    return pending.slice(0, this.#limit);
  }

  /** Look a name up, and remember the answer. */
  async lookup(name: string): Promise<GeocodeResult | null> {
    const cached = this.#cache.get(name);
    if (cached !== undefined) return cached;

    const result = await this.#search(name);
    this.#cache.set(name, result);
    return result;
  }

  /** Write the answers to the cache. */
  save(): void {
    const stored: Record<string, GeocodeResult | null> = {};
    for (const [key, value] of this.#cache) stored[key] = value;
    writeFileSync(this.#cachePath, `${JSON.stringify(stored, null, 1)}\n`);
  }

  async #search(name: string): Promise<GeocodeResult | null> {
    const query = new URLSearchParams({
      q: name,
      format: "jsonv2",
      limit: "1",
      countrycodes: "id",
      "addressdetails": "0",
    });
    if (this.#viewbox) {
      const { south, west, north, east } = this.#viewbox;
      query.set("viewbox", `${west},${north},${east},${south}`);
      query.set("bounded", "1");
    }

    try {
      const response = await fetch(`${ENDPOINT}?${query.toString()}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as {
        lat?: string;
        lon?: string;
        display_name?: string;
      }[];
      const first = payload[0];
      if (!first?.lat || !first?.lon) return null;
      const latitude = Number(first.lat);
      const longitude = Number(first.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      return {
        latitude,
        longitude,
        displayName: first.display_name ?? name,
      };
    } catch {
      return null;
    }
  }
}
