import { readFileSync } from "node:fs";

/**
 * The official corridor list.
 *
 * The operator publishes the corridors it runs on
 * `transjakarta.co.id/rute`, grouped by the kind of service. That list
 * is the truth about **which corridors exist** and **what kind of service
 * each of them is** — two things that cannot be read off OpenStreetMap,
 * where a corridor may be missing, renamed, or tagged with a brand that
 * the operator no longer uses.
 *
 * The document is written by `research/tools/extract-official-routes.py`.
 */

export type OfficialCorridor = {
  /** The corridor code as the operator writes it, without a dot: `JAK44`. */
  code: string;
  /** The corridor name as the operator writes it. */
  name: string;
  /** The kind of service: `brt`, `non-brt`, `mikrotrans`, ... */
  service: string;
};

export type OfficialRoutes = {
  source: string;
  operator?: string;
  note?: string;
  corridors: OfficialCorridor[];
};

/** The path of the document, relative to the repository root. */
export const OFFICIAL_ROUTES_PATH = "research/data/transjakarta-routes.json";

/**
 * Read the official corridor list.
 *
 * A missing document is not fatal: the pipeline then falls back to the
 * curated research and to OpenStreetMap, and says so in its report.
 */
export function loadOfficialRoutes(path: string): OfficialRoutes | null {
  try {
    const document = JSON.parse(readFileSync(path, "utf8")) as OfficialRoutes;
    if (!Array.isArray(document.corridors)) return null;
    return document;
  } catch {
    return null;
  }
}

/**
 * The official corridors, indexed by their normalised code.
 *
 * The operator writes some codes with a dot (`JAK.44`) and some without
 * (`JAK44`); both mean the same corridor.
 */
export function indexOfficialRoutes(
  routes: OfficialRoutes | null,
): ReadonlyMap<string, OfficialCorridor> {
  const index = new Map<string, OfficialCorridor>();
  if (!routes) return index;
  for (const corridor of routes.corridors) {
    const code = corridor.code.replace(/\./g, "").toUpperCase();
    if (code.length === 0) continue;
    index.set(code, { ...corridor, code });
  }
  return index;
}
