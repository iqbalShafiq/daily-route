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
import { geometryKey, sliceGeometry, type LineGeometry } from "./geometry.js";
import type {
  Direction,
  Itinerary,
  ItineraryLeg,
  ItineraryStop,
  Line,
  LineStop,
  ServiceClass,
  Station,
  StationGroup,
  TransitMode,
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
};

const DEFAULT_OPTIONS: Required<
  Pick<RouteOptions, "maxTransfers" | "transferPenaltyMinutes" | "maxAlternatives">
> = {
  maxTransfers: null,
  transferPenaltyMinutes: DEFAULT_TRANSFER_PENALTY_MINUTES,
  maxAlternatives: 3,
};

/** Build the searchable graph from a network snapshot. */
export function buildGraph(network: TransitNetwork): Graph {
  const stations = new Map(network.stations.map((station) => [station.id, station]));
  const lines = new Map(network.lines.map((line) => [line.id, line]));
  const adjacency = new Map<string, Edge[]>();

  const push = (edge: Edge): void => {
    const list = adjacency.get(edge.from);
    if (list) {
      list.push(edge);
    } else {
      adjacency.set(edge.from, [edge]);
    }
  };

  const stopsByLine = groupStopsByLine(network.lineStops);
  const geometries = new Map<string, LineGeometry>();
  for (const geometry of network.geometries ?? []) {
    geometries.set(geometryKey(geometry.lineId, geometry.direction), geometry);
  }

  for (const [lineId, stops] of stopsByLine) {
    const line = lines.get(lineId);
    if (!line || line.status !== "operating") continue;

    const forward = stops.forward;
    const backward = stops.backward.length > 0 ? stops.backward : [...forward].reverse();

    // A line with a single stop cannot be travelled: there is nowhere to
    // board and nowhere to leave.
    if (forward.length < 2) continue;

    connectStops(
      push,
      stations,
      line,
      forward,
      "forward",
      geometries.get(geometryKey(line.id, "forward")),
    );
    connectStops(
      push,
      stations,
      line,
      backward,
      "backward",
      geometries.get(geometryKey(line.id, "backward")),
    );
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
          penaltyMinutes: 0,
          fromPosition: null,
          toPosition: null,
        });
      }
    }
  }

  return { stations, lines, adjacency, stopsByLine, geometries };
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
): void {
  for (let index = 0; index < stops.length - 1; index += 1) {
    const current = stops[index];
    const next = stops[index + 1];
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
      penaltyMinutes: 0,
      fromPosition: current.position,
      toPosition: next.position,
    });
  }
}

/**
 * Distance between two consecutive stops.
 *
 * The cumulative distance published with the stop list is preferred; when it
 * is missing the straight-line distance is used with a detour factor.
 */
function segmentDistanceKm(
  from: Station,
  to: Station,
  current: LineStop,
  next: LineStop,
  geometry: LineGeometry | undefined,
): number {
  // The distance published with the stop list is the distance along the
  // road, so it is the one a rider actually travels.
  if (
    current.distanceFromOriginKm !== null &&
    next.distanceFromOriginKm !== null &&
    current.distanceFromOriginKm !== undefined &&
    next.distanceFromOriginKm !== undefined
  ) {
    const delta = Math.abs(next.distanceFromOriginKm - current.distanceFromOriginKm);
    if (delta > 0) return delta;
  }

  // A line with a known path can still be measured along it.
  if (geometry) {
    const points = geometry.coordinates;
    const fromOffset = geometry.stopOffsets[current.position - 1];
    const toOffset = geometry.stopOffsets[next.position - 1];
    if (fromOffset !== undefined && toOffset !== undefined && toOffset > fromOffset) {
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
      if (distance > 0) return distance;
    }
  }

  return haversineKm(from, to) * DETOUR_FACTOR;
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
  },
): SearchResult | null {
  const { stations } = graph;
  const origin = stations.get(originId);
  const destination = stations.get(destinationId);
  if (!origin || !destination) return null;
  if (originId === destinationId) return { stationIds: [originId], edges: [] };

  const bestCost = new Map<string, number>([[originId, 0]]);
  const bestPath = new Map<string, { previous: string | null; edge: Edge | null }>([
    [originId, { previous: null, edge: null }],
  ]);
  const transfersUsed = new Map<string, number>([[originId, 0]]);
  // Whether the rider has already been on a vehicle. The walk to the first
  // vehicle is not a change of vehicle, and neither is the walk at the end.
  const hasRidden = new Map<string, boolean>([[originId, false]]);
  // The line the rider is on, so that staying on the same vehicle costs
  // nothing extra and boarding another one costs the wait.
  const currentLine = new Map<string, string | null>([[originId, null]]);

  const frontier: SearchNode[] = [
    {
      id: originId,
      cost: 0,
      estimate: heuristicMinutes(origin, destination),
    },
  ];

  while (frontier.length > 0) {
    frontier.sort((a, b) => a.estimate - b.estimate);
    const current = frontier.shift();
    if (!current) break;

    if (current.id === destinationId) {
      return reconstruct(bestPath, destinationId);
    }

    const known = bestCost.get(current.id);
    if (known !== undefined && current.cost > known) continue;

    const edges = graph.adjacency.get(current.id) ?? [];
    for (const edge of edges) {
      if (options.blockedStationIds.has(edge.to)) continue;
      if (edge.lineId !== null && options.blockedLineIds.has(edge.lineId)) continue;

      const isWalk = edge.kind === "walk";
      const ridden = hasRidden.get(current.id) ?? false;
      const usedTransfers = transfersUsed.get(current.id) ?? 0;
      // A walk counts as a change of vehicle only when the rider has been
      // on one already and will board another one.
      const nextTransfers = isWalk && ridden ? usedTransfers + 1 : usedTransfers;
      if (options.maxTransfers !== null && nextTransfers > options.maxTransfers) continue;

      const linePenalty = edge.lineId ? (options.linePenalties.get(edge.lineId) ?? 0) : 0;
      const transferPenalty =
        isWalk && ridden ? options.transferPenaltyMinutes : 0;
      // Boarding a different vehicle means waiting for it.
      const boarded = edge.kind === "ride" && edge.lineId !== currentLine.get(current.id);
      const wait = boarded && edge.mode ? AVERAGE_WAIT_MINUTES[edge.mode] : 0;
      const cost =
        current.cost +
        edge.durationMinutes +
        edge.distanceKm * DISTANCE_WEIGHT_MINUTES_PER_KM +
        linePenalty +
        transferPenalty +
        wait;

      const knownCost = bestCost.get(edge.to);
      if (knownCost !== undefined && cost >= knownCost) continue;

      bestCost.set(edge.to, cost);
      bestPath.set(edge.to, { previous: current.id, edge });
      transfersUsed.set(edge.to, nextTransfers);
      hasRidden.set(edge.to, ridden || edge.kind === "ride");
      currentLine.set(edge.to, edge.kind === "ride" ? edge.lineId : null);

      const target = stations.get(edge.to);
      if (!target) continue;
      frontier.push({
        id: edge.to,
        cost,
        estimate: cost + heuristicMinutes(target, destination),
      });
    }
  }

  return null;
}

type SearchNode = { id: string; cost: number; estimate: number };

function heuristicMinutes(from: Station, to: Station): number {
  return (haversineKm(from, to) / HEURISTIC_SPEED_KMH) * 60;
}

function reconstruct(
  bestPath: Map<string, { previous: string | null; edge: Edge | null }>,
  destinationId: string,
): SearchResult {
  const stationIds: string[] = [];
  const edges: Edge[] = [];
  let cursor: string | null = destinationId;

  while (cursor !== null) {
    stationIds.push(cursor);
    const info: { previous: string | null; edge: Edge | null } | undefined = bestPath.get(cursor);
    if (!info) break;
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
  const graph = buildGraph(network);
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
      if (currentLeg && currentLeg.kind === "ride" && currentLeg.lineId === lineId) {
        currentLeg.toStationId = to.id;
        currentLeg.toName = to.name;
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
          changedFrom: null,
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
      changedFrom: null,
      changedAt: null,
    };
    legs.push(currentLeg);
  }

  // The path of a ride is the road the vehicle drives on, not a line
  // between the stops.
  for (const leg of legs) {
    if (leg.kind !== "ride" || !leg.lineId) continue;
    const geometry = graph.geometries.get(geometryKey(leg.lineId, "forward"));
    const direction = directionOfLeg(graph, leg);
    const path = direction ? graph.geometries.get(geometryKey(leg.lineId, direction)) : geometry;
    if (!path) continue;

    const positions = positionsOfLeg(graph, leg, direction);
    if (!positions) continue;

    const slice = sliceGeometry(path, positions.from, positions.to);
    if (slice.length >= 2) {
      leg.coordinates = slice.map((point) => ({
        latitude: point.latitude,
        longitude: point.longitude,
      }));
    }
  }

  // Boarding a vehicle means waiting for it. Staying on the same one does
  // not, which is why a rider who can stay on board is favoured.
  legs.forEach((leg, index) => {
    if (leg.kind !== "ride") return;
    const previous = legs[index - 1];
    const continues = previous?.kind === "ride" && previous.lineId === leg.lineId;
    if (continues) return;
    leg.waitMinutes = AVERAGE_WAIT_MINUTES[leg.mode as TransitMode] ?? 0;
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

/** The direction a ride leg travels in. */
function directionOfLeg(graph: Graph, leg: ItineraryLeg): "forward" | "backward" {
  const stops = graph.stopsByLine.get(leg.lineId ?? "");
  if (!stops) return "forward";

  const forward = stops.forward.findIndex((stop) => stop.stationId === leg.fromStationId);
  const backward = stops.backward.findIndex((stop) => stop.stationId === leg.fromStationId);
  if (forward === -1 && backward === -1) return "forward";
  if (forward === -1) return "backward";
  if (backward === -1) return "forward";
  return forward <= backward ? "forward" : "backward";
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

function stopOf(station: Station, position: number): ItineraryStop {
  return {
    stationId: station.id,
    name: station.name,
    latitude: station.latitude,
    longitude: station.longitude,
    position,
  };
}
