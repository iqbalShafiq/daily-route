/**
 * A small Overpass API client.
 *
 * Overpass is the most complete machine-readable source for Jakarta's
 * transit network: station coordinates, operator tags, route relations with
 * their ordered stops and even the cumulative distance of each stop.
 *
 * The public mirrors are frequently overloaded, so every request is retried
 * with exponential backoff and falls through to the next mirror.
 */

export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
] as const;

const USER_AGENT =
  "daily-route/0.1 (Jakarta transit data pipeline; https://github.com/iqbalShafiq/daily-route)";

export type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  members?: {
    type: "node" | "way" | "relation";
    ref: number;
    role: string;
    lat?: number;
    lon?: number;
  }[];
  tags?: Record<string, string>;
};

export type OverpassResponse = {
  version: number;
  generator: string;
  elements: OverpassElement[];
};

export class OverpassError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "OverpassError";
  }
}

export type OverpassOptions = {
  endpoints?: readonly string[];
  /** Maximum attempts per endpoint before the next one is tried. */
  attemptsPerEndpoint?: number;
  timeoutMs?: number;
};

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 240_000;

/**
 * Run an Overpass query and return its elements.
 *
 * A 429 or 502 is treated as "try again later"; a query error is not, and
 * fails immediately so a malformed query is not retried ten times.
 */
export async function overpass(
  query: string,
  options: OverpassOptions = {},
): Promise<OverpassElement[]> {
  const endpoints = options.endpoints ?? OVERPASS_ENDPOINTS;
  const attempts = options.attemptsPerEndpoint ?? DEFAULT_ATTEMPTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const failures: string[] = [];

  for (const endpoint of endpoints) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": USER_AGENT,
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (response.status === 429 || response.status === 502 || response.status === 503) {
          failures.push(`${endpoint} → ${response.status}`);
          await sleep(backoffMs(attempt));
          continue;
        }

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new OverpassError(
            `Overpass query failed on ${endpoint} with ${response.status}: ${body.slice(0, 400)}`,
          );
        }

        const payload = (await response.json()) as OverpassResponse;
        return payload.elements ?? [];
      } catch (error) {
        if (error instanceof OverpassError) throw error;
        failures.push(`${endpoint} → ${String(error).slice(0, 120)}`);
        await sleep(backoffMs(attempt));
      }
    }
  }

  throw new OverpassError(`Every Overpass endpoint failed: ${failures.join("; ")}`);
}

function backoffMs(attempt: number): number {
  const base = 2_000 * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * 1_000);
  return base + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The bounding box that contains Greater Jakarta's transit network.
 *
 * West: Thousand Islands' PIK area. East: Dekok / Karawang approach.
 * North: Rorot. South: Ciaheuleut and the Jakarta–Bogor corridor start.
 */
export const JAKARTA_BBOX = {
  south: -6.42,
  west: 106.6,
  north: -5.95,
  east: 107.25,
} as const;

export function bboxClause(bbox = JAKARTA_BBOX): string {
  return `(${bbox.south},${bbox.west},${bbox.north},${bbox.east})`;
}
