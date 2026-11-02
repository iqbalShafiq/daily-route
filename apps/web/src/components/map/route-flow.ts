/**
 * The dash that travels along a ride.
 *
 * The pattern is the one MapLibre uses to move a dash without an offset.
 * Every step has the same length and the same number of pieces. A step
 * whose length changes makes MapLibre rebuild the line, and after a few
 * highlights that rebuild shows up as the route blinking.
 */

export const ROUTE_FLOW_PERIOD_MS = 1400;

const SEQUENCE: readonly (readonly number[])[] = [
  [0, 4, 3, 0],
  [0.5, 4, 2.5, 0],
  [1, 4, 2, 0],
  [1.5, 4, 1.5, 0],
  [2, 4, 1, 0],
  [2.5, 4, 0.5, 0],
  [3, 4, 0, 0],
  [0, 0.5, 3, 3.5],
  [0, 1, 3, 3],
  [0, 1.5, 3, 2.5],
  [0, 2, 3, 2],
  [0, 2.5, 3, 1.5],
  [0, 3, 3, 1],
  [0, 3.5, 3, 0.5],
];

/** Which step of the loop `elapsedMs` falls on. */
export function routeFlowIndex(elapsedMs: number): number {
  const wrapped =
    ((elapsedMs % ROUTE_FLOW_PERIOD_MS) + ROUTE_FLOW_PERIOD_MS) % ROUTE_FLOW_PERIOD_MS;
  const index = Math.floor((wrapped / ROUTE_FLOW_PERIOD_MS) * SEQUENCE.length);
  return index % SEQUENCE.length;
}

/** The dash array at `elapsedMs` into the loop. One step, not a blend. */
export function routeFlowDash(elapsedMs: number): number[] {
  const step = SEQUENCE[routeFlowIndex(elapsedMs)] ?? SEQUENCE[0] ?? [0, 4, 3, 0];
  return [...step];
}
