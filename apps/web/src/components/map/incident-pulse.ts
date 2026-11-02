/**
 * The outline that spreads from a notice.
 *
 * The icon stays put. Only an outline of the same rounded plate
 * travels, so the place can still be read while it asks for attention.
 * One cycle is a breath, not a blink: a faster loop would read as an alarm.
 *
 * The plate is 22.4 px at the ordinary icon size. The outline starts
 * flush with that plate and travels 8 px further, the same short step
 * the old ring used. The motion is linear because it repeats for as
 * long as the notice is on the map. `prefers-reduced-motion` hides it.
 */

export const INCIDENT_PULSE_PERIOD_MS = 1800;

/** 32 px image at icon-size 0.7. */
const PLATE_PX = 22.4;
const TRAVEL_PX = 8;
const SCALE_FROM = 1;
const SCALE_SPAN = TRAVEL_PX / PLATE_PX;
const OPACITY_PEAK = 0.4;

export type IncidentPulsePaint = {
  /** Multiplier on the icon's own size. 1 sits on the plate. */
  scale: number;
  opacity: number;
};

/** Scale and opacity of the plate outline at `elapsedMs` into the loop. */
export function incidentPulsePaint(elapsedMs: number): IncidentPulsePaint {
  const wrapped =
    ((elapsedMs % INCIDENT_PULSE_PERIOD_MS) + INCIDENT_PULSE_PERIOD_MS) %
    INCIDENT_PULSE_PERIOD_MS;
  const progress = wrapped / INCIDENT_PULSE_PERIOD_MS;
  return {
    scale: SCALE_FROM + progress * SCALE_SPAN,
    opacity: OPACITY_PEAK * (1 - progress),
  };
}
