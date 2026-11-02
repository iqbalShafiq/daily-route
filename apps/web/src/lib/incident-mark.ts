/**
 * The mark on a notice.
 *
 * Jev chooses one of these for a new announcement. A notice that has
 * no choice yet uses the kind the classifier already stored. The same
 * keys live in `packages/agent/src/marks.ts`.
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

export function isIncidentMark(value: string | null | undefined): value is IncidentMark {
  return typeof value === "string" && (INCIDENT_MARKS as readonly string[]).includes(value);
}

/** The image id MapLibre uses for this mark. */
export function incidentImageId(mark: IncidentMark): string {
  return `incident-${mark}`;
}

/**
 * The mark to draw.
 *
 * A stored choice wins, including "unknown" when Jev was sure the text
 * did not say. A missing choice falls back to the stored kind.
 */
export function incidentMarkOf(mark: string | null | undefined, kind: string): IncidentMark {
  if (isIncidentMark(mark)) return mark;
  switch (kind) {
    case "closure":
      return "closure";
    case "diversion":
    case "service-change":
      return "diversion";
    case "delay":
      return "delay";
    case "maintenance":
      return "maintenance";
    case "strike":
      return "strike";
    case "weather":
      return "weather";
    default:
      return "unknown";
  }
}

export const INCIDENT_MARK_LABEL: Record<IncidentMark, string> = {
  crash: "Collision",
  closure: "Closure",
  diversion: "Diversion",
  delay: "Delay",
  flood: "Flood",
  fire: "Fire",
  maintenance: "Works",
  weather: "Weather",
  crowd: "Crowd",
  strike: "Stoppage",
  unknown: "Notice",
};
