import type { Coordinates, Station } from "@daily-route/transit";

/**
 * Roads, as OpenStreetMap knows them.
 *
 * An announcement often names a street instead of a halte: "dialihkan karena
 * penutupan di Jl. Pintu Air Raya". The street is not one place, and the same
 * name exists in several parts of Greater Jakarta. This module answers the
 * only two questions that can be answered from geometry — which streets carry
 * that name, and which stops stand on one of them — and leaves the choice to
 * the reader that has the announcement in hand.
 *
 * Nothing here reads a sentence. The name arrives from the model; the
 * coordinate and the stops arrive from OpenStreetMap and the graph.
 */

/** The area the network covers, matching the ingest pipeline's box. */
export const ROAD_BBOX = {
  south: -6.7,
  west: 106.4,
  north: -6.0,
  east: 107.3,
} as const;

export type RoadSegment = {
  osmId: number;
  /** `[longitude, latitude]` pairs, in the order OpenStreetMap stores them. */
  geometry: [number, number][];
};

/**
 * A street, not one OpenStreetMap way.
 *
 * A single street is usually split into many ways. They are grouped by name
 * and by standing next to each other, so the model is not offered twelve
 * identical candidates.
 */
export type RoadCandidate = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  lengthKm: number;
  osmIds: number[];
  segments: RoadSegment[];
};

/** A stop that stands on the road, with the lines that serve it. */
export type RoadStop = {
  stationId: string;
  name: string;
  systemId: string;
  lineCodes: string[];
  /** Distance from the stop's centre to the nearest point of the street. */
  meters: number;
};

type OverpassWay = {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
};

/** The transport the lookup uses; injected so a test can answer without a network. */
export type RoadSource = (name: string) => Promise<OverpassWay[]>;

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
] as const;

const USER_AGENT =
  "daily-route/0.1 (Jakarta transit notices; https://github.com/iqbalShafiq/daily-route)";

type NominatimEntry = {
  osm_type?: string;
  osm_id?: number;
  name?: string;
  category?: string;
  display_name?: string;
  geojson?: { type?: string; coordinates?: unknown };
};

/**
 * The street search that answers in about a second.
 *
 * Nominatim is the address service of OpenStreetMap. It is fast and it
 * understands "Jalan Damai Raya" the way a person writes it, which is why it
 * is asked first. It answers one place per way, so a street split into
 * fourteen pieces comes back as fourteen results; `groupRoads` puts them
 * back together.
 */
export const nominatimRoadSource: RoadSource = async (name) => {
  const url = new URL(NOMINATIM);
  const viewbox = [
    ROAD_BBOX.west,
    ROAD_BBOX.north,
    ROAD_BBOX.east,
    ROAD_BBOX.south,
  ].join(",");
  url.search = new URLSearchParams({
    q: name,
    format: "jsonv2",
    addressdetails: "1",
    polygon_geojson: "1",
    limit: "20",
    countrycodes: "id",
    viewbox,
    bounded: "1",
  }).toString();

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`Nominatim answered ${response.status}`);
  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) return [];

  const ways: OverpassWay[] = [];
  for (const entry of payload as NominatimEntry[]) {
    if (entry.category !== "highway") continue;
    if (entry.geojson?.type !== "LineString") continue;
    const coordinates = entry.geojson.coordinates;
    if (!Array.isArray(coordinates)) continue;
    const geometry: { lat: number; lon: number }[] = [];
    for (const point of coordinates) {
      if (!Array.isArray(point) || point.length < 2) continue;
      const lon = Number(point[0]);
      const lat = Number(point[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      geometry.push({ lat, lon });
    }
    if (geometry.length < 2) continue;
    ways.push({
      type: "way",
      id: typeof entry.osm_id === "number" ? entry.osm_id : 0,
      tags: { name: entry.name?.trim() ?? "" },
      geometry,
    });
  }
  return ways;
};

/** The fallback: a name pattern against every way in the box. */
export const overpassRoadSource: RoadSource = async (name) => {
  const query = roadQuery(name);
  let lastError: unknown = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        lastError = new Error(`Overpass answered ${response.status}`);
        continue;
      }
      const payload = (await response.json()) as { elements?: OverpassWay[] };
      return payload.elements ?? [];
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Overpass tidak menjawab");
};

/**
 * The part of a written street name that OpenStreetMap stores.
 *
 * OpenStreetMap writes "Jalan Damai Raya"; an announcement writes "Jl. Damai
 * Raya". The prefix is the writer's habit, not part of the name.
 */
export function roadKeyword(name: string): string {
  const bare = name
    .trim()
    .replace(/^(?:jl|jln|jalan|gg|gang)\.?\s+/i, "")
    .trim();
  return bare.length >= 3 ? bare : name.trim();
}

/** Every way in the network's area whose name contains the keyword. */
export function roadQuery(name: string, bbox = ROAD_BBOX): string {
  const keyword = roadKeyword(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [
    "[out:json][timeout:25];",
    `way["highway"]["name"~"${keyword}",i](${bbox.south},${bbox.west},${bbox.north},${bbox.east});`,
    "out tags geom 60;",
  ].join("\n");
}

/**
 * Group the ways of one street into candidates.
 *
 * Ways whose centres stand within 400 m of each other are the same street
 * seen in pieces. Ways that share a name but lie in different districts stay
 * apart, which is the whole point: "Jl. Damai Raya" exists in Jakarta Barat
 * and in Bekasi, and only one of them is near the corridor.
 */
export function groupRoads(ways: readonly OverpassWay[], limit = 8): RoadCandidate[] {
  const usable = ways
    .filter((way) => way.geometry && way.geometry.length >= 2)
    .map((way) => {
      const geometry = (way.geometry ?? []).map(
        (point) => [point.lon, point.lat] as [number, number],
      );
      const center = centerOf(geometry);
      return {
        osmId: way.id,
        name: way.tags?.["name"]?.trim() ?? "",
        geometry,
        center,
        lengthM: pathMeters(geometry),
      };
    })
    .filter((way) => way.name.length > 0 && way.center !== null);

  const groups: {
    name: string;
    ways: typeof usable;
    center: Coordinates;
  }[] = [];

  for (const way of usable) {
    const center = way.center;
    if (!center) continue;
    const group = groups.find(
      (candidate) =>
        sameStreet(candidate.name, way.name) &&
        metersBetween(candidate.center, center) <= 400,
    );
    if (group) {
      group.ways.push(way);
      group.center = mergeCenters(group.center, center, group.ways.length);
    } else {
      groups.push({ name: way.name, ways: [way], center });
    }
  }

  return groups
    .map((group) => ({
      id: `road:${group.ways[0]?.osmId ?? 0}`,
      name: group.name,
      latitude: group.center.latitude,
      longitude: group.center.longitude,
      lengthKm: group.ways.reduce((total, way) => total + way.lengthM, 0) / 1_000,
      osmIds: group.ways.map((way) => way.osmId),
      segments: group.ways.map((way) => ({ osmId: way.osmId, geometry: way.geometry })),
    }))
    .sort((left, right) => right.lengthKm - left.lengthKm)
    .slice(0, limit);
}

/**
 * The stops that stand on a street.
 *
 * A stop counts when its own coordinate is within `radiusM` of the street's
 * line. The radius is small on purpose: a corridor that runs parallel two
 * hundred metres away does not serve this street.
 */
export function stopsOnRoad(
  road: RoadCandidate,
  stations: readonly Station[],
  linesByStation: ReadonlyMap<string, string[]>,
  radiusM = 60,
): RoadStop[] {
  const found: RoadStop[] = [];
  for (const station of stations) {
    const meters = distanceToRoad(road, station);
    if (meters === null || meters > radiusM) continue;
    found.push({
      stationId: station.id,
      name: station.name,
      systemId: station.systemId,
      lineCodes: linesByStation.get(station.id) ?? [],
      meters: Math.round(meters),
    });
  }
  return found.sort((left, right) => left.meters - right.meters);
}

/** The nearest point of the street, in metres, or null when it has no line. */
export function distanceToRoad(road: RoadCandidate, point: Coordinates): number | null {
  let best: number | null = null;
  for (const segment of road.segments) {
    for (let index = 0; index + 1 < segment.geometry.length; index += 1) {
      const from = segment.geometry[index];
      const to = segment.geometry[index + 1];
      if (!from || !to) continue;
      const meters = distanceToSegment(point, pointOf(from), pointOf(to));
      if (best === null || meters < best) best = meters;
    }
  }
  return best;
}

/**
 * A small in-process cache of road searches.
 *
 * The monitor reads several announcements about the same street in a poll.
 * Caching the answer keeps one query from becoming six. A miss is cached
 * briefly too: a street OpenStreetMap does not have must not be asked for
 * again by every item in the queue, but a provider that was down deserves
 * another chance on the next poll.
 */
export class RoadLookup {
  readonly #nominatim: RoadSource;
  readonly #overpass: RoadSource;
  readonly #cache = new Map<string, { at: number; roads: RoadCandidate[] }>();
  readonly #ttlMs: number;
  readonly #missTtlMs: number;
  #lastCallAt = 0;
  #overpassFailures = 0;
  #overpassSkipUntil = 0;

  constructor(
    sources: { nominatim?: RoadSource; overpass?: RoadSource } = {},
    ttlMs = 30 * 60_000,
    missTtlMs = 3 * 60_000,
  ) {
    this.#nominatim = sources.nominatim ?? nominatimRoadSource;
    this.#overpass = sources.overpass ?? overpassRoadSource;
    this.#ttlMs = ttlMs;
    this.#missTtlMs = missTtlMs;
  }

  /** Streets whose name contains what the announcement wrote. */
  async search(name: string, options: { limit?: number } = {}): Promise<RoadCandidate[]> {
    const key = name.trim().toLowerCase();
    if (key.length < 3) return [];
    const cached = this.#cache.get(key);
    if (cached) {
      const age = Date.now() - cached.at;
      if (age < (cached.roads.length > 0 ? this.#ttlMs : this.#missTtlMs)) {
        return cached.roads.slice(0, options.limit ?? 8);
      }
    }
    const roads = await this.#find(name);
    this.#cache.set(key, { at: Date.now(), roads });
    return roads.slice(0, options.limit ?? 8);
  }

  /** The cached result for an id the model was given, if it is still warm. */
  byId(id: string): RoadCandidate | null {
    for (const entry of this.#cache.values()) {
      const road = entry.roads.find((candidate) => candidate.id === id);
      if (road) return road;
    }
    return null;
  }

  async #find(name: string): Promise<RoadCandidate[]> {
    const keyword = roadKeyword(name);
    // Nominatim first: it answers in about a second and it understands the
    // way a person writes a street. A fuzzy match is not a match, so every
    // way is checked against the words that were asked for.
    for (const variant of nameVariants(name).slice(0, 3)) {
      try {
        const ways = await this.#throttle(() => this.#nominatim(variant));
        const roads = groupRoads(ways.filter((way) => nameMatches(way.tags?.["name"] ?? "", keyword)), 12);
        if (roads.length > 0) return roads;
      } catch {
        // The next spelling, or the next provider.
      }
    }
    // The name pattern is the fallback for a street Nominatim does not
    // index under the words the post used. The public Overpass mirrors are
    // often overloaded, so two misses in a row stop the fallback for a
    // while instead of making every announcement wait for them.
    if (this.#overpassFailures >= 2 && Date.now() < this.#overpassSkipUntil) return [];
    try {
      const ways = await this.#throttle(() => this.#overpass(keyword));
      this.#overpassFailures = 0;
      return groupRoads(ways.filter((way) => nameMatches(way.tags?.["name"] ?? "", keyword)), 12);
    } catch {
      this.#overpassFailures += 1;
      this.#overpassSkipUntil = Date.now() + 10 * 60_000;
      return [];
    }
  }

  /** Nominatim asks for at most one request a second. */
  async #throttle<T>(call: () => Promise<T>): Promise<T> {
    const wait = 1_050 - (Date.now() - this.#lastCallAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this.#lastCallAt = Date.now();
    return call();
  }
}

/**
 * Whether a street name is the one that was asked for.
 *
 * Nominatim answers with near misses: "Jalan Damai II" for "Damai Raya".
 * The answer is kept only when it carries the words that were written, in
 * either direction, so a shorter official name still matches a longer one
 * the post used.
 */
export function nameMatches(candidate: string, keyword: string): boolean {
  const left = normalizeRoadName(candidate);
  const right = normalizeRoadName(keyword);
  if (left.length < 4 || right.length < 4) return false;
  // The whole name has to agree. "Jalan Damai Raya" is "Damai Raya" with
  // the prefix a writer adds; "Jalan Salam Damai Raya" is another street,
  // and accepting it is how a diversion ends up in the wrong district.
  return left === right;
}

function normalizeRoadName(value: string): string {
  return value
    .toLowerCase()
    .replace(/^(?:jl|jln|jalan|gang|gg)\.?\s+/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * The ways a person might have written the name.
 *
 * OpenStreetMap stores "Jalan Damai Raya"; a post says "Jl. Damai Raya".
 * Both are the same street and both are tried before the search gives up.
 */
export function nameVariants(name: string): string[] {
  const keyword = roadKeyword(name);
  const variants = [name.trim(), keyword, `Jalan ${keyword}`];
  const seen = new Set<string>();
  return variants.filter((variant) => {
    const key = variant.toLowerCase();
    if (seen.has(key) || variant.length < 3) return false;
    seen.add(key);
    return true;
  });
}

function pointOf(pair: [number, number]): Coordinates {
  return { longitude: pair[0], latitude: pair[1] };
}

function sameStreet(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function mergeCenters(
  current: Coordinates,
  next: Coordinates,
  count: number,
): Coordinates {
  return {
    latitude: (current.latitude * (count - 1) + next.latitude) / count,
    longitude: (current.longitude * (count - 1) + next.longitude) / count,
  };
}

function centerOf(geometry: readonly [number, number][]): Coordinates | null {
  if (geometry.length === 0) return null;
  let latitude = 0;
  let longitude = 0;
  for (const [lon, lat] of geometry) {
    latitude += lat;
    longitude += lon;
  }
  return {
    latitude: latitude / geometry.length,
    longitude: longitude / geometry.length,
  };
}

function pathMeters(geometry: readonly [number, number][]): number {
  let total = 0;
  for (let index = 0; index + 1 < geometry.length; index += 1) {
    const from = geometry[index];
    const to = geometry[index + 1];
    if (!from || !to) continue;
    total += metersBetween(pointOf(from), pointOf(to));
  }
  return total;
}

/** Metres between two coordinates on a flat local projection. */
export function metersBetween(from: Coordinates, to: Coordinates): number {
  const reference = (from.latitude + to.latitude) / 2;
  const x = (to.longitude - from.longitude) * 111_320 * Math.cos((reference * Math.PI) / 180);
  const y = (to.latitude - from.latitude) * 110_540;
  return Math.hypot(x, y);
}

/** Distance from a point to a segment, in metres. */
export function distanceToSegment(point: Coordinates, from: Coordinates, to: Coordinates): number {
  const scaleX = 111_320 * Math.cos((point.latitude * Math.PI) / 180);
  const scaleY = 110_540;
  // The point is the origin of the local projection, so its own offset is 0.
  const ax = (from.longitude - point.longitude) * scaleX;
  const ay = (from.latitude - point.latitude) * scaleY;
  const bx = (to.longitude - point.longitude) * scaleX;
  const by = (to.latitude - point.latitude) * scaleY;

  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(ax, ay);
  const t = Math.max(0, Math.min(1, (-ax * dx - ay * dy) / lengthSquared));
  return Math.hypot(ax + t * dx, ay + t * dy);
}
