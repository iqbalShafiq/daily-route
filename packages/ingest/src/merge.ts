import { canonicalKey, haversineKm } from "@daily-route/transit";

import { classifyTransjakartaRoute, railServiceClass, SYSTEMS, type SystemId } from "./classify.js";
import { normalizeRouteCode, type CuratedLine } from "./curated.js";
import type { OsmRoute, OsmStop } from "./osm.js";

/**
 * The normalised network that the database is seeded from.
 *
 * The merge is curated-first: the research reports carry the official line
 * names, the official stop lists in their official order, and the operators,
 * while OpenStreetMap carries the machine-readable coordinates and the
 * stops the official list misses.
 */

export type NetworkStation = {
  id: string;
  systemId: SystemId;
  name: string;
  code: string | null;
  latitude: number;
  longitude: number;
  stationType: "stop" | "station" | "terminal";
  zone: string | null;
  isInterchange: boolean;
  description: string;
  area: string | null;
  aliases: string[];
  metadata: Record<string, unknown>;
};

export type NetworkLine = {
  id: string;
  systemId: SystemId;
  code: string;
  name: string;
  mode: string;
  serviceClass: string;
  operator: string;
  status: string;
  color: string | null;
  lengthKm: number | null;
  description: string;
  aliases: string[];
  metadata: Record<string, unknown>;
};

export type NetworkLineStop = {
  lineId: string;
  stationId: string;
  direction: "forward" | "backward";
  position: number;
  distanceFromOriginKm: number | null;
};

export type NetworkStationGroup = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  stationIds: string[];
};

export type TransitNetworkFile = {
  generatedAt: string;
  sources: string[];
  systems: typeof SYSTEMS;
  lines: NetworkLine[];
  stations: NetworkStation[];
  lineStops: NetworkLineStop[];
  stationGroups: NetworkStationGroup[];
  notes: string[];
};

/** Two stops closer than this are treated as the same physical place. */
const SAME_PLACE_RADIUS_KM = 0.18;

/** Slug used inside station and line identifiers. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Assigns stable identifiers to physical places.
 *
 * The same name can appear at two different places, and the same place can
 * be spelled differently by two operators. Names are therefore clustered by
 * proximity within a system.
 */
class StationRegistry {
  readonly #bySystem = new Map<string, { id: string; name: string; latitude: number; longitude: number }[]>();
  readonly #ids = new Map<string, string>();
  readonly #counter = new Map<string, number>();

  resolve(systemId: SystemId, name: string, latitude: number, longitude: number): string {
    const key = `${systemId}::${name.trim().toLowerCase()}`;
    const existing = this.#ids.get(key);
    if (existing) return existing;

    const list = this.#bySystem.get(systemId) ?? [];
    const nearby = list.find(
      (candidate) =>
        candidate.name.trim().toLowerCase() === name.trim().toLowerCase() &&
        haversineKm(candidate, { latitude, longitude }) <= SAME_PLACE_RADIUS_KM,
    );
    if (nearby) {
      this.#ids.set(key, nearby.id);
      return nearby.id;
    }

    const base = `${systemId}:${slugify(name) || "stop"}`;
    const used = this.#counter.get(base) ?? 0;
    const id = used === 0 ? base : `${base}-${used + 1}`;
    this.#counter.set(base, used + 1);
    this.#ids.set(key, id);
    list.push({ id, name, latitude, longitude });
    this.#bySystem.set(systemId, list);
    return id;
  }
}

type MergedStop = {
  stationId: string;
  name: string;
  latitude: number;
  longitude: number;
  code: string | null;
  distanceFromOriginKm: number | null;
};

export type MergeOptions = {
  curated: CuratedLine[];
  osmRoutes: OsmRoute[];
  /** Extra stations that no route relation references. */
  extraStations?: {
    systemId: SystemId;
    name: string;
    latitude: number;
    longitude: number;
    code: string | null;
  }[];
  notes?: string[];
};

/** Merge the curated reports with the OSM extraction into one network. */
export function mergeNetwork(options: MergeOptions): TransitNetworkFile {
  const registry = new StationRegistry();
  const stations = new Map<string, NetworkStation>();
  const lines = new Map<string, NetworkLine>();
  const lineStops: NetworkLineStop[] = [];

  const ensureStation = (input: {
    systemId: SystemId;
    name: string;
    latitude: number;
    longitude: number;
    code: string | null;
    stationType: NetworkStation["stationType"];
    description?: string;
    aliases?: string[];
    metadata?: Record<string, unknown>;
  }): string => {
    const id = registry.resolve(input.systemId, input.name, input.latitude, input.longitude);
    const existing = stations.get(id);
    if (!existing) {
      stations.set(id, {
        id,
        systemId: input.systemId,
        name: input.name,
        code: input.code,
        latitude: input.latitude,
        longitude: input.longitude,
        stationType: input.stationType,
        zone: null,
        isInterchange: false,
        description: input.description ?? "",
        area: null,
        aliases: input.aliases ?? [],
        metadata: input.metadata ?? {},
      });
    } else {
      if (!existing.code && input.code) existing.code = input.code;
      if (!existing.description && input.description) existing.description = input.description;
      for (const alias of input.aliases ?? []) {
        if (!existing.aliases.includes(alias)) existing.aliases.push(alias);
      }
    }
    return id;
  };

  // --- Group the OSM routes by system and code --------------------------

  const osmGroups = new Map<string, OsmRoute[]>();
  for (const route of options.osmRoutes) {
    const key = `${route.systemId}::${normalizeRouteCode(route.code).toLowerCase()}`;
    const list = osmGroups.get(key) ?? [];
    list.push(route);
    osmGroups.set(key, list);
  }

  const consumedOsmKeys = new Set<string>();

  // --- Curated lines ----------------------------------------------------

  for (const curated of options.curated) {
    const systemId = systemForCurated(curated);
    if (!systemId) continue;

    const code = curated.code;
    const osmKey = `${systemId}::${normalizeRouteCode(code).toLowerCase()}`;
    const osmRoutes = osmGroups.get(osmKey) ?? findOsmByName(osmGroups, systemId, curated.name);
    if (osmRoutes) consumedOsmKeys.add(`${osmRoutes[0]?.systemId}::${normalizeRouteCode(osmRoutes[0]?.code ?? "").toLowerCase()}`);

    const primary = osmRoutes?.[0];
    const osmStops = primary?.stops ?? [];
    const serviceClass = resolveServiceClass(systemId, curated, primary);
    const lineId = `${systemId}:${slugify(code) || "route"}`;
    const lineStatus = normalizeStatus(curated.status);
    // A planned line lists its future stations; an operating line must not
    // route through stations that are not open yet.
    const curatedStations =
      lineStatus === "operating"
        ? curated.stations.filter((station) => !isPlanned(station.note ?? ""))
        : curated.stations;

    lines.set(lineId, {
      id: lineId,
      systemId,
      code,
      name: humanizeName(curated.name),
      mode: modeForServiceClass(systemId, serviceClass),
      serviceClass,
      operator: curated.operator ?? operatorFor(systemId),
      status: lineStatus,
      color: primary?.colour ?? null,
      lengthKm: curated.lengthKm,
      description: curated.description,
      aliases: buildAliases(curated, primary),
      metadata: {
        curatedSource: curated.sourceKey,
        curatedSources: curated.sources,
        officialName: curated.name,
        osmRelationIds: (osmRoutes ?? []).map((route) => route.relationId),
        rawName: primary?.rawName ?? null,
        from: primary?.from ?? null,
        to: primary?.to ?? null,
        via: primary?.via ?? null,
      },
    });

    const forward = buildStops({
      systemId,
      curatedStations,
      osmStops,
      ensureStation,
    });
    const backward = buildStops({
      systemId,
      curatedStations: [...curatedStations].reverse(),
      osmStops: [...osmStops].reverse(),
      ensureStation,
    });

    pushStops(lineStops, lineId, forward, "forward");
    pushStops(lineStops, lineId, backward, "backward");
  }

  // --- OSM lines without a curated counterpart --------------------------

  for (const [key, osmRoutes] of osmGroups) {
    if (consumedOsmKeys.has(key)) continue;
    const primary = osmRoutes[0];
    if (!primary) continue;

    const code = normalizeRouteCode(primary.code) || `route-${primary.relationId}`;
    const serviceClass = resolveServiceClass(primary.systemId, undefined, primary);
    const lineId = `${primary.systemId}:${slugify(code) || `route-${primary.relationId}`}`;

    if (lines.has(lineId)) continue;

    lines.set(lineId, {
      id: lineId,
      systemId: primary.systemId,
      code,
      name: primary.routeName || code,
      mode: modeForServiceClass(primary.systemId, serviceClass),
      serviceClass,
      operator: primary.operator ?? operatorFor(primary.systemId),
      status: "operating",
      color: primary.colour,
      lengthKm: null,
      description: "",
      aliases: [],
      metadata: {
        osmRelationIds: osmRoutes.map((route) => route.relationId),
        rawName: primary.rawName,
        from: primary.from,
        to: primary.to,
        via: primary.via,
      },
    });

    const forward = buildStops({
      systemId: primary.systemId,
      curatedStations: [],
      osmStops: primary.stops,
      ensureStation,
    });
    // The opposite direction is its own relation. When that relation
    // resolves to no stops at all, the forward relation is reversed, so the
    // line can still be travelled the other way.
    const backwardStops =
      osmRoutes[1] && osmRoutes[1].stops.length > 0
        ? osmRoutes[1].stops
        : [...primary.stops].reverse();
    const backward = buildStops({
      systemId: primary.systemId,
      curatedStations: [],
      osmStops: backwardStops,
      ensureStation,
    });

    pushStops(lineStops, lineId, forward, "forward");
    pushStops(lineStops, lineId, backward, "backward");
  }

  // --- Extra stations ---------------------------------------------------

  for (const extra of options.extraStations ?? []) {
    ensureStation({
      systemId: extra.systemId,
      name: extra.name,
      latitude: extra.latitude,
      longitude: extra.longitude,
      code: extra.code,
      stationType: "station",
    });
  }

  const stationGroups = buildStationGroups([...stations.values()]);
  for (const group of stationGroups) {
    for (const stationId of group.stationIds) {
      const station = stations.get(stationId);
      if (station) station.isInterchange = true;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    sources: [
      "OpenStreetMap (ODbL) via the Overpass API — station coordinates, route relations and stop order",
      "research/data/transjakarta.json — official corridor names, operators, service hours and stop lists",
      "research/data/rail-jakarta.json — official line and station lists for MRT, LRT and KRL",
    ],
    systems: [...SYSTEMS],
    lines: [...lines.values()],
    stations: [...stations.values()],
    lineStops,
    stationGroups,
    notes: options.notes ?? [],
  };
}

/** Find OSM routes of a system whose name matches a curated line name. */
function findOsmByName(
  groups: Map<string, OsmRoute[]>,
  systemId: SystemId,
  curatedName: string,
): OsmRoute[] | undefined {
  const needle = normalizeLineName(curatedName);
  if (needle.length < 4) return undefined;

  for (const [key, routes] of groups) {
    if (!key.startsWith(`${systemId}::`)) continue;
    const primary = routes[0];
    if (!primary) continue;
    const haystack = normalizeLineName(`${primary.rawName} ${primary.routeName}`);
    if (haystack.includes(needle) || needle.includes(haystack)) return routes;
  }
  return undefined;
}

/** Reduce a line name to comparable words. */
function normalizeLineName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\(([^)]*)\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function systemForCurated(line: CuratedLine): SystemId | null {
  const key = line.sourceKey.toLowerCase();
  if (key.includes("transjakarta")) return "transjakarta";
  if (key.includes("mrt")) return "mrt-jakarta";
  if (key.includes("lrt") && key.includes("jabodebek")) return "lrt-jabodebek";
  if (key.includes("lrt")) return "lrt-jakarta";
  if (key.includes("krl") || key.includes("commuter")) return "krl-jabodetabek";
  return null;
}

/**
 * Turn an all-caps official name into a readable one.
 *
 * The operator's route maps are printed in capitals — "BLOK M - KOTA" — and
 * a rider-facing interface should not shout. Short words that are genuine
 * abbreviations (MRT, LRT, KRL, JIS, PGC, RS) keep their capitals, and a
 * name that is already mixed case is left exactly as it is.
 */
export function humanizeName(value: string): string {
  const letters = value.replace(/[^A-Za-z]/g, "");
  if (letters.length === 0) return value;
  if (letters !== letters.toUpperCase()) return value;

  return value
    .replace(/[A-Za-z]{2,}/g, (word) =>
      word.length <= 3 ? word : `${word[0]}${word.slice(1).toLowerCase()}`,
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * The canonical name of a service class.
 *
 * The curated reports write "mikrotrans" where the domain model writes
 * "feeder"; both mean the same service, so the domain spelling wins.
 */
export function normalizeServiceClass(value: string): string {
  const key = value.trim().toLowerCase();
  if (key === "mikrotrans" || key === "feeder") return "feeder";
  if (key === "metrotrans" || key === "non-brt" || key === "nonbrt") return "non-brt";
  if (key === "minitrans") return "minitrans";
  if (key === "brt") return "brt";
  if (key === "rapid-transit") return "rapid-transit";
  if (key === "lrt" || key === "light-rail") return "lrt";
  if (key === "commuter-rail") return "commuter-rail";
  return key;
}

function resolveServiceClass(
  systemId: SystemId,
  curated: CuratedLine | undefined,
  osmRoute: OsmRoute | undefined,
): string {
  if (systemId === "transjakarta") {
    // The OSM relation name states the brand outright ("Minitrans 1M",
    // "Metrotrans 5F", "Transjakarta BRT 1"), so it outranks the curated
    // class, which is often only an inferred fleet tier.
    const fromOsm = classifyTransjakartaRoute(osmRoute?.rawName ?? "");
    if (fromOsm.brand !== "Transjakarta") return normalizeServiceClass(fromOsm.serviceClass);
    if (curated?.serviceClass) return normalizeServiceClass(curated.serviceClass);
    return normalizeServiceClass(fromOsm.serviceClass);
  }
  if (curated?.serviceClass) return normalizeServiceClass(curated.serviceClass);
  if (systemId === "mrt-jakarta") return railServiceClass("metro");
  if (systemId === "lrt-jakarta" || systemId === "lrt-jabodebek") return railServiceClass("tram");
  return railServiceClass("rail");
}

/**
 * Whether a station note marks the station as not open yet.
 *
 * The research notes are explicit about it: "Phase 2A, underground
 * (planned)", "under construction". Those stations must not be routable.
 */
export function isPlanned(note: string): boolean {
  return /\(planned\)|under construction|belum dibangun|direncanakan/i.test(note);
}

function modeForServiceClass(systemId: SystemId, serviceClass: string): string {
  if (systemId !== "transjakarta") {
    return systemId === "krl-jabodetabek"
      ? "rail"
      : systemId === "mrt-jakarta"
        ? "metro"
        : "tram";
  }
  if (serviceClass === "feeder" || serviceClass === "minitrans") return "minibus";
  return "bus";
}

function operatorFor(systemId: SystemId): string {
  return SYSTEMS.find((system) => system.id === systemId)?.operator ?? "";
}

/**
 * The status of a line.
 *
 * The curated reports write a descriptive status ("operating (Phase 1 …)"),
 * while the schema stores a small vocabulary. A line that is only planned is
 * not routable.
 */
function normalizeStatus(status: string): string {
  const value = status.toLowerCase();
  if (value.includes("under construction") || value.includes("planned")) {
    return value.includes("operating") ? "operating" : "planned";
  }
  if (value.includes("closed") || value.includes("suspended")) return "closed";
  return "operating";
}

function buildAliases(curated: CuratedLine, osmRoute: OsmRoute | undefined): string[] {
  const aliases = new Set<string>();
  if (osmRoute?.routeName && osmRoute.routeName !== curated.name) {
    aliases.add(osmRoute.routeName);
  }
  if (osmRoute?.from && osmRoute?.to) {
    aliases.add(`${osmRoute.from} – ${osmRoute.to}`);
  }
  return [...aliases];
}

type EnsureStation = (input: {
  systemId: SystemId;
  name: string;
  latitude: number;
  longitude: number;
  code: string | null;
  stationType: NetworkStation["stationType"];
  description?: string;
  aliases?: string[];
  metadata?: Record<string, unknown>;
}) => string;

/**
 * Build the ordered stop list of one direction.
 *
 * The curated list wins: it carries the official names and the official
 * order. OSM then contributes the coordinates, and any stop OSM knows about
 * but the curated list does not is appended so nothing is lost.
 */
function buildStops(input: {
  systemId: SystemId;
  curatedStations: CuratedLine["stations"];
  osmStops: OsmStop[];
  ensureStation: EnsureStation;
}): MergedStop[] {
  const { systemId, curatedStations, osmStops, ensureStation } = input;
  const stops: MergedStop[] = [];

  const osmByName = new Map<string, OsmStop[]>();
  for (const stop of osmStops) {
    const key = stop.name.trim().toLowerCase();
    const list = osmByName.get(key) ?? [];
    list.push(stop);
    osmByName.set(key, list);
  }

  const usedOsm = new Set<number>();

  for (const curatedStation of curatedStations) {
    const candidates = osmByName.get(curatedStation.name.trim().toLowerCase()) ?? [];
    const match = candidates.find((candidate) => !usedOsm.has(candidate.nodeId));

    const latitude = curatedStation.latitude ?? match?.latitude ?? null;
    const longitude = curatedStation.longitude ?? match?.longitude ?? null;
    if (latitude === null || longitude === null) continue;

    const stationId = ensureStation({
      systemId,
      name: humanizeName(curatedStation.name),
      latitude,
      longitude,
      code: curatedStation.code ?? match?.code ?? null,
      stationType: "stop",
      description: curatedStation.note ?? "",
      aliases: [
        ...(curatedStation.aliases ?? []),
        ...(match && match.name !== curatedStation.name ? [match.name] : []),
      ],
      metadata: match
        ? {
            osmNodeId: match.nodeId,
            wikidata: match.wikidata,
            wikipedia: match.wikipedia,
            routeRefs: match.routeRefs,
          }
        : {},
    });

    if (match) usedOsm.add(match.nodeId);

    stops.push({
      stationId,
      name: humanizeName(curatedStation.name),
      latitude,
      longitude,
      code: curatedStation.code ?? match?.code ?? null,
      distanceFromOriginKm: null,
    });
  }

  for (const osmStop of osmStops) {
    if (usedOsm.has(osmStop.nodeId)) continue;
    const stationId = ensureStation({
      systemId,
      name: osmStop.name,
      latitude: osmStop.latitude,
      longitude: osmStop.longitude,
      code: osmStop.code,
      stationType: "stop",
      metadata: {
        osmNodeId: osmStop.nodeId,
        wikidata: osmStop.wikidata,
        wikipedia: osmStop.wikipedia,
        routeRefs: osmStop.routeRefs,
      },
    });
    stops.push({
      stationId,
      name: osmStop.name,
      latitude: osmStop.latitude,
      longitude: osmStop.longitude,
      code: osmStop.code,
      distanceFromOriginKm: null,
    });
  }

  return withCumulativeDistance(stops);
}

/** Add the cumulative distance from the first stop to every stop. */
function withCumulativeDistance(stops: MergedStop[]): MergedStop[] {
  let total = 0;
  return stops.map((stop, index) => {
    if (index > 0) {
      const previous = stops[index - 1];
      if (previous) {
        total += haversineKm(previous, stop);
      }
    }
    return { ...stop, distanceFromOriginKm: Number(total.toFixed(3)) };
  });
}

function pushStops(
  target: NetworkLineStop[],
  lineId: string,
  stops: MergedStop[],
  direction: "forward" | "backward",
): void {
  stops.forEach((stop, index) => {
    target.push({
      lineId,
      stationId: stop.stationId,
      direction,
      position: index + 1,
      distanceFromOriginKm: stop.distanceFromOriginKm,
    });
  });
}

/**
 * Detect interchange hubs.
 *
 * Two stations of different systems belong to the same hub when they are
 * within 250 metres and their names match once the operator prefix is
 * removed — "Bundaran HI" (MRT) and "Stasiun Bundaran HI" (KRL) are one
 * place a rider can change vehicles at.
 */
export function buildStationGroups(stations: readonly NetworkStation[]): NetworkStationGroup[] {
  const HUB_RADIUS_KM = 0.25;
  const groups: NetworkStationGroup[] = [];
  const assigned = new Set<string>();

  for (const station of stations) {
    if (assigned.has(station.id)) continue;
    const members = stations.filter(
      (candidate) =>
        candidate.id !== station.id &&
        candidate.systemId !== station.systemId &&
        !assigned.has(candidate.id) &&
        haversineKm(station, candidate) <= HUB_RADIUS_KM &&
        namesMatch(station.name, candidate.name),
    );
    if (members.length === 0) continue;

    const stationIds = [station.id, ...members.map((member) => member.id)];
    for (const id of stationIds) assigned.add(id);
    groups.push({
      id: slugify(`${station.name}-${station.systemId}`),
      name: station.name,
      latitude: station.latitude,
      longitude: station.longitude,
      stationIds,
    });
  }

  return groups;
}

/**
 * Compare two station names, ignoring operator prefixes and suffixes.
 *
 * Containment is what makes this work: "Bundaran HI ASTRA" (Transjakarta)
 * and "Bundaran HI Bank Jakarta" (MRT) are one place, and "Stasiun MRT
 * Lebak Bulus" and "Lebak Bulus Bank Syariah Indonesia" are one place too.
 */
function namesMatch(a: string, b: string): boolean {
  const keyA = canonicalKey(a);
  const keyB = canonicalKey(b);
  if (keyA.length === 0 || keyB.length === 0) return false;
  if (keyA === keyB) return true;
  return keyA.includes(keyB) || keyB.includes(keyA);
}
