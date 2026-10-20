/**
 * Geospatial helpers shared by the routing engine, the semantic resolver and
 * the API. Everything works in WGS84 decimal degrees.
 */

export type Coordinates = {
  latitude: number;
  longitude: number;
};

const EARTH_RADIUS_KM = 6371.0088;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Great-circle distance in kilometres between two coordinates.
 *
 * Uses the haversine formula, which is numerically stable for the short
 * distances a city transit network deals with.
 */
export function haversineKm(from: Coordinates, to: Coordinates): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial bearing from `from` to `to`, in degrees clockwise from north. */
export function bearingDegrees(from: Coordinates, to: Coordinates): number {
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const dLon = toRadians(to.longitude - from.longitude);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/** Arithmetic mean of a list of coordinates. Empty input returns `null`. */
export function centroid(coordinates: readonly Coordinates[]): Coordinates | null {
  if (coordinates.length === 0) return null;
  let lat = 0;
  let lon = 0;
  for (const point of coordinates) {
    lat += point.latitude;
    lon += point.longitude;
  }
  return { latitude: lat / coordinates.length, longitude: lon / coordinates.length };
}

/** True when the point is inside the inclusive bounding box. */
export function isInsideBounds(
  point: Coordinates,
  bounds: { minLat: number; minLon: number; maxLat: number; maxLon: number },
): boolean {
  return (
    point.latitude >= bounds.minLat &&
    point.latitude <= bounds.maxLat &&
    point.longitude >= bounds.minLon &&
    point.longitude <= bounds.maxLon
  );
}

/**
 * Linear interpolation between two coordinates.
 *
 * `t` is clamped to `[0, 1]`, so the result never leaves the segment.
 */
export function interpolate(from: Coordinates, to: Coordinates, t: number): Coordinates {
  const ratio = Math.min(1, Math.max(0, t));
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * ratio,
    longitude: from.longitude + (to.longitude - from.longitude) * ratio,
  };
}

/**
 * Point at a given fraction of the way along a polyline, measured by
 * cumulative segment length. Used to place a vehicle or alert marker.
 */
export function pointAlongPath(
  path: readonly Coordinates[],
  fraction: number,
): Coordinates | null {
  if (path.length === 0) return null;
  if (path.length === 1) return path[0] ?? null;

  const total = pathLengthKm(path);
  if (total === 0) return path[0] ?? null;

  const target = Math.min(1, Math.max(0, fraction)) * total;
  let travelled = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    const from = path[index];
    const to = path[index + 1];
    if (!from || !to) continue;
    const segment = haversineKm(from, to);
    if (travelled + segment >= target) {
      const ratio = segment === 0 ? 0 : (target - travelled) / segment;
      return interpolate(from, to, ratio);
    }
    travelled += segment;
  }
  return path[path.length - 1] ?? null;
}

/** Total length of a polyline in kilometres. */
export function pathLengthKm(path: readonly Coordinates[]): number {
  let total = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    const from = path[index];
    const to = path[index + 1];
    if (!from || !to) continue;
    total += haversineKm(from, to);
  }
  return total;
}

/**
 * Travel time for a walking transfer.
 *
 * 4.5 km/h is the usual urban walking pace; the ceiling keeps a very long
 * transfer from dominating a route as if it were a ride.
 */
export function walkingMinutes(distanceKm: number): number {
  const speedKmPerHour = 4.5;
  return Math.round((distanceKm / speedKmPerHour) * 60);
}
