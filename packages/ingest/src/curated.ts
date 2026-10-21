import { readFile } from "node:fs/promises";

/**
 * The curated layer.
 *
 * The research reports hold what a machine-readable feed cannot: the
 * official corridor names, the operators, the service hours, the official
 * stop lists in their official order and the interchange notes. The OSM
 * extraction holds the machine-readable geometry and coordinates.
 *
 * This module reads the curated reports and normalises them into one shape
 * the merger can consume.
 */

export type CuratedStation = {
  name: string;
  latitude: number | null;
  longitude: number | null;
  code?: string | null;
  note?: string;
  /** The other names the same place is known by. */
  aliases?: string[];
};

export type CuratedLine = {
  /** The curated system's key, e.g. "transjakarta-brt". */
  sourceKey: string;
  code: string;
  name: string;
  operator: string | null;
  lengthKm: number | null;
  status: string;
  serviceClass: string | null;
  description: string;
  stations: CuratedStation[];
  sources: string[];
};

export type CuratedDocument = {
  lines: CuratedLine[];
  notes: string[];
};

type RawCorridor = {
  code?: unknown;
  serviceClass?: unknown;
  name?: unknown;
  operator?: unknown;
  lengthKm?: unknown;
  status?: unknown;
  corridorType?: unknown;
  description?: unknown;
  stations?: unknown;
  sources?: unknown;
  serviceHours?: unknown;
};

type RawSystem = {
  systemId?: unknown;
  serviceClass?: unknown;
  corridors?: unknown;
  lines?: unknown;
};

type RawDocument = {
  systems?: unknown;
  notes?: unknown;
};

const SERVICE_CLASS_HINTS: ReadonlyArray<{ pattern: RegExp; serviceClass: string }> = [
  { pattern: /mikrotrans/i, serviceClass: "mikrotrans" },
  { pattern: /minitrans/i, serviceClass: "minitrans" },
  { pattern: /^brt|brt$/i, serviceClass: "brt" },
  { pattern: /metrotrans|royaltrans|amal|ojek|non-?brt|pengumpan/i, serviceClass: "non-brt" },
  { pattern: /rapid-?transit|metro/i, serviceClass: "rapid-transit" },
  { pattern: /lrt|light-?rail/i, serviceClass: "lrt" },
  { pattern: /commuter|krl/i, serviceClass: "commuter-rail" },
];

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/**
 * Normalise a curated route code.
 *
 * The curated reports write "JAK.06"; OpenStreetMap writes "JAK006" for the
 * same route. Both become "JAK.06" here.
 */
export function normalizeRouteCode(code: string): string {
  const trimmed = code.trim();
  const mikro = /^jak\.?0*(\d+)([a-z]?)$/i.exec(trimmed);
  if (mikro) {
    return `JAK.${mikro[1]?.padStart(2, "0") ?? "00"}${mikro[2]?.toLowerCase() ?? ""}`;
  }
  return trimmed;
}

/** Read and normalise a curated research document. */
export async function loadCurated(path: string): Promise<CuratedDocument> {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as RawDocument;
  const systems = Array.isArray(parsed.systems) ? (parsed.systems as RawSystem[]) : [];
  const lines: CuratedLine[] = [];

  for (const system of systems) {
    const sourceKey = firstString(system.systemId) ?? "unknown";
    const systemServiceClass = firstString(system.serviceClass);
    const rawLines = [
      ...(Array.isArray(system.corridors) ? (system.corridors as RawCorridor[]) : []),
      ...(Array.isArray(system.lines) ? (system.lines as RawCorridor[]) : []),
    ];

    for (const rawLine of rawLines) {
      const code = firstString(rawLine.code);
      if (!code) continue;

      const stations: CuratedStation[] = [];
      for (const station of Array.isArray(rawLine.stations) ? rawLine.stations : []) {
        const entry = station as Record<string, unknown>;
        const name = firstString(entry["name"], entry["station"], entry["stop"]);
        if (!name) continue;
        const note = firstString(entry["note"], entry["description"]) ?? "";
        stations.push({
          name,
          latitude: firstNumber(entry["latitude"], entry["lat"]),
          longitude: firstNumber(entry["longitude"], entry["lon"], entry["lng"]),
          code: firstString(entry["code"], entry["stationCode"]) ?? null,
          note,
          aliases: interchangeAliases(note),
        });
      }

      const serviceClass =
        firstString(rawLine.serviceClass) ??
        systemServiceClass ??
        inferServiceClass(`${sourceKey} ${firstString(rawLine.corridorType) ?? ""}`);

      lines.push({
        sourceKey,
        code: normalizeRouteCode(code),
        name: firstString(rawLine.name) ?? code,
        operator: firstString(rawLine.operator),
        lengthKm: firstNumber(rawLine.lengthKm),
        status: firstString(rawLine.status) ?? "operating",
        serviceClass,
        description: firstString(rawLine.description) ?? "",
        stations,
        sources: toStringArray(rawLine.sources),
      });
    }
  }

  return { lines: dedupeLines(lines), notes: toStringArray(parsed.notes) };
}

/**
 * How much a curated record is trusted when two records describe the same
 * route.
 *
 * The official route maps win over inferred lists: the "Angkutan Pengumpan"
 * list is published by the operator, while the "MiniTrans" list was inferred
 * from operator attribution and overlaps it.
 */
const SOURCE_PRIORITY: readonly string[] = [
  "transjakarta-brt",
  "transjakarta-angkutan-pengumpan",
  "transjakarta-mikrotrans",
  "transjakarta-minitrans",
  "mrt-jakarta",
  "lrt-jakarta",
  "lrt-jabodebek",
  "krl-jabodetabek",
];

function priorityOf(sourceKey: string): number {
  const index = SOURCE_PRIORITY.indexOf(sourceKey);
  return index === -1 ? SOURCE_PRIORITY.length : index;
}

/**
 * Merge curated records that describe the same route.
 *
 * The most authoritative record provides the stop list; the others
 * contribute their operators and sources, so nothing that was researched is
 * thrown away.
 */
export function dedupeLines(lines: readonly CuratedLine[]): CuratedLine[] {
  const byKey = new Map<string, CuratedLine>();

  for (const line of lines) {
    const key = `${systemKeyOf(line.sourceKey)}:${line.code.toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...line, stations: [...line.stations] });
      continue;
    }

    const winner = priorityOf(line.sourceKey) < priorityOf(existing.sourceKey) ? line : existing;
    const loser = winner === line ? existing : line;

    const operators = new Set(
      [existing.operator, line.operator].filter((operator): operator is string => Boolean(operator)),
    );
    const sources = [...new Set([...existing.sources, ...line.sources])];
    const stations =
      winner.stations.length >= loser.stations.length ? winner.stations : loser.stations;

    byKey.set(key, {
      ...winner,
      operator: [...operators].join(", ") || null,
      sources,
      stations: [...stations],
    });
  }

  return [...byKey.values()];
}

/**
 * The other names of a place, taken from the interchange notes.
 *
 * The research notes read "Interchange: Transjakarta Corridor 1 (Dukuh
 * Atas) and Corridors 4/6 (Galunggung)", which is how a rider would name
 * the place. Those names become aliases, so a search for "Galunggung"
 * finds the interchange rather than a halte that merely shares a fragment.
 */
export function interchangeAliases(note: string): string[] {
  if (!note.toLowerCase().includes("interchange")) return [];
  const section = note.slice(note.toLowerCase().indexOf("interchange"));
  const names = new Set<string>();

  for (const match of section.matchAll(/\(([^)]{2,40})\)/g)) {
    const value = match[1]?.trim();
    if (!value) continue;
    if (/^(planned|renamed|formerly|also|besides|via|and|or)\b/i.test(value)) continue;
    names.add(value);
  }

  return [...names];
}

/** The system a curated record belongs to, without its service class. */
function systemKeyOf(sourceKey: string): string {
  const key = sourceKey.toLowerCase();
  if (key.includes("transjakarta")) return "transjakarta";
  if (key.includes("mrt")) return "mrt-jakarta";
  if (key.includes("jabodebek")) return "lrt-jabodebek";
  if (key.includes("lrt")) return "lrt-jakarta";
  if (key.includes("krl") || key.includes("commuter")) return "krl-jabodetabek";
  return sourceKey;
}

/** Guess the service class from a system's name and a corridor type label. */
export function inferServiceClass(hint: string): string {
  for (const entry of SERVICE_CLASS_HINTS) {
    if (entry.pattern.test(hint)) return entry.serviceClass;
  }
  return "non-brt";
}
