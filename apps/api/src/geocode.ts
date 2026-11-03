/**
 * Places that are not a halte or a stasiun.
 *
 * Two OpenStreetMap indexes answer. Photon is built for the name a rider
 * is still typing, so "grand" already finds Grand Indonesia. Nominatim
 * answers an address or a complete name, which is what a rider pastes
 * from a message. A place OpenStreetMap does not hold is still missing:
 * this is the completeness of the open map, not of a business directory.
 *
 * The browser never calls a geocoder. This module keeps only places
 * inside Jabodetabek and fails open: a geocoder that does not answer
 * leaves the station list as it was.
 */

const PHOTON = "https://photon.komoot.io/api/";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

/** The box the network covers: Bogor, Depok, Tangerang, Bekasi, Jakarta. */
export const JABODETABEK = {
  minLongitude: 106.4,
  maxLongitude: 107.2,
  minLatitude: -6.7,
  maxLatitude: -6.05,
} as const;

const CACHE_MS = 10 * 60 * 1000;
const FAILURE_CACHE_MS = 60 * 1000;
const MAXIMUM_PLACES = 6;
const PHOTON_TIMEOUT_MS = 5_000;
const NOMINATIM_TIMEOUT_MS = 4_000;

type SourceResult = { places: GeocodedPlace[]; ok: boolean };

export type GeocodedPlace = {
  id: string;
  name: string;
  /** The neighbourhood or the road, for the second line of a suggestion. */
  detail: string | null;
  /** A short type label: Mall, University, Street, Place. */
  kind: string;
  latitude: number;
  longitude: number;
};

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type GeocodeOptions = {
  signal?: AbortSignal;
  /** Injected so a test can answer without a network. */
  fetch?: FetchLike;
};

type PhotonFeature = {
  geometry?: { coordinates?: unknown };
  properties?: {
    osm_type?: string;
    osm_id?: number;
    name?: string;
    street?: string;
    district?: string;
    city?: string;
    county?: string;
    osm_value?: string;
    countrycode?: string;
  };
};

type NominatimPlace = {
  place_id?: number;
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  category?: string;
  type?: string;
  address?: Record<string, string>;
};

const cache = new Map<string, { expiresAt: number; places: GeocodedPlace[] }>();

/** Whether a coordinate sits inside the area this app plans for. */
export function insideJabodetabek(latitude: number, longitude: number): boolean {
  return (
    latitude >= JABODETABEK.minLatitude &&
    latitude <= JABODETABEK.maxLatitude &&
    longitude >= JABODETABEK.minLongitude &&
    longitude <= JABODETABEK.maxLongitude
  );
}

/**
 * Places whose name matches the query.
 *
 * An empty list means the geocoders had nothing, or they could not be
 * reached. It is never an error the rider has to recover from.
 */
export async function searchPlaces(
  query: string,
  options: GeocodeOptions = {},
): Promise<GeocodedPlace[]> {
  const key = query.trim().toLowerCase();
  if (key.length < 2) return [];

  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.places;

  const fetchImpl = options.fetch ?? fetch;
  const signal = options.signal;
  /*
   * "grand indonesia mall" is three words for a place whose own name is
   * two. Photon reads the first and the last, so the same search is also
   * asked with the opening words. Both run together; the answer is one
   * list.
   */
  const trimmed = query.trim();
  const leading = trimmed.split(/\s+/).filter(Boolean).slice(0, 2).join(" ");
  const queries =
    leading.length >= 4 && leading !== trimmed ? [trimmed, leading] : [trimmed];
  const photon = await readPhotonMany(fetchImpl, queries, signal);
  // Photon is the autocomplete index; one or two answers are enough. A
  // thinner list leaves room for Nominatim to place an exact address.
  const nominatim =
    photon.places.length < 3
      ? await readNominatim(fetchImpl, query, signal)
      : { places: [], ok: true };

  const places = dedupe([...photon.places, ...nominatim.places]).slice(0, MAXIMUM_PLACES);
  /*
   * Photon owns the answers a rider sees first. When it did not answer,
   * the Nominatim list is a weaker stand-in: keep it for a minute so a
   * recovered Photon is asked again, instead of hiding it for ten.
   */
  cache.set(key, {
    expiresAt: Date.now() + (photon.ok ? CACHE_MS : FAILURE_CACHE_MS),
    places,
  });
  return places;
}

async function readPhotonMany(
  fetchImpl: FetchLike,
  queries: readonly string[],
  signal: AbortSignal | undefined,
): Promise<SourceResult> {
  const results = await Promise.all(
    queries.map((query) => readPhoton(fetchImpl, query, signal)),
  );
  return {
    places: dedupe(results.flatMap((result) => result.places)).slice(0, 8),
    ok: results.some((result) => result.ok),
  };
}

async function readPhoton(
  fetchImpl: FetchLike,
  query: string,
  signal: AbortSignal | undefined,
): Promise<SourceResult> {
  const url = `${PHOTON}?${new URLSearchParams({
    q: query.trim(),
    limit: "8",
    lang: "en",
    lat: "-6.2",
    lon: "106.816",
    location_bias_scale: "0.5",
    bbox: [
      JABODETABEK.minLongitude,
      JABODETABEK.minLatitude,
      JABODETABEK.maxLongitude,
      JABODETABEK.maxLatitude,
    ].join(","),
  }).toString()}`;

  try {
    const response = await fetchImpl(url, {
      headers: {
        "User-Agent": "daily-route/0.1 (Jakarta transit planner)",
        Accept: "application/json",
      },
      signal: signal ?? AbortSignal.timeout(PHOTON_TIMEOUT_MS),
    });
    if (!response.ok) return { places: [], ok: false };
    const payload = (await response.json()) as { features?: unknown };
    if (!Array.isArray(payload.features)) return { places: [], ok: false };

    return {
      places: payload.features
        .map((entry) => photonPlaceOf(entry))
        .filter((place): place is GeocodedPlace => place !== null),
      ok: true,
    };
  } catch {
    return { places: [], ok: false };
  }
}

async function readNominatim(
  fetchImpl: FetchLike,
  query: string,
  signal: AbortSignal | undefined,
): Promise<SourceResult> {
  const viewbox = [
    JABODETABEK.minLongitude,
    JABODETABEK.maxLatitude,
    JABODETABEK.maxLongitude,
    JABODETABEK.minLatitude,
  ].join(",");

  const url = `${NOMINATIM}?${new URLSearchParams({
    q: query.trim(),
    format: "jsonv2",
    addressdetails: "1",
    dedupe: "1",
    limit: "8",
    countrycodes: "id",
    "accept-language": "id,en",
    viewbox,
    bounded: "1",
  }).toString()}`;

  try {
    const response = await fetchImpl(url, {
      headers: {
        "User-Agent": "daily-route/0.1 (Jakarta transit planner)",
        Accept: "application/json",
      },
      signal: signal ?? AbortSignal.timeout(NOMINATIM_TIMEOUT_MS),
    });
    if (!response.ok) return { places: [], ok: false };
    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) return { places: [], ok: false };

    return {
      places: payload
        .map((entry) => nominatimPlaceOf(entry))
        .filter((place): place is GeocodedPlace => place !== null),
      ok: true,
    };
  } catch {
    return { places: [], ok: false };
  }
}

function photonPlaceOf(value: unknown): GeocodedPlace | null {
  if (!value || typeof value !== "object") return null;
  const feature = value as PhotonFeature;
  const coordinates = feature.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  const longitude = Number(coordinates[0]);
  const latitude = Number(coordinates[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (!insideJabodetabek(latitude, longitude)) return null;

  const properties = feature.properties ?? {};
  const name =
    cleanName(properties.name) ??
    cleanName(properties.street) ??
    cleanName(properties.district);
  if (!name) return null;

  const detail =
    properties.street ?? properties.district ?? properties.city ?? properties.county ?? null;

  return {
    id: `place:${properties.osm_type ?? "osm"}:${properties.osm_id ?? `${latitude.toFixed(5)},${longitude.toFixed(5)}`}`,
    name,
    detail,
    kind: kindOf(properties.osm_value),
    latitude,
    longitude,
  };
}

function nominatimPlaceOf(value: unknown): GeocodedPlace | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as NominatimPlace;
  const latitude = Number(entry.lat);
  const longitude = Number(entry.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (!insideJabodetabek(latitude, longitude)) return null;

  const name = cleanName(entry.name) ?? cleanName(entry.display_name?.split(",")[0]);
  if (!name) return null;

  const address = entry.address ?? {};
  const detail =
    address["suburb"] ??
    address["city_district"] ??
    address["town"] ??
    address["city"] ??
    address["road"] ??
    null;

  return {
    id: `place:${entry.place_id ?? `${latitude.toFixed(5)},${longitude.toFixed(5)}`}`,
    name,
    detail,
    kind: kindOf(entry.type ?? entry.category),
    latitude,
    longitude,
  };
}

/**
 * The same place from two indexes is one row.
 *
 * Photon and Nominatim both point at OpenStreetMap, so the same mall
 * arrives twice with two ids. A name that matches within about 150 m is
 * one place; the first answer keeps its position.
 */
function dedupe(places: readonly GeocodedPlace[]): GeocodedPlace[] {
  const kept: GeocodedPlace[] = [];
  for (const place of places) {
    const name = normalise(place.name);
    const duplicate = kept.some(
      (other) =>
        other.id === place.id ||
        (normalise(other.name) === name &&
          Math.abs(other.latitude - place.latitude) < 0.0015 &&
          Math.abs(other.longitude - place.longitude) < 0.0015),
    );
    if (!duplicate) kept.push(place);
  }
  return kept;
}

/** A tag value as a label: `shop=mall` reads "Mall". */
function kindOf(value: string | undefined): string {
  const raw = value?.trim();
  if (!raw || raw === "yes") return "Place";
  const words = raw.split(/[_;]/).filter(Boolean).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function cleanName(value: string | undefined): string | null {
  const name = value?.trim();
  if (!name) return null;
  return name.length > 80 ? name.slice(0, 80).trimEnd() : name;
}
