/**
 * The case mark Jev may choose for an announcement.
 *
 * The same keys are drawn in the web app. Jev returns one option. A
 * choice below the confidence line is dropped, and the interface then
 * uses the classifier's kind.
 */

export const INCIDENT_MARKS = [
  "crash",
  "closure",
  "diversion",
  "delay",
  "flood",
  "fire",
  "maintenance",
  "weather",
  "crowd",
  "strike",
  "unknown",
] as const;

export type IncidentMark = (typeof INCIDENT_MARKS)[number];

/** Same bar as the operator choice. Below this, the kind is used instead. */
export const MARK_CONFIDENCE = 0.45;

export function isIncidentMark(value: string | undefined): value is IncidentMark {
  return typeof value === "string" && (INCIDENT_MARKS as readonly string[]).includes(value);
}

/** A confident choice, including unknown. A weak choice is dropped. */
export function acceptedMark(choice: string | undefined, confidence: number): IncidentMark | null {
  if (!isIncidentMark(choice)) return null;
  if (confidence < MARK_CONFIDENCE) return null;
  return choice;
}

/** The mark stored on a disruption row, when it is one of the known keys. */
export function storedMark(metadata: unknown): IncidentMark | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>).mark;
  return typeof value === "string" && isIncidentMark(value) ? value : null;
}
