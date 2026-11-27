/**
 * Small numeric helpers shared by the M3E components.
 *
 * They are pure, so a unit test can exercise the bound rules without a DOM.
 */

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Clamp a progress value to the 0..1 range the components accept. */
export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/** A 0..1 value as a CSS percentage with two decimals. */
export function percentOf(value: number): string {
  return `${(clamp01(value) * 100).toFixed(2)}%`;
}

/** Move through a ring of `count` items and wrap. */
export function wrapIndex(current: number, count: number, delta: number): number {
  if (count <= 0) return 0;
  return (((current + delta) % count) + count) % count;
}

/** A React `useId()` value as a safe fragment of an HTML id or a `url(#…)`. */
export function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "");
}
