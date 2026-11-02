/**
 * The identity of a physical boarding point.
 *
 * A station is the stop area a rider searches for; a platform is the place
 * the vehicle stops. Two lines that share a bay share the id, and the two
 * sides of a road do not. The id is stable across rebuilds because it is
 * built from the data, not from an array index.
 */
export function platformId(
  stationId: string,
  latitude: number,
  longitude: number,
): string {
  return `${stationId}:${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}
