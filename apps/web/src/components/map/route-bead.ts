/**
 * The enamel bead.
 *
 * One bead travels the open journey once, in about 1.2 seconds, and then it
 * rests at the destination. It is not a live vehicle and it never loops: it
 * is the journey being read, drawn once.
 */

export type BeadPoint = { latitude: number; longitude: number };

export const BEAD_DURATION_MS = 1200;

/** The point at `progress` (0 to 1) along a polyline, measured by length. */
export function beadPointAt(
  points: readonly BeadPoint[],
  progress: number,
): BeadPoint | null {
  if (points.length === 0) return null;
  const first = points[0];
  if (!first) return null;
  if (points.length === 1) return first;

  const lengths: number[] = [];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (!from || !to) continue;
    const length = Math.hypot(to.longitude - from.longitude, to.latitude - from.latitude);
    lengths.push(length);
    total += length;
  }
  if (total === 0) return first;

  const wanted = Math.min(1, Math.max(0, progress)) * total;
  let travelled = 0;
  for (let index = 1; index < points.length; index += 1) {
    const segment = lengths[index - 1] ?? 0;
    const from = points[index - 1];
    const to = points[index];
    if (!from || !to) continue;
    if (travelled + segment >= wanted) {
      const share = segment === 0 ? 0 : (wanted - travelled) / segment;
      return {
        longitude: from.longitude + (to.longitude - from.longitude) * share,
        latitude: from.latitude + (to.latitude - from.latitude) * share,
      };
    }
    travelled += segment;
  }
  return points[points.length - 1] ?? first;
}
