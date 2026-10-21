import {
  canonicalKey,
  haversineKm,
  nearestIndexOnPolyline,
  tokenize,
  type Coordinate,
  type FareRules,
  type LineGeometry,
} from "@daily-route/transit";
import { buildLineGeometry } from "./geometry.js";

import { classifyTransjakartaRoute, railServiceClass, SYSTEMS, type SystemId } from "./classify.js";
import { normalizeRouteCode, type CuratedLine } from "./curated.js";
import { indexOfficialRoutes, type OfficialRoutes } from "./official.js";
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
  /** The real path of every line, per direction. */
  lineGeometries: LineGeometry[];
  /** The published tariffs, shaped for the fare engine. */
  fareRules: FareRules;
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
  /** Where the stop stands in the relation, when the relation names it. */
  osmPosition?: number;
};

export type MergeOptions = {
  curated: CuratedLine[];
  /** The published tariffs, shaped for the fare engine. */
  fareRules: FareRules;
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
  /**
   * The corridor list the operator publishes.
   *
   * It decides the kind of service of every corridor, and the corridors
   * that the operator runs but the data does not know yet.
   */
  officialRoutes?: OfficialRoutes | null;
};

/** Merge the curated reports with the OSM extraction into one network. */
export function mergeNetwork(options: MergeOptions): TransitNetworkFile {
  const registry = new StationRegistry();
  const stations = new Map<string, NetworkStation>();
  const lines = new Map<string, NetworkLine>();
  const lineStops: NetworkLineStop[] = [];
  const lineGeometries: LineGeometry[] = [];

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
  const official = indexOfficialRoutes(options.officialRoutes ?? null);

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
    const officialCorridor = official.get(normalizeRouteCode(code).toUpperCase());
    const serviceClass = resolveServiceClass(systemId, curated, primary, officialCorridor?.service);
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
      name: humanizeName(officialCorridor?.name ?? curated.name),
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
        officialName: officialCorridor?.name ?? curated.name,
        officialService: officialCorridor?.service ?? null,
        osmRelationIds: (osmRoutes ?? []).map((route) => route.relationId),
        rawName: primary?.rawName ?? null,
        from: primary?.from ?? null,
        to: primary?.to ?? null,
        via: primary?.via ?? null,
      },
    });

    // The path of the line. The curated report owns the order of the
    // stops, so the path of the relation is flipped when the two
    // disagree.
    const forwardPolyline =
      primary && primary.polyline.length > 1
        ? directionMatches(primary, curatedStations[0])
          ? primary.polyline
          : reversePolyline(primary.polyline)
        : [];

    /*
     * The other direction is the same road, the other way round.
     *
     * The second relation of the operator may trace a slightly different
     * path, and its stop positions do not line up with the ones the
     * report gives, which leaves the path unable to say where the stops
     * are. Reversing the forward path keeps the two directions exact
     * mirrors of each other, the way the stops are.
     */
    const backwardPolyline = reversePolyline(forwardPolyline);

    const forward = buildStops({
      systemId,
      curatedStations,
      osmStops,
      ensureStation,
      extraStations: options.extraStations,
      knownStations: [...stations.values()],
      polyline: forwardPolyline,
    });
    /*
     * The stops follow the road.
     *
     * The report owns the name of a stop and, where it is right, the
     * order. But the order it gives cannot always be right, and a stop
     * that the road passes thirty kilometres away is a stop of another
     * line. The path the vehicle drives is the evidence that settles
     * both: the stops are placed where the road reaches them.
     */
    const ordered =
      forwardPolyline.length > 1
        ? [...forward].sort((a, b) => (a.osmPosition ?? 0) - (b.osmPosition ?? 0))
        : forward;

    // The other direction is the same line travelled backwards, so the
    // two lists are exact mirrors of each other.
    const backward = [...ordered].reverse();

    if (primary && primary.polyline.length > 1) {
      const forwardGeometry = buildLineGeometry({
        lineId,
        direction: "forward",
        polyline: forwardPolyline,
        stops: ordered,
      });
      const backwardGeometry = buildLineGeometry({
        lineId,
        direction: "backward",
        polyline: backwardPolyline,
        stops: backward,
      });
      applyStopDistances(forward, forwardGeometry.stopDistancesKm);
      applyStopDistances(backward, backwardGeometry.stopDistancesKm);
      lineGeometries.push(forwardGeometry, backwardGeometry);
    }

    pushStops(lineStops, lineId, ordered, "forward");
    pushStops(lineStops, lineId, backward, "backward");
  }

  // --- OSM lines without a curated counterpart --------------------------

  for (const [key, osmRoutes] of osmGroups) {
    if (consumedOsmKeys.has(key)) continue;
    const primary = osmRoutes[0];
    if (!primary) continue;

    const code = normalizeRouteCode(primary.code) || `route-${primary.relationId}`;
    // A line that no report covers still gets the kind of service the
    // operator publishes for it.
    const officialCorridor = official.get(normalizeRouteCode(code).toUpperCase());
    const serviceClass = resolveServiceClass(
      primary.systemId,
      undefined,
      primary,
      officialCorridor?.service,
    );
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
      polyline: primary.polyline,
    });

    /*
     * A line no report covers takes its order from the path.
     *
     * The members of a relation are not always in the order the vehicle
     * meets them: a stop that belongs to another street can sit in the
     * middle of the list. The path is the truth, because the vehicle
     * follows the road, so the stops are sorted by where the path
     * reaches them.
     */
    const ordered = [...forward].sort(
      (a, b) => (a.osmPosition ?? 0) - (b.osmPosition ?? 0),
    );

    // The opposite direction is the same line travelled backwards. A
    // relation may list the stops in any order, so the mirror of the
    // forward list is the one that is certainly right.
    const backward = [...ordered].reverse();

    if (primary.polyline.length > 1) {
      // The other direction is the same road, the other way round.
      const backwardPolyline = reversePolyline(primary.polyline);

      const forwardGeometry = buildLineGeometry({
        lineId,
        direction: "forward",
        polyline: primary.polyline,
        // The offsets are read by position, and the positions come from
        // the ordered stops. The stops of the relation are not in that
        // order, so the geometry has to be built from the same list.
        stops: ordered,
      });
      const backwardGeometry = buildLineGeometry({
        lineId,
        direction: "backward",
        polyline: backwardPolyline,
        stops: backward,
      });
      applyStopDistances(forward, forwardGeometry.stopDistancesKm);
      applyStopDistances(backward, backwardGeometry.stopDistancesKm);
      lineGeometries.push(forwardGeometry, backwardGeometry);
    }

    pushStops(lineStops, lineId, ordered, "forward");
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
    lineGeometries,
    fareRules: options.fareRules,
    notes: options.notes ?? [],
  };
}

/**
 * Write the distance travelled onto every stop of a line.
 *
 * The distance comes from the real path of the line, so two stops that are
 * 800 metres apart on the map are 1.1 kilometres apart on the road.
 */
function applyStopDistances(stops: MergedStop[], distances: readonly number[]): void {
  stops.forEach((stop, index) => {
    const distance = distances[index];
    if (distance === undefined) return;
    stop.distanceFromOriginKm = distance;
  });
}

/** A polyline, the other way round. */
function reversePolyline(points: readonly Coordinate[]): Coordinate[] {
  return [...points].reverse();
}

/**
 * Whether a relation travels in the same direction as a station.
 *
 * The curated report and the OpenStreetMap relation do not always agree
 * about which end of the line is the start, and the path has to follow
 * the order of the stops it belongs to.
 */
function directionMatches(
  route: { stops: { latitude: number; longitude: number }[] },
  station: { latitude: number | null; longitude: number | null } | undefined,
): boolean {
  const first = route.stops[0];
  const last = route.stops[route.stops.length - 1];
  if (!station || !first || !last) return true;
  if (station.latitude === null || station.longitude === null) return true;

  const target = { latitude: station.latitude, longitude: station.longitude };
  return haversineKm(target, first) <= haversineKm(target, last) * 1.05;
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
 * The key a station name is looked up by.
 *
 * The official route maps write a stop name the way the sign does, and
 * the sign leaves out spaces: "SimpangBuaran" is "Simpang Buaran". The
 * key therefore ignores them.
 */
/**
 * The name of the road, when it is a road and not the name of a line.
 *
 * The way a bus drives on is sometimes the busway itself, and its name
 * is the corridor: "Transjakarta Busway Koridor 1". That is not the
 * address of a stop, so it is left out.
 */
function streetOf(name: string | null | undefined): string | null {
  if (!name) return null;
  if (/busway|koridor|commuter|\bLRT\b|\bKRL\b|\bMRT\b|\bline\b|j\/l|rail/i.test(name)) {
    return null;
  }
  return name;
}

function nameKey(name: string): string {
  return canonicalKey(name).replace(/\s+/g, "");
}

/**
 * The canonical name of a service class.
 *
 * The reports and the relation names spell the same service in several
 * ways; the domain model has one spelling for each, and it is the
 * operator's own wording.
 */
export function normalizeServiceClass(value: string): string {
  const key = value.trim().toLowerCase();
  if (key === "mikrotrans" || key === "feeder") return "mikrotrans";
  if (key === "metrotrans" || key === "non-brt" || key === "nonbrt") return "non-brt";
  if (key === "minitrans") return "minitrans";
  if (key === "royaltrans") return "royaltrans";
  if (key === "wisata" || key === "bus-wisata" || key === "bus wisata") return "wisata";
  if (key === "rumah-susun" || key === "rumahsusun" || key === "rusun") return "rumah-susun";
  if (key === "transjabodetabek" || key === "trans-jabodetabek") return "transjabodetabek";
  if (key === "amari" || key === "night") return "amari";
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
  officialService?: string,
): string {
  if (systemId === "transjakarta") {
    // The OSM relation name states the brand outright ("Minitrans 1M",
    // "Metrotrans 5F", "Transjakarta BRT 1"), so it outranks the curated
    // class, which is often only an inferred fleet tier.
    const fromOsm = classifyTransjakartaRoute(osmRoute?.rawName ?? "");
    // The operator publishes the kind of service of every corridor it
    // runs. That is the authority, because the tariff follows it.
    if (officialService) {
      const officialClass = normalizeServiceClass(officialService);
      // The operator groups the MiniTrans buses with the other feeder
      // services, but the brand is what riders call them by, and the
      // tariff is the same either way.
      if (officialClass === "non-brt" && fromOsm.brand === "Minitrans") return "minitrans";
      return officialClass;
    }
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
 * (planned)", "Phase 3B planned, elevated". Those stations must not be
 * routable.
 *
 * Only the part of the note that describes the station counts. A note
 * that mentions another line being planned — "Eastern terminus of the
 * Cikarang line. Interchange: MRT East-West Line (planned)" — says
 * nothing about this station, which is open.
 */
export function isPlanned(note: string): boolean {
  const head = note.split(/interchange/i)[0] ?? note;
  return /\(planned|under construction|belum dibangun|direncanakan|\bplanned\b/i.test(head);
}

function modeForServiceClass(systemId: SystemId, serviceClass: string): string {
  if (systemId !== "transjakarta") {
    return systemId === "krl-jabodetabek"
      ? "rail"
      : systemId === "mrt-jakarta"
        ? "metro"
        : "tram";
  }
  if (serviceClass === "mikrotrans" || serviceClass === "minitrans") return "minibus";
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
  /** The stations the operator lists but no route relation names. */
  extraStations?:
    | readonly { name: string; latitude: number; longitude: number; code: string | null }[]
    | undefined;
  /** The stations the network already knows, for a name that has no coordinates. */
  knownStations?:
    | readonly { name: string; latitude: number; longitude: number; code: string | null }[]
    | undefined;
  /**
   * The path the line travels.
   *
   * A stop the report misses is put back where the path says it is: the
   * order of the members of a relation is not always the order the
   * vehicle travels.
   */
  polyline?: readonly { latitude: number; longitude: number }[] | undefined;
}): MergedStop[] {
  const { systemId, curatedStations, osmStops, ensureStation } = input;
  const stops: MergedStop[] = [];

  // A station that no relation names can still be found by name: the
  // operator's own list of stations knows where Cikarang and the airport
  // station are, even when the relation forgets them.
  const extraByName = new Map(
    (input.extraStations ?? []).map((station) => [station.name.trim().toLowerCase(), station]),
  );

  /*
   * A station the report names but gives no coordinates for is looked up
   * among the stations the network already knows. The official route maps
   * print the stop names of the corridors, and most of those stops are
   * places the network already has.
   */
  const knownByName = new Map(
    (input.knownStations ?? []).map((station) => [nameKey(station.name), station]),
  );

  const osmByName = new Map<string, OsmStop[]>();
  for (const stop of osmStops) {
    const key = stop.name.trim().toLowerCase();
    const list = osmByName.get(key) ?? [];
    list.push(stop);
    osmByName.set(key, list);
  }

  const usedOsm = new Set<number>();
  // The position of every stop in the relation, so a stop the report
  // misses can be put back where it belongs.
  const osmIndex = new Map<number, number>();
  osmStops.forEach((stop, index) => osmIndex.set(stop.nodeId, index));

  // Where a stop stands along the path the vehicle travels.
  const polyline = input.polyline ?? [];
  const placeOnPath = (latitude: number, longitude: number): number =>
    polyline.length > 1
      ? nearestIndexOnPolyline(polyline, { latitude, longitude })
      : 0;


  for (const curatedStation of curatedStations) {
    const candidates = osmByName.get(curatedStation.name.trim().toLowerCase()) ?? [];
    const match = candidates.find((candidate) => !usedOsm.has(candidate.nodeId));

    // A station the report names but the relation does not still has a
    // place, when the operator's own list of stations knows it.
    const known =
      match ??
      extraByName.get(curatedStation.name.trim().toLowerCase()) ??
      knownByName.get(nameKey(curatedStation.name));
    /*
     * OpenStreetMap owns the place. Its stop node sits on the road the
     * vehicle drives on, which is what the line drawn on the map has to
     * follow. The report's own coordinates are used when no relation
     * names the stop.
     */
    const latitude = match?.latitude ?? curatedStation.latitude ?? known?.latitude ?? null;
    const longitude = match?.longitude ?? curatedStation.longitude ?? known?.longitude ?? null;
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
            ...(streetOf(match.street) ? { street: streetOf(match.street) as string } : {}),
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
      osmPosition: placeOnPath(latitude, longitude),
    });
  }

  // The stops the report does not mention keep the place they have in the
  // relation: a stop the report missed must not end up at the end of the
  // line, because that would send the rider the wrong way round.
  const leftovers = osmStops.filter((osmStop) => !usedOsm.has(osmStop.nodeId));

  /*
   * A stop that lies far from the relation's own path is a stop of
   * another line that was attached to this relation by mistake. Keeping
   * it would send the rider to a place the vehicle never goes, so it is
   * left out.
   */
  for (const osmStop of leftovers) {
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
        ...(streetOf(osmStop.street) ? { street: streetOf(osmStop.street) as string } : {}),
      },
    });

    const position = placeOnPath(osmStop.latitude, osmStop.longitude);
    const entry = {
      stationId,
      name: osmStop.name,
      latitude: osmStop.latitude,
      longitude: osmStop.longitude,
      code: osmStop.code,
      distanceFromOriginKm: null,
      osmPosition: position,
    };

    stops.push(entry);
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
  /**
   * Two stations of different systems are one place when their names say so
   * and they are close enough to walk between.
   */
  const NAME_RADIUS_KM = 0.4;
  /**
   * When the report says two places are an interchange, the walk between
   * them is longer than a name match allows: the Dukuh Atas transport hub
   * links a station underground, a bus stop above it and a train station
   * 500 metres away.
   */
  const ALIAS_RADIUS_KM = 1.2;
  /**
   * A hub is one place, so its stations are never spread over the city.
   */
  const HUB_SPREAD_KM = 0.6;

  const byId = new Map(stations.map((station) => [station.id, station]));

  // The candidates are found with a grid, so that a city of three thousand
  // stations does not have to be compared three million times.
  const CELL_DEGREES = 0.01;
  const grid = new Map<string, NetworkStation[]>();
  for (const station of stations) {
    const key = cellKey(station.latitude, station.longitude);
    const list = grid.get(key) ?? [];
    list.push(station);
    grid.set(key, list);
  }

  // Every pair of stations that says it is the same place.
  const links: { a: string; b: string; distanceKm: number }[] = [];
  for (const station of stations) {
    for (const candidate of nearbyStations(station, grid, CELL_DEGREES)) {
      if (candidate.id === station.id) continue;
      if (candidate.systemId === station.systemId) continue;

      const strength = matchStrength(station, candidate);
      if (strength === "none") continue;

      const limit = strength === "alias" ? ALIAS_RADIUS_KM : NAME_RADIUS_KM;
      const distanceKm = haversineKm(station, candidate);
      if (distanceKm > limit) continue;

      links.push({ a: station.id, b: candidate.id, distanceKm });
    }
  }

  // The closest pairs join first, and two groups only join when the result
  // is still one place: every station of the group has to be within reach
  // of every other one.
  links.sort((left, right) => left.distanceKm - right.distanceKm);

  const clusters = new Map<string, string[]>();
  const findCluster = (id: string): string[] => {
    const existing = clusters.get(id);
    if (existing) return existing;
    const fresh = [id];
    clusters.set(id, fresh);
    return fresh;
  };

  for (const link of links) {
    const clusterA = findCluster(link.a);
    const clusterB = findCluster(link.b);
    if (clusterA === clusterB) continue;

    const merged = [...clusterA, ...clusterB];
    if (!isOnePlace(merged, byId, HUB_SPREAD_KM)) continue;

    for (const id of clusterA) clusters.set(id, merged);
    for (const id of clusterB) clusters.set(id, merged);
  }

  const groups: NetworkStationGroup[] = [];
  const seen = new Set<string>();
  for (const members of clusters.values()) {
    const first = members[0];
    if (!first) continue;
    const key = [...members].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    if (members.length < 2) continue;

    const name = byId.get(first);
    if (!name) continue;
    groups.push({
      id: slugify(`${name.name}-${name.systemId}`),
      name: name.name,
      latitude: name.latitude,
      longitude: name.longitude,
      stationIds: members,
    });
  }

  return groups;
}

/** Whether a set of stations is one place a rider can walk through. */
function isOnePlace(
  members: readonly string[],
  byId: Map<string, NetworkStation>,
  spreadKm: number,
): boolean {
  for (const member of members) {
    const station = byId.get(member);
    if (!station) continue;
    for (const other of members) {
      if (other === member) continue;
      const target = byId.get(other);
      if (!target) continue;
      if (haversineKm(station, target) > spreadKm) return false;
    }
  }
  return true;
}

/** The grid cell a coordinate falls into. */
function cellKey(latitude: number, longitude: number): string {
  const row = Math.floor(latitude / 0.01);
  const column = Math.floor(longitude / 0.01);
  return `${row}:${column}`;
}

/** The stations in the cells around a station. */
function nearbyStations(
  station: NetworkStation,
  grid: Map<string, NetworkStation[]>,
  cellDegrees: number,
): NetworkStation[] {
  const row = Math.floor(station.latitude / cellDegrees);
  const column = Math.floor(station.longitude / cellDegrees);
  const nearby: NetworkStation[] = [];

  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
      const list = grid.get(`${row + rowOffset}:${column + columnOffset}`);
      if (list) nearby.push(...list);
    }
  }

  return nearby;
}

/**
 * How strongly two station names say they are the same place.
 *
 * `name` is a match on the names themselves, `alias` a match through the
 * interchange notes of the research report, and `none` no match at all.
 */
function matchStrength(
  a: NetworkStation,
  b: NetworkStation,
): "name" | "alias" | "none" {
  const keyA = canonicalKey(a.name);
  const keyB = canonicalKey(b.name);
  if (keyA.length === 0 || keyB.length === 0) return "none";

  if (keyA === keyB) return "name";
  if (keyA.includes(keyB) || keyB.includes(keyA)) return "name";

  // The operator names a station after what stands next to it, so the same
  // place is often two names that share their distinctive words: "Bundaran
  // HI Bank Jakarta" and "Bundaran HI ASTRA".
  if (sharedWords(a.name, b.name) >= 2) return "name";

  // The report names the other place outright: "Dukuh Atas LRT station",
  // "BNI City". The alias has to be that place, not merely share a word
  // with it, or every station of a corridor joins one hub.
  for (const alias of [...a.aliases, ...b.aliases]) {
    const key = canonicalKey(alias);
    if (key.length === 0) continue;
    if (key === keyA) return "alias";
    if (key === keyB) return "alias";
  }

  return "none";
}

/**
 * The distinctive words two names share.
 *
 * The words that only say what kind of place it is are not distinctive.
 */
function sharedWords(a: string, b: string): number {
  const wordsA = new Set(tokenize(a));
  const wordsB = new Set(tokenize(b));
  let shared = 0;
  for (const word of wordsA) {
    if (word.length < 3) continue;
    if (wordsB.has(word)) shared += 1;
  }
  return shared;
}

