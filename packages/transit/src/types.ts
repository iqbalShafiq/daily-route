/**
 * The transit domain model.
 *
 * These types are the contract between the database layer, the routing
 * engine, the semantic resolver and the API. They are intentionally plain:
 * no database identifiers, no framework types, no nullability tricks.
 */

export type TransitMode = "bus" | "minibus" | "tram" | "metro" | "rail";

/**
 * How a line is operated.
 *
 * `brt` covers Transjakarta's trunk corridors, `feeder` its Mikrotrans
 * services, `minitrans` the smaller minibus class, `non-brt` the regular
 * city routes. The rail classes separate the metro (MRT), the light rail
 * (LRT Jakarta, LRT Jabodebek) and the commuter rail (KRL Jabodetabek).
 */
export type ServiceClass =
  | "brt"
  | "feeder"
  | "minitrans"
  | "non-brt"
  | "rapid-transit"
  | "lrt"
  | "commuter-rail"
  | "royaltrans";

export type LineStatus = "operating" | "planned" | "suspended" | "closed";

export type StationType = "stop" | "station" | "terminal";

/** Travel direction along a line, relative to its canonical stop order. */
export type Direction = "forward" | "backward";

export type System = {
  id: string;
  name: string;
  mode: TransitMode;
  operator: string;
  description: string;
  color: string;
  website: string | null;
  timezone: string;
};

export type Line = {
  id: string;
  systemId: string;
  code: string;
  name: string;
  mode: TransitMode;
  serviceClass: ServiceClass;
  operator: string;
  status: LineStatus;
  color: string | null;
  lengthKm: number | null;
  description: string;
  aliases: string[];
};

export type Station = {
  id: string;
  systemId: string;
  name: string;
  code: string | null;
  latitude: number;
  longitude: number;
  stationType: StationType;
  zone: string | null;
  isInterchange: boolean;
  description: string;
  area: string | null;
  aliases: string[];
};

export type LineStop = {
  lineId: string;
  stationId: string;
  direction: Direction;
  position: number;
  distanceFromOriginKm: number | null;
};

/**
 * A set of stations that are physically the same place, reached by different
 * modes. The interchange hubs of Greater Jakarta are the obvious members.
 */
export type StationGroup = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  stationIds: string[];
};

export type DisruptionSeverity = "info" | "warning" | "severe" | "critical";

export type DisruptionKind =
  | "diversion"
  | "closure"
  | "delay"
  | "service-change"
  | "maintenance"
  | "strike"
  | "weather"
  | "unknown";

export type DisruptionStatus = "active" | "resolved";

export type Disruption = {
  id: string;
  source: string;
  sourceType: "social" | "news" | "official";
  systemId: string | null;
  lineId: string | null;
  stationId: string | null;
  stationGroupId: string | null;
  severity: DisruptionSeverity;
  status: DisruptionStatus;
  kind: DisruptionKind;
  title: string;
  body: string;
  url: string | null;
  confidence: number;
  publishedAt: string;
  observedAt: string;
  resolvedAt: string | null;
  affectedStationIds: string[];
  affectedLineIds: string[];
};

export type ItineraryStop = {
  stationId: string;
  name: string;
  latitude: number;
  longitude: number;
  position: number;
};

export type ItineraryLeg = {
  kind: "walk" | "ride";
  mode: TransitMode | "walk";
  lineId: string | null;
  lineName: string | null;
  lineCode: string | null;
  serviceClass: ServiceClass | null;
  fromStationId: string | null;
  toStationId: string | null;
  fromName: string;
  toName: string;
  durationMinutes: number;
  distanceKm: number;
  stops: ItineraryStop[];
  coordinates: { latitude: number; longitude: number }[];
  /**
   * What this walk is for.
   *
   * `access` is the walk to the first vehicle, `egress` the walk after the
   * last one, and `transfer` a change of vehicle. Only a transfer asks the
   * rider to do something.
   */
  walkReason: "access" | "egress" | "transfer" | null;
  /** The line the rider takes after this walk, for a transfer. */
  nextLineName: string | null;
  /** The average wait for the vehicle, for a ride. */
  waitMinutes: number;
  /** The line the rider was on before this one, when they have to change. */
  changedFrom: string | null;
  /** Where the rider changes vehicle. */
  changedAt: string | null;
};

export type Itinerary = {
  originStationId: string;
  destinationStationId: string;
  durationMinutes: number;
  transferCount: number;
  legs: ItineraryLeg[];
  coordinates: { latitude: number; longitude: number }[];
  warnings: string[];
  /** The distance the whole journey covers, along the roads. */
  distanceKm: number;
  /** The distance the rider covers on foot. */
  walkingKm: number;
  /**
   * The planner's own score for this journey.
   *
   * Time, distance and the inconvenience of every change, in one number.
   * The lower the better, and it is what the alternatives are ranked by.
   */
  cost: number;
};
