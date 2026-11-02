/**
 * Places that are not a halte or a stasiun.
 *
 * The browser never calls the geocoder. This module asks Nominatim, keeps
 * only places inside Jabodetabek, and fails open: a geocoder that does not
 * answer leaves the station list as it was.
 */

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

/** The box the network covers: Bogor, Depok, Tangerang, Bekasi, Jakarta. */
export const JABODETABEK = {
  minLongitude: 106.4,
  maxLongitude: 107.2,
  minLatitude: -6.7,
  maxLatitude: -6.05,
} as const;

const CACHE_MS = 10 * 60 * 1000;

export type GeocodedPlace = {
  id: string;
  name: string;
  detail: string | null;
  latitude: number;
  longitude: number;
};

type NominatimPlace = {
  place_id?: number;
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  address?: Record<string, string>;
};

const cache = new Map<string, { at: number; places: GeocodedPlace[] }>();

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
 * An empty list means the geocoder had nothing, or it could not be reached.
 * It is never an error the rider has to recover from.
 */
export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<GeocodedPlace[]> {
  const key = query.trim().toLowerCase();
  if (key.length < 3) return [];

  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.places;

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
    limit: "5",
    countrycodes: "id",
    viewbox,
    bounded: "1",
  }).toString()}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "daily-route/0.1 (Jakarta transit planner)",
        Accept: "application/json",
      },
      signal: signal ?? AbortSignal.timeout(4_000),
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) return [];

    const places = payload
      .map((entry) => placeOf(entry))
      .filter((place): place is GeocodedPlace => place !== null)
      .slice(0, 3);

    cache.set(key, { at: Date.now(), places });
    return places;
  } catch {
    return [];
  }
}

function placeOf(value: unknown): GeocodedPlace | null {
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
    latitude,
    longitude,
  };
}

function cleanName(value: string | undefined): string | null {
  const name = value?.trim();
  if (!name) return null;
  return name.length > 80 ? name.slice(0, 80).trimEnd() : name;
}
