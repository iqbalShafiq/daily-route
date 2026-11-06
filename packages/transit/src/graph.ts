/**
 * The routing engine.
 *
 * The network is modelled as a directed graph: stations are nodes, riding a
 * line between two consecutive stops is a weighted edge, and moving between
 * two modes at the same interchange is a walk edge. Routes are found with A*
 * over travel time, then re-expanded into human-readable legs.
 *
 * The engine is deterministic on purpose: it is the ground truth the agent
 * verifies against, not a heuristic the model has to guess.
 */

import { haversineKm, walkingMinutes } from "./geo.js";
import {
  clipSliceToStops,
  geometryKey,
  sliceGeometry,
  sliceGeometryNearStops,
  type Coordinate,
  type LineGeometry,
} from "./geometry.js";
import { isNationalHoliday } from "./calendar.js";
import { serviceAt, type ServiceState } from "./service.js";
import type {
  Direction,
  Itinerary,
  ItineraryLeg,
  ItineraryStop,
  Line,
  LineStop,
  StopPlatform,
  ServiceClass,
  Station,
  StationGroup,
  TransitMode,
  LinePattern,
} from "./types.js";

/** The complete network the engine plans over. */
export type TransitNetwork = {
  lines: readonly Line[];
  stations: readonly Station[];
  lineStops: readonly LineStop[];
  stationGroups: readonly StationGroup[];
  /**
   * The real path of every line, per direction.
   *
   * The planner uses it for two things: the distance between two stops is
   * the distance along the road, not through the walls, and the line drawn
   * on the map follows the road the vehicle drives on.
   */
  geometries?: readonly LineGeometry[];
  /**
   * Scheduled trip patterns for lines whose code has more than one
   * alignment. A line without patterns uses its base lineStops.
   */
  patterns?: readonly LinePattern[];
};

/**
 * Average commercial speed per mode, in km/h, including dwell time.
 *
 * These are network averages, not top speeds. They exist so that a bus and a
 * train are compared on the time a rider actually experiences.
 */
const AVERAGE_SPEED_KMH: Readonly<Record<TransitMode, number>> = {
  bus: 18,
  minibus: 21,
  tram: 26,
  metro: 29,
  rail: 38,
};

/**
 * The average wait for a vehicle, in minutes.
 *
 * Half the headway is the expectation a rider plans around. It is also
 * what keeps the planner from hopping from one bus to the next to shave a
 * minute off the ride: every new vehicle means another wait.
 */
const AVERAGE_WAIT_MINUTES: Readonly<Record<TransitMode, number>> = {
  bus: 5,
  minibus: 4,
  tram: 6,
  metro: 3,
  rail: 6,
};

/**
 * Straight lines are shorter than the roads and rails between two points.
 * This factor converts a direct distance into a plausible travelled distance.
 */
const DETOUR_FACTOR = 1.25;

/** The scheduled wait for a line, falling back to the mode average. */
export function waitAt(
  graph: Pick<Graph, "lines" | "at" | "services">,
  lineId: string | null,
  direction: Direction | null,
  mode: TransitMode,
): number {
  const state =
    lineId && direction ? (graph.services.get(`${lineId}:${direction}`) ?? null) : null;
  return state?.waitMinutes ?? AVERAGE_WAIT_MINUTES[mode];
}

/** The fastest average speed in the network; the A* heuristic uses it. */
const HEURISTIC_SPEED_KMH = 45;

/** Extra minutes a rider pays for each change of vehicle. */
const DEFAULT_TRANSFER_PENALTY_MINUTES = 3;

/**
 * What one kilometre less is worth, in minutes.
 *
 * The journey is judged on time first, and on distance second. A rider
 * accepts a slightly longer ride for a route that is shorter and needs
 * fewer changes, but not one that is half an hour faster in the other
 * direction. At the average speed of a city bus, a kilometre is worth
 * about three minutes, so this weight breaks the near-ties without
 * overruling a genuinely faster route.
 */
const DISTANCE_WEIGHT_MINUTES_PER_KM = 0.4;

/** Minutes spent at each intermediate stop. */
const DWELL_MINUTES = 0.6;

/** Minutes to walk a transfer between two stations of the same interchange. */
const MIN_TRANSFER_MINUTES = 2;

type EdgeKind = "ride" | "walk";

type Edge = {
  kind: EdgeKind;
  from: string;
  to: string;
  durationMinutes: number;
  distanceKm: number;
  lineId: string | null;
  direction: Direction | null;
  mode: TransitMode | null;
  serviceClass: ServiceClass | null;
  patternId: string | null;
  patternLabel: string | null;
  patternType: LinePattern["patternType"] | null;
  patternService: string | null;
  fromPlatform?: StopPlatform | null;
  toPlatform?: StopPlatform | null;
  /** Extra cost applied only when the edge is chosen by the search. */
  penaltyMinutes: number;
  /** The position of the stop on the line, for a ride. */
  fromPosition: number | null;
  toPosition: number | null;
};

export type Graph = {
  stations: Map<string, Station>;
  lines: Map<string, Line>;
  adjacency: Map<string, Edge[]>;
  /** The stops of every line, per direction, in order. */
  stopsByLine: StopsByLine;
  /** The real path of every line, per direction. */
  geometries: Map<string, LineGeometry>;
  /** Geometry keyed by `patternId`, when a line has scheduled patterns. */
  patternGeometries: Map<string, LineGeometry>;
  /** The patterns that were active at build time, keyed by line id. */
  patterns: Map<string, LinePattern[]>;
  /** The instant this graph was built for. */
  at: Date;
  /** Service state per line and direction at that instant, computed once. */
  services: Map<string, ServiceState | null>;
};

export type RouteOptions = {
  /** Maximum number of vehicle changes. `null` means unlimited. */
  maxTransfers?: number | null;
  /** Lines that must not be used. */
  avoidLineIds?: readonly string[];
  /** Stations that must not be used (a closed stop, a diverted segment). */
  avoidStationIds?: readonly string[];
  /** Extra minutes added per vehicle change. */
  transferPenaltyMinutes?: number;
  /** Maximum number of itineraries to return. */
  maxAlternatives?: number;
  /** The instant used to decide which scheduled patterns run. */
  at?: Date;
  /** The two ends of the requested journey, used to choose one pattern per line. */
  originStationId?: string;
  destinationStationId?: string;
  /** Penalise walking at night; the journey prefers fewer dark transfers. */
  nightSafe?: boolean;
};

const DEFAULT_OPTIONS: Required<
  Pick<RouteOptions, "maxTransfers" | "transferPenaltyMinutes" | "maxAlternatives">
> = {
  maxTransfers: null,
  transferPenaltyMinutes: DEFAULT_TRANSFER_PENALTY_MINUTES,
  maxAlternatives: 3,
};

/** Build the searchable graph from a network snapshot. */
export function buildGraph(
  network: TransitNetwork,
  options: { at?: Date; originStationId?: string; destinationStationId?: string } = {},
): Graph {
  const stations = new Map(network.stations.map((station) => [station.id, station]));
  const lines = new Map(network.lines.map((line) => [line.id, line]));
  const adjacency = new Map<string, Edge[]>();
  const at = options.at ?? new Date();
  const services = new Map<string, ServiceState | null>();
  const serviceFor = (line: Line, direction: Direction): ServiceState | null => {
    const key = `${line.id}:${direction}`;
    if (!services.has(key)) services.set(key, serviceAt(line, direction, at));
    return services.get(key) ?? null;
  };
  const runs = (line: Line, direction: Direction): boolean => {
    const state = serviceFor(line, direction);
    return state === null || !state.reliable || state.active;
  };

  const push = (edge: Edge): void => {
    const list = adjacency.get(edge.from);
    if (list) {
      list.push(edge);
    } else {
      adjacency.set(edge.from, [edge]);
    }
  };

  const stopsByLine = groupStopsByLine(network.lineStops);
  const patterns = choosePatterns(
    activePatterns(network.patterns ?? [], at),
    options.originStationId,
    options.destinationStationId,
  );
  const patternGeometries = new Map<string, LineGeometry>();
  const geometries = new Map<string, LineGeometry>();
  for (const geometry of network.geometries ?? []) {
    geometries.set(geometryKey(geometry.lineId, geometry.direction), geometry);
  }

  for (const [lineId, stops] of stopsByLine) {
    const line = lines.get(lineId);
    if (!line || line.status !== "operating") continue;

    const linePatterns = patterns.get(lineId) ?? [];
    const hasScheduledPatterns = (network.patterns ?? []).some(
      (pattern) => pattern.lineId === lineId,
    );
    const patternDirections = new Set(linePatterns.map((pattern) => pattern.direction));
    const forward = stops.forward;
    // A missing return is not a service. Mirroring the stops would invent
    // a ride the operator does not publish.
    const backward = stops.backward;

    // A line with a single stop cannot be travelled: there is nowhere to
    // board and nowhere to leave.
    if (
      forward.length >= 2 &&
      !hasScheduledPatterns &&
      !patternDirections.has("forward") &&
      runs(line, "forward")
    ) {
      connectStops(push, stations, line, forward, "forward", geometries.get(geometryKey(line.id, "forward")));
    }
    if (
      backward.length >= 2 &&
      !hasScheduledPatterns &&
      !patternDirections.has("backward") &&
      runs(line, "backward")
    ) {
      connectStops(push, stations, line, backward, "backward", geometries.get(geometryKey(line.id, "backward")));
    }

    for (const pattern of linePatterns) {
      if (pattern.stopIds.length < 2) continue;
      if (!runs(line, pattern.direction)) continue;
      const patternStops: LineStop[] = pattern.stopIds.map((stationId, index) => {
        const baseStop = pattern.direction === "forward" ? forward : backward;
        const platform = baseStop.find((stop) => stop.stationId === stationId)?.platform;
        return {
          lineId: line.id,
          stationId,
          direction: pattern.direction,
          position: index + 1,
          distanceFromOriginKm: null,
          ...(platform ? { platform } : {}),
        };
      });
      const geometry = pattern.geometry.length >= 4
        ? {
            lineId: line.id,
            direction: pattern.direction,
            coordinates: pattern.geometry,
            stopOffsets: pattern.stopOffsets,
            lengthKm: 0,
          }
        : undefined;
      if (geometry) patternGeometries.set(pattern.id, geometry);
      connectStops(push, stations, line, patternStops, pattern.direction, geometry, pattern);
    }
  }

  for (const group of network.stationGroups) {
    const members = group.stationIds
      .map((stationId) => stations.get(stationId))
      .filter((station): station is Station => station !== undefined);
    for (const from of members) {
      for (const to of members) {
        if (from.id === to.id) continue;
        const distanceKm = haversineKm(from, to);
        push({
          kind: "walk",
          from: from.id,
          to: to.id,
          durationMinutes: Math.max(MIN_TRANSFER_MINUTES, walkingMinutes(distanceKm)),
          distanceKm,
          lineId: null,
          direction: null,
          mode: null,
          serviceClass: null,
          patternId: null,
          patternLabel: null,
          patternType: null,
          patternService: null,
          penaltyMinutes: 0,
          fromPosition: null,
          toPosition: null,
        });
      }
    }
  }

  return { stations, lines, adjacency, stopsByLine, geometries, patternGeometries, patterns, at, services };
}

export function patternActiveAt(pattern: LinePattern, at: Date): boolean {
  const holiday = isNationalHoliday(at);
  if (pattern.metadata["holidays"] === true && holiday) return true;
  if (pattern.metadata["holidays"] === false && holiday) return false;
  if (pattern.serviceDays.length === 0) return true;
  const day = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "Asia/Jakarta" }).format(at);
  return pattern.serviceDays.includes(day);
}

function activePatterns(patterns: readonly LinePattern[], at: Date): Map<string, LinePattern[]> {
  if (patterns.length === 0) return new Map();
  const active = new Map<string, LinePattern[]>();
  for (const pattern of patterns) {
    if (pattern.stopIds.length < 2) continue;
    if (!patternActiveAt(pattern, at)) continue;
    const list = active.get(pattern.lineId) ?? [];
    list.push(pattern);
    active.set(pattern.lineId, list);
  }
  return active;
}

function choosePatterns(
  patterns: Map<string, LinePattern[]>,
  originStationId?: string,
  destinationStationId?: string,
): Map<string, LinePattern[]> {
  const chosen = new Map<string, LinePattern[]>();
  for (const [lineId, list] of patterns) {
    const byDirection = new Map<string, LinePattern[]>();
    for (const pattern of list) {
      const group = byDirection.get(pattern.direction) ?? [];
      group.push(pattern);
      byDirection.set(pattern.direction, group);
    }
    const kept: LinePattern[] = [];
    for (const group of byDirection.values()) {
      const fallback = group.find((pattern) => pattern.isDefault) ?? group[0];
      // When both ends of the requested ride stand on the same line, each
      // pattern that carries both is a real choice. The one with fewer stops
      // is the faster trip, but it is still the same line and fare.
      const direct = group.filter(
        (pattern) =>
          originStationId &&
          destinationStationId &&
          pattern.stopIds.includes(originStationId) &&
          pattern.stopIds.includes(destinationStationId),
      );
      const fastestDirect = [...direct].sort((a, b) => a.stopIds.length - b.stopIds.length)[0];
      const originPattern =
        originStationId && fallback && !fallback.stopIds.includes(originStationId)
          ? group.find((pattern) => pattern.stopIds.includes(originStationId))
          : undefined;
      const destinationPattern =
        destinationStationId && fallback && !fallback.stopIds.includes(destinationStationId)
          ? group.find((pattern) => pattern.stopIds.includes(destinationStationId))
          : undefined;
      const chosen = fastestDirect ?? originPattern ?? destinationPattern ?? fallback;
      if (chosen) kept.push(chosen);
    }
    if (kept.length > 0) chosen.set(lineId, kept);
  }
  return chosen;
}

type StopsByLine = Map<string, { forward: LineStop[]; backward: LineStop[] }>;

function groupStopsByLine(lineStops: readonly LineStop[]): StopsByLine {
  const grouped = new Map<string, { forward: LineStop[]; backward: LineStop[] }>();
  for (const stop of lineStops) {
    const entry = grouped.get(stop.lineId) ?? { forward: [], backward: [] };
    if (stop.direction === "forward") {
      entry.forward.push(stop);
    } else {
      entry.backward.push(stop);
    }
    grouped.set(stop.lineId, entry);
  }
  for (const entry of grouped.values()) {
    entry.forward.sort((a, b) => a.position - b.position);
    entry.backward.sort((a, b) => a.position - b.position);
  }
  return grouped;
}

function connectStops(
  push: (edge: Edge) => void,
  stations: Map<string, Station>,
  line: Line,
  stops: readonly LineStop[],
  direction: Direction,
  geometry: LineGeometry | undefined,
  pattern: LinePattern | null = null,
): void {
  const sequence = withoutConsecutiveDuplicates(stops);
  for (let index = 0; index < sequence.length - 1; index += 1) {
    const current = sequence[index];
    const next = sequence[index + 1];
    if (!current || !next) continue;

    const from = stations.get(current.stationId);
    const to = stations.get(next.stationId);
    if (!from || !to) continue;

    const distanceKm = segmentDistanceKm(from, to, current, next, geometry);
    const speed = AVERAGE_SPEED_KMH[line.mode];
    const rideMinutes = (distanceKm / speed) * 60;
    const durationMinutes = Math.max(1, rideMinutes + DWELL_MINUTES);

    push({
      kind: "ride",
      from: from.id,
      to: to.id,
      durationMinutes,
      distanceKm,
      lineId: line.id,
      direction,
      mode: line.mode,
      serviceClass: line.serviceClass,
      patternId: pattern?.id ?? null,
      patternLabel: pattern?.headsign ?? null,
      patternType: pattern?.patternType ?? null,
      patternService: pattern?.serviceLabel ?? null,
      ...(pattern
        ? {
            fromPlatform: current.platform ?? null,
            toPlatform: next.platform ?? null,
          }
        : {}),
      penaltyMinutes: 0,
      fromPosition: current.position,
      toPosition: next.position,
    });
  }
}

/**
 * A stop listed twice in a row is the same place.
 *
 * Some relations repeat a station and then jump the cumulative distance
 * by tens of kilometres. Keeping the first listing lets the next real
 * stop be measured from where the rider actually is.
 */
function withoutConsecutiveDuplicates(stops: readonly LineStop[]): LineStop[] {
  const unique: LineStop[] = [];
  for (const stop of stops) {
    const previous = unique[unique.length - 1];
    if (previous && previous.stationId === stop.stationId) continue;
    unique.push(stop);
  }
  return unique;
}

/**
 * Distance between two consecutive stops.
 *
 * The cumulative distance published with the stop list is preferred when
 * it still belongs to these two stops. A jump far beyond the straight
 * line is a broken listing, and the path — or the straight line — is
 * used instead.
 */
function segmentDistanceKm(
  from: Station,
  to: Station,
  current: LineStop,
  next: LineStop,
  geometry: LineGeometry | undefined,
): number {
  const straightKm = haversineKm(from, to);
  const plausibleKm = Math.max(1.5, straightKm * 4);

  const published = publishedDistanceKm(current, next);
  if (published !== null && published <= plausibleKm) return published;

  const alongPath = geometryDistanceKm(current, next, geometry);
  if (alongPath !== null && alongPath <= plausibleKm) return alongPath;

  return straightKm * DETOUR_FACTOR;
}

/** The kilometres the stop list claims between two stops. */
function publishedDistanceKm(current: LineStop, next: LineStop): number | null {
  if (
    current.distanceFromOriginKm === null ||
    next.distanceFromOriginKm === null ||
    current.distanceFromOriginKm === undefined ||
    next.distanceFromOriginKm === undefined
  ) {
    return null;
  }
  const delta = Math.abs(next.distanceFromOriginKm - current.distanceFromOriginKm);
  return delta > 0 ? delta : null;
}

/** The kilometres along the stored path between two stop indexes. */
function geometryDistanceKm(
  current: LineStop,
  next: LineStop,
  geometry: LineGeometry | undefined,
): number | null {
  if (!geometry) return null;
  const points = geometry.coordinates;
  const fromOffset = geometry.stopOffsets[current.position - 1];
  const toOffset = geometry.stopOffsets[next.position - 1];
  if (fromOffset === undefined || toOffset === undefined || toOffset <= fromOffset) return null;

  const slice = points.slice(fromOffset * 2, (toOffset + 1) * 2);
  let distance = 0;
  for (let index = 0; index + 3 < slice.length; index += 2) {
    const longitudeA = slice[index];
    const latitudeA = slice[index + 1];
    const longitudeB = slice[index + 2];
    const latitudeB = slice[index + 3];
    if (
      longitudeA === undefined ||
      latitudeA === undefined ||
      longitudeB === undefined ||
      latitudeB === undefined
    ) {
      continue;
    }
    distance += haversineKm(
      { latitude: latitudeA, longitude: longitudeA },
      { latitude: latitudeB, longitude: longitudeB },
    );
  }
  return distance > 0 ? distance : null;
}

type SearchResult = {
  stationIds: string[];
  edges: Edge[];
};

/**
 * A* over travel time.
 *
 * The heuristic is the straight-line distance divided by the fastest average
 * speed in the network, which never overestimates the remaining travel time.
 */
function search(
  graph: Graph,
  originId: string,
  destinationId: string,
  options: {
    maxTransfers: number | null;
    transferPenaltyMinutes: number;
    linePenalties: Map<string, number>;
    blockedStationIds: ReadonlySet<string>;
    blockedLineIds: ReadonlySet<string>;
    nightSafe: boolean;
  },
): SearchResult | null {
  const { stations } = graph;
  const origin = stations.get(originId);
  const destination = stations.get(destinationId);
  if (!origin || !destination) return null;
  if (originId === destinationId) return { stationIds: [originId], edges: [] };

  const originKey = stateKey(originId, null, false);
  const bestCost = new Map<string, number>([[originKey, 0]]);
  const bestTransfers = new Map<string, number>([[originKey, 0]]);
  const bestPath = new Map<string, PathStep>([
    [originKey, { previous: null, edge: null, stationId: originId }],
  ]);

  const expanded = new Set<string>();
  const frontier = new MinHeap();
  frontier.push({
    key: originKey,
    id: originId,
    line: null,
    transfers: 0,
    ridden: false,
    cost: 0,
    estimate: heuristicMinutes(origin, destination),
  });

  while (frontier.size > 0) {
    const current = frontier.pop();
    if (!current) break;

    if (expanded.has(current.key)) continue;
    expanded.add(current.key);

    if (current.id === destinationId) {
      return reconstruct(bestPath, current.key);
    }

    const known = bestCost.get(current.key);
    if (known !== undefined && current.cost > known) continue;

    const edges = graph.adjacency.get(current.id) ?? [];
    for (const edge of edges) {
      if (options.blockedStationIds.has(edge.to)) continue;
      if (edge.lineId !== null && options.blockedLineIds.has(edge.lineId)) continue;

      const isWalk = edge.kind === "walk";
      const lineChange =
        edge.kind === "ride" && current.line !== null && edge.lineId !== current.line;
      // A walk counts as a change of vehicle only when the rider has been
      // on one already. Boarding a different line at the same station is
      // also a change.
      const nextTransfers =
        current.transfers + ((isWalk && current.ridden) || lineChange ? 1 : 0);
      if (options.maxTransfers !== null && nextTransfers > options.maxTransfers) continue;

      const linePenalty = edge.lineId ? (options.linePenalties.get(edge.lineId) ?? 0) : 0;
      const transferPenalty =
        (isWalk && current.ridden) || lineChange ? options.transferPenaltyMinutes : 0;
      const nightWalkPenalty =
        isWalk && options.nightSafe ? Math.min(10, edge.durationMinutes * 0.6) : 0;
      // Boarding a different vehicle means waiting for it.
      const boarded = edge.kind === "ride" && edge.lineId !== current.line;
      const wait =
        boarded && edge.mode
          ? waitAt(graph, edge.lineId, edge.direction, edge.mode)
          : 0;
      const cost =
        current.cost +
        edge.durationMinutes +
        edge.distanceKm * DISTANCE_WEIGHT_MINUTES_PER_KM +
        linePenalty +
        transferPenalty +
        nightWalkPenalty +
        wait;

      const nextLine = edge.kind === "ride" ? edge.lineId : null;
      const nextRidden = current.ridden || edge.kind === "ride";
      const nextKey = stateKey(edge.to, nextLine, nextRidden);
      const knownCost = bestCost.get(nextKey);
      const knownTransfers = bestTransfers.get(nextKey);
      if (
        knownCost !== undefined &&
        (cost > knownCost || (cost === knownCost && (knownTransfers ?? 0) <= nextTransfers))
      ) {
        continue;
      }

      bestCost.set(nextKey, cost);
      bestTransfers.set(nextKey, nextTransfers);
      bestPath.set(nextKey, {
        previous: current.key,
        edge,
        stationId: edge.to,
      });

      const target = stations.get(edge.to);
      if (!target) continue;
      frontier.push({
        key: nextKey,
        id: edge.to,
        line: nextLine,
        transfers: nextTransfers,
        ridden: nextRidden,
        cost,
        estimate: cost + heuristicMinutes(target, destination),
      });
    }
  }

  return null;
}

function stateKey(
  stationId: string,
  lineId: string | null,
  ridden: boolean,
): string {
  return `${stationId}|${lineId ?? "-"}|${ridden ? 1 : 0}`;
}

/** A small binary min-heap; sorting the whole frontier on every pop was the
 * difference between milliseconds and tens of seconds on the grown network. */
class MinHeap {
  readonly #items: SearchNode[] = [];

  get size(): number {
    return this.#items.length;
  }

  push(node: SearchNode): void {
    this.#items.push(node);
    let index = this.#items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      const current = this.#items[index];
      const above = this.#items[parent];
      if (!current || !above || above.estimate <= current.estimate) break;
      this.#items[index] = above;
      this.#items[parent] = current;
      index = parent;
    }
  }

  pop(): SearchNode | undefined {
    const first = this.#items[0];
    const last = this.#items.pop();
    if (!first) return undefined;
    if (this.#items.length > 0 && last) {
      this.#items[0] = last;
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        const current = this.#items[smallest];
        const leftNode = this.#items[left];
        const rightNode = this.#items[right];
        if (leftNode && current && leftNode.estimate < current.estimate) smallest = left;
        const smallestNode = this.#items[smallest];
        if (rightNode && smallestNode && rightNode.estimate < smallestNode.estimate) smallest = right;
        if (smallest === index) break;
        const a = this.#items[index];
        const b = this.#items[smallest];
        if (!a || !b) break;
        this.#items[index] = b;
        this.#items[smallest] = a;
        index = smallest;
      }
    }
    return first;
  }
}

type PathStep = {
  previous: string | null;
  edge: Edge | null;
  stationId: string;
};

type SearchNode = {
  key: string;
  id: string;
  line: string | null;
  transfers: number;
  ridden: boolean;
  cost: number;
  estimate: number;
};

function heuristicMinutes(from: Station, to: Station): number {
  return (haversineKm(from, to) / HEURISTIC_SPEED_KMH) * 60;
}

function reconstruct(
  bestPath: Map<string, PathStep>,
  destinationKey: string,
): SearchResult {
  const stationIds: string[] = [];
  const edges: Edge[] = [];
  let cursor: string | null = destinationKey;

  while (cursor !== null) {
    const info: PathStep | undefined = bestPath.get(cursor);
    if (!info) break;
    stationIds.push(info.stationId);
    if (info.edge) edges.push(info.edge);
    cursor = info.previous;
  }

  stationIds.reverse();
  edges.reverse();
  return { stationIds, edges };
}

/**
 * Plan itineraries between two stations.
 *
 * The first itinerary is the fastest one. Alternatives are produced by
 * re-running the search with the lines used by the incumbent heavily
 * penalised, which surfaces genuinely different routes rather than cosmetic
 * variations of the same one.
 */
export function planRoutes(
  network: TransitNetwork,
  originStationId: string,
  destinationStationId: string,
  options: RouteOptions = {},
): Itinerary[] {
  const graph = buildGraph(network, {
    ...(options.at ? { at: options.at } : {}),
    originStationId,
    destinationStationId,
  });
  const resolved: Required<
    Pick<RouteOptions, "maxTransfers" | "transferPenaltyMinutes" | "maxAlternatives">
  > = {
    maxTransfers: options.maxTransfers ?? DEFAULT_OPTIONS.maxTransfers,
    transferPenaltyMinutes: options.transferPenaltyMinutes ?? DEFAULT_OPTIONS.transferPenaltyMinutes,
    maxAlternatives: options.maxAlternatives ?? DEFAULT_OPTIONS.maxAlternatives,
  };

  const blocked = new Set(options.avoidStationIds ?? []);
  // An avoided line is removed from the graph rather than blocked station by
  // station: the stations it serves stay reachable through other lines.
  const blockedLineIds = new Set(options.avoidLineIds ?? []);

  const linePenalties = new Map<string, number>();
  const itineraries: Itinerary[] = [];
  const seen = new Set<string>();

  for (let round = 0; round < Math.max(1, resolved.maxAlternatives); round += 1) {
    const result = search(graph, originStationId, destinationStationId, {
      maxTransfers: resolved.maxTransfers,
      transferPenaltyMinutes: resolved.transferPenaltyMinutes,
      linePenalties,
      blockedStationIds: blocked,
      blockedLineIds,
      nightSafe: options.nightSafe === true,
    });
    if (!result) break;

    const itinerary = toItinerary(graph, result);
    const signature = itinerarySignature(itinerary);
    if (seen.has(signature)) break;
    seen.add(signature);
    itineraries.push(itinerary);

    for (const lineId of linesUsedBy(itinerary)) {
      linePenalties.set(lineId, (linePenalties.get(lineId) ?? 0) + 15);
    }
  }

  // The search ranks by cost, which trades a minute of riding against a
  // transfer. The rider asked for the fastest journey first.
  itineraries.sort((a, b) =>
    options.nightSafe
      ? a.cost - b.cost ||
        a.walkingKm - b.walkingKm ||
        a.durationMinutes - b.durationMinutes
      : a.durationMinutes - b.durationMinutes ||
        a.transferCount - b.transferCount ||
        a.cost - b.cost,
  );

  return itineraries;
}

/** The distinct lines an itinerary rides on. */
export function linesUsedBy(itinerary: Itinerary): string[] {
  const lineIds = new Set<string>();
  for (const leg of itinerary.legs) {
    if (leg.kind === "ride" && leg.lineId) lineIds.add(leg.lineId);
  }
  return [...lineIds];
}

function itinerarySignature(itinerary: Itinerary): string {
  return itinerary.legs
    .map((leg) => `${leg.kind}:${leg.lineId ?? "walk"}:${leg.fromStationId ?? "-"}->${leg.toStationId ?? "-"}`)
    .join("|");
}

/** Expand a search path into legs a rider can follow. */
function toItinerary(graph: Graph, result: SearchResult): Itinerary {
  const legs: ItineraryLeg[] = [];
  let currentLeg: ItineraryLeg | null = null;

  for (const edge of result.edges) {
    const from = graph.stations.get(edge.from);
    const to = graph.stations.get(edge.to);
    if (!from || !to) continue;

    if (edge.kind === "ride" && edge.lineId) {
      const line = graph.lines.get(edge.lineId);
      const lineId = edge.lineId;
      if (
        currentLeg &&
        currentLeg.kind === "ride" &&
        currentLeg.lineId === lineId &&
        currentLeg.patternId === (edge.patternId ?? null)
      ) {
        currentLeg.toStationId = to.id;
        currentLeg.toName = to.name;
        currentLeg.toPlatform =
          edge.toPlatform ??
          platformAt(
            graph,
            lineId,
            edge.direction ?? currentLeg.direction ?? "forward",
            edge.toPosition,
          );
        currentLeg.durationMinutes = Math.round(currentLeg.durationMinutes + edge.durationMinutes);
        currentLeg.distanceKm += edge.distanceKm;
        currentLeg.stops.push(stopOf(to, currentLeg.stops.length));
      } else {
        currentLeg = {
          kind: "ride",
          mode: edge.mode ?? "bus",
          lineId,
          lineName: line?.name ?? null,
          lineCode: line?.code ?? null,
          serviceClass: edge.serviceClass,
          ...(line?.metadata?.["temporary"] === true ? { temporary: true } : {}),
          patternId: edge.patternId,
          patternLabel: edge.patternLabel,
          patternType: edge.patternType,
          patternService: edge.patternService,
          fromStationId: from.id,
          toStationId: to.id,
          fromName: from.name,
          toName: to.name,
          durationMinutes: Math.round(edge.durationMinutes),
          distanceKm: edge.distanceKm,
          stops: [stopOf(from, 0), stopOf(to, 1)],
          coordinates: [
            { latitude: from.latitude, longitude: from.longitude },
            { latitude: to.latitude, longitude: to.longitude },
          ],
          walkReason: null,
          nextLineName: null,
          waitMinutes: 0,
          serviceLabel: null,
          headwayMinMinutes: null,
          headwayMaxMinutes: null,
          outsideService: false,
          serviceDetail: null,
          changedFrom: null,
          direction: edge.direction ?? null,
          fromPlatform:
            edge.fromPlatform ??
            platformAt(graph, lineId, edge.direction ?? "forward", edge.fromPosition),
          toPlatform:
            edge.toPlatform ??
            platformAt(graph, lineId, edge.direction ?? "forward", edge.toPosition),
          changedAt: null,
        };
        legs.push(currentLeg);
      }
      continue;
    }

    currentLeg = {
      kind: "walk",
      mode: "walk",
      lineId: null,
      lineName: null,
      lineCode: null,
      serviceClass: null,
      fromStationId: from.id,
      toStationId: to.id,
      fromName: from.name,
      toName: to.name,
      durationMinutes: edge.durationMinutes,
      distanceKm: edge.distanceKm,
      stops: [stopOf(from, 0), stopOf(to, 1)],
      coordinates: [
        { latitude: from.latitude, longitude: from.longitude },
        { latitude: to.latitude, longitude: to.longitude },
      ],
      walkReason: null,
      nextLineName: null,
      waitMinutes: 0,
      serviceLabel: null,
      headwayMinMinutes: null,
      headwayMaxMinutes: null,
      outsideService: false,
      serviceDetail: null,
      changedFrom: null,
      changedAt: null,
      direction: null,
      patternId: null,
      patternLabel: null,
      patternType: null,
      patternService: null,
      fromPlatform: null,
      toPlatform: null,
    };
    legs.push(currentLeg);
  }

  // The path of a ride is the road the vehicle drives on, not a line
  // between the stops. When the stored offsets miss the stations, the
  // path is the stretch of rail that actually passes those two stops.
  for (const leg of legs) {
    if (leg.kind !== "ride" || !leg.lineId) continue;
    const boarded = leg.stops[0];
    const alighted = leg.stops[leg.stops.length - 1];
    if (!boarded || !alighted) continue;
    const from = { latitude: boarded.latitude, longitude: boarded.longitude };
    const to = { latitude: alighted.latitude, longitude: alighted.longitude };

    const slice = ridePath(graph, leg, from, to);
    // A ride is drawn on the road the vehicle travels. When the snapshot
    // has no path for this stretch, the leg keeps no line at all: a
    // straight line between the stops would be a road that does not exist.
    leg.coordinates = slice.length >= 2 ? slice : [];
  }

  // Boarding a vehicle means waiting for it. Staying on the same one does
  // not, which is why a rider who can stay on board is favoured.
  legs.forEach((leg, index) => {
    if (leg.kind !== "ride") return;
    const previous = legs[index - 1];
    const continues = previous?.kind === "ride" && previous.lineId === leg.lineId;
    if (continues) return;
    const state = leg.lineId
      ? (graph.services.get(`${leg.lineId}:${leg.direction ?? "forward"}`) ?? null)
      : null;
    leg.waitMinutes = state?.waitMinutes ?? AVERAGE_WAIT_MINUTES[leg.mode as TransitMode] ?? 0;
    leg.serviceLabel = state?.label ?? null;
    leg.headwayMinMinutes = state?.headwayMinMinutes ?? null;
    leg.headwayMaxMinutes = state?.headwayMaxMinutes ?? null;
    leg.outsideService = state !== null && state.reliable && !state.active;
    leg.serviceDetail = state?.detail ?? null;
    leg.durationMinutes += leg.waitMinutes;
  });

  // A change of vehicle is a change of vehicle whether the rider walks to
  // the next stop or the next bus stops at the same place.
  let previousRide: ItineraryLeg | null = null;
  for (const leg of legs) {
    if (leg.kind !== "ride") continue;
    if (previousRide && previousRide.lineId !== leg.lineId) {
      leg.changedFrom = previousRide.lineName ?? previousRide.lineCode;
      leg.changedAt = leg.fromName;
    }
    previousRide = leg;
  }

  // A walk is a change of vehicle only when it sits between two vehicles.
  // The walk to the first vehicle and the walk after the last one are
  // part of the journey, not a transfer.
  legs.forEach((leg, index) => {
    if (leg.kind !== "walk") return;
    const previous = legs[index - 1];
    const next = legs[index + 1];
    if (!previous || !next) {
      leg.walkReason = index === 0 ? "access" : "egress";
      return;
    }
    if (previous.kind === "ride" && next.kind === "ride") {
      leg.walkReason = "transfer";
      leg.nextLineName = next.lineName ?? next.lineCode;
    } else {
      leg.walkReason = index === 0 ? "access" : "egress";
    }
  });

  const coordinates = legs.flatMap((leg) => leg.coordinates);
  const durationMinutes = Math.round(legs.reduce((total, leg) => total + leg.durationMinutes, 0));
  // Every change of vehicle counts, whether the rider walks to the next
  // stop or the next bus stops at the same place.
  const transferCount = legs.filter((leg) => leg.changedFrom !== null).length;
  const distanceKm = legs.reduce((total, leg) => total + leg.distanceKm, 0);
  const walkingKm = legs
    .filter((leg) => leg.kind === "walk")
    .reduce((total, leg) => total + leg.distanceKm, 0);
  const cost =
    durationMinutes +
    distanceKm * DISTANCE_WEIGHT_MINUTES_PER_KM +
    transferCount * DEFAULT_TRANSFER_PENALTY_MINUTES;

  return {
    originStationId: result.stationIds[0] ?? "",
    destinationStationId: result.stationIds[result.stationIds.length - 1] ?? "",
    durationMinutes,
    transferCount,
    legs,
    coordinates,
    warnings: [],
    distanceKm: Number(distanceKm.toFixed(2)),
    walkingKm: Number(walkingKm.toFixed(2)),
    cost: Number(cost.toFixed(1)),
  };
}

/**
 * The path a ride draws on the map.
 *
 * The offset slice is kept when its ends land on the stops, once it is
 * trimmed to them, so a vertex left behind the boarding stop is not
 * drawn. Otherwise the path is the stretch of the stored rail nearest to
 * those two stops, so a loop whose offsets collapsed still draws the
 * ride the vehicle takes.
 */
function ridePath(graph: Graph, leg: ItineraryLeg, from: Coordinate, to: Coordinate): Coordinate[] {
  let best: Coordinate[] = [];
  let bestMiss = Number.POSITIVE_INFINITY;
  const patternGeometry = leg.patternId ? graph.patternGeometries.get(leg.patternId) : undefined;
  const consider = (slice: readonly Coordinate[]): void => {
    if (slice.length < 2) return;
    const start = slice[0];
    const end = slice[slice.length - 1];
    if (!start || !end) return;
    const miss = haversineKm(start, from) + haversineKm(end, to);
    if (miss < bestMiss) {
      best = slice.map((point) => ({ latitude: point.latitude, longitude: point.longitude }));
      bestMiss = miss;
    }
  };

  // Every candidate now meets both stops, so the endpoint miss no longer
  // separates the two directions. The direction the rider travels is
  // asked first: the return of a line may use another street, and that
  // street is the one this leg rides.
  const directions: Array<"forward" | "backward"> =
    leg.direction === "backward" ? ["backward", "forward"] : ["forward", "backward"];
  for (const direction of directions) {
    const path = patternGeometry ?? graph.geometries.get(geometryKey(leg.lineId ?? "", direction));
    if (!path) continue;
    const snapped = sliceGeometryNearStops(path, from, to);
    if (snapped) consider(snapped);

    const positions = positionsOfLeg(graph, leg, direction);
    if (!positions) continue;
    const offset = clipSliceToStops(sliceGeometry(path, positions.from, positions.to), from, to);
    if (offset) consider(offset);
  }

  return best;
}

/**
 * The position of the boarding and the alighting stop on the line.
 *
 * The positions are the ones the planner used, so the slice of the path
 * matches the ride exactly.
 */
function positionsOfLeg(
  graph: Graph,
  leg: ItineraryLeg,
  direction: "forward" | "backward",
): { from: number; to: number } | null {
  const stops = graph.stopsByLine.get(leg.lineId ?? "");
  if (!stops) return null;

  const list = direction === "forward" ? stops.forward : stops.backward;
  const from = list.findIndex((stop) => stop.stationId === leg.fromStationId);
  const to = list.findIndex((stop) => stop.stationId === leg.toStationId);
  if (from === -1 || to === -1) return null;

  return { from: from + 1, to: to + 1 };
}

function platformAt(
  graph: Graph,
  lineId: string,
  direction: Direction,
  position: number | null | undefined,
): StopPlatform | null {
  if (position === null || position === undefined) return null;
  const stops = graph.stopsByLine.get(lineId)?.[direction] ?? [];
  return stops.find((stop) => stop.position === position)?.platform ?? null;
}

function stopOf(station: Station, position: number): ItineraryStop {
  return {
    stationId: station.id,
    name: station.name,
    latitude: station.latitude,
    longitude: station.longitude,
    position,
  };
}
