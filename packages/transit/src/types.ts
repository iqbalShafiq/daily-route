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
/**
 * The kind of service a line belongs to.
 *
 * The names are the ones the operators use themselves, because the tariff
 * and the vehicle a rider meets follow them. "Mikrotrans" is the official
 * name of what used to be called a feeder bus; "Wisata", "Rumah Susun",
 * "Transjabodetabek" and "Amari" are the four services the operator
 * runs besides the corridors and the feeder buses.
 */
export type ServiceClass =
  | "brt"
  | "non-brt"
  | "mikrotrans"
  | "minitrans"
  | "royaltrans"
  | "wisata"
  | "rumah-susun"
  | "transjabodetabek"
  | "amari"
  | "rapid-transit"
  | "lrt"
  | "commuter-rail";

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
  /** Operator data that is not needed to draw the line, such as its GTFS service windows. */
  metadata?: Record<string, unknown>;
};

/**
 * One published service window of a line in one direction.
 *
 * `days` uses ISO weekdays (1 Monday … 7 Sunday). The minutes are Jakarta
 * minutes from midnight. A line can have several overlapping windows when a
 * corridor has a frequent trunk service and a less frequent branch; the
 * planner uses the most frequent window that covers the requested minute.
 */
export type LineServiceWindow = {
  days: number[];
  startMinute: number;
  endMinute: number;
  headwayMinutes: number;
  exactTimes?: boolean;
  /** The headway is a planning estimate, not a published frequency. */
  estimated?: boolean;
};

/**
 * The service calendar the planner may use for a line.
 *
 * A single full-day row is a complete schedule; a short row is complete only
 * for a curated one-way route such as 7R (05:00–06:00). A short return row on
 * a two-way line is not, because the other direction may be the complete one
 * (10H's return row ends at 07:00 while the official service runs to 22:00).
 * An implausible template row remains context and never removes a journey.
 */
export type LineService = {
  /**
   * `gtfs` for the operator feed, `temporary` for an overlay announced on
   * social media. A temporary service is still a normal line to the planner;
   * its validity comes from the announcement, not from a GTFS calendar.
   */
  source: "gtfs" | "temporary";
  timezone: "Asia/Jakarta";
  /** The windows of each direction; a one-way line has only one entry. */
  byDirection: Partial<Record<Direction, LineServiceWindow[]>>;
  /** Whether the direction's window is complete enough to remove a journey. */
  reliableByDirection: Partial<Record<Direction, boolean>>;
  /** First instant the temporary service may be used, when it has one. */
  validFrom?: string;
  /** Last instant the temporary service may be used, when it has one. */
  validUntil?: string;
  updatedAt: string;
};

/**
 * One temporary or scheduled pattern of a line.
 *
 * A route code is not one stop list. The same code can run via Tomang or
 * Cideng, with or without the toll, or as a short-turn. The line identity,
 * fare and colour stay the same; the pattern is the shape and the ordered
 * stops of a particular trip.
 */
export type LinePatternType = "base" | "branch" | "short-turn" | "express" | "toll" | "loop";

/**
 * A service the operator announced for a bounded period.
 *
 * It is not a change to the committed network: the announcement is evidence,
 * and the overlay adds a line the planner can use while the window is valid.
 * Stops are station ids that already exist; no coordinate is invented.
 */
export type TemporaryServiceDirection = {
  direction: Direction;
  headsign: string;
  /** Ordered station ids, grounded before this record is written. */
  stationIds: string[];
  /** Daily service windows for this direction. */
  windows: LineServiceWindow[];
};

export type TemporaryServiceSource = {
  postId: string;
  url: string | null;
  authorHandle: string;
  publishedAt: string;
  quote: string;
  images: string[];
};

export type TemporaryService = {
  id: string;
  eventKey: string;
  code: string;
  name: string;
  systemId: string;
  mode: TransitMode;
  serviceClass: ServiceClass;
  operator: string;
  color: string | null;
  directions: TemporaryServiceDirection[];
  startsAt: string;
  endsAt: string | null;
  /** When the announcement should be read again; not an operational end. */
  reviewAt: string | null;
  status: "active" | "needs_review" | "withdrawn" | "expired";
  source: TemporaryServiceSource;
  confidence: number;
  metadata: Record<string, unknown>;
};

export type LinePattern = {
  id: string;
  lineId: string;
  code: string;
  headsign: string;
  direction: Direction;
  patternType: LinePatternType;
  stopIds: string[];
  /** Flat `[longitude, latitude, …]` pairs for the borrowed shape. */
  geometry: number[];
  stopOffsets: number[];
  /** The weekdays the pattern runs, e.g. ["Sunday"]. Empty means daily. */
  serviceDays: string[];
  serviceLabel: string;
  toll: boolean;
  isDefault: boolean;
  source: string;
  sourceUrl: string | null;
  metadata: Record<string, unknown>;
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

/** The boarding point of one line in one direction. */
export type StopPlatform = {
  /** Stable id of the physical boarding point; shared by lines at one bay. */
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  code: string | null;
};

export type LineStop = {
  lineId: string;
  stationId: string;
  direction: Direction;
  position: number;
  distanceFromOriginKm: number | null;
  /**
   * Where the vehicle actually stops. The station is the stop area a rider
   * searches for and transfers at; the platform is the side of the road the
   * vehicle serves in this direction. Opposite directions often use two
   * platforms with the same station name, and a median halt can serve both.
   */
  platform?: StopPlatform;
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

/**
 * What part of the network a notice is about.
 *
 * A notice is never "unplaced". It is about a place the rider can stand at
 * (`stop`), about a corridor or a rail line the rider can ride (`line`), or
 * about an operator's whole service (`network`). The first two are drawn on
 * the map; the third is the only one that has no single line to point at.
 */
export type NoticeScope = "stop" | "line" | "network";

/**
 * A road an announcement names, resolved to OpenStreetMap.
 *
 * A diversion "near Jl. Pintu Air Raya" is not one halte: every stop of the
 * corridor that stands on that road is affected. The road keeps the
 * coordinate it was found at, so a later reader can see which of the
 * streets with that name the notice meant.
 */
export type RoadRef = {
  name: string;
  osmType: "way" | "node" | "relation";
  osmId: number;
  latitude: number;
  longitude: number;
  /** The stops of the affected lines that stand on this road. */
  stationIds: string[];
};

export type ValidityWindow = {
  /** ISO instant the window starts. */
  startsAt: string;
  /** ISO instant it ends, or null when the source does not know. */
  endsAt: string | null;
  /** IANA zone the source stated; always Asia/Jakarta for this network. */
  timezone: string;
  /** What part of the network this window applies to. */
  scope: {
    systemIds: string[];
    lineIds: string[];
    stationIds: string[];
  };
  /** The route or stop named in the source, for the rider. */
  label: string;
  /** The sentence that supports the window. */
  quote: string;
  evidenceUrl: string;
  confidence: number;
};

/**
 * One temporary path of a line that is still running.
 *
 * `via` is everything the announcement names along the borrowed path. A
 * `served` stop may be boarded or left; an alignment stop is only a place
 * the vehicle passes, and is drawn but not offered as a stop.
 */
export type DiversionVia = {
  stationId: string;
  name: string;
  served: boolean;
};

export type Diversion = {
  lineId: string;
  direction: Direction;
  fromStationId: string;
  toStationId: string;
  via: DiversionVia[];
  /** The borrowed road, from the divergence to the rejoin point. */
  geometry: { latitude: number; longitude: number }[];
  /** Corridors whose path the diversion follows, for the rider. */
  viaLineCodes?: string[];
  /** Stops of the ordinary path that are passed without service. */
  skippedStationIds?: string[];
  /** True when the source names waypoints but not every street. */
  approximate: boolean;
  sourceUrl?: string;
  quote?: string;
};

/** The diversion attached to a ride leg, in the shape the interface reads. */
export type DiversionDetail = {
  via: { name: string; served: boolean }[];
  viaLineCodes: string[];
  skipped: string[];
  approximate: boolean;
};

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
  /** A stable slug for the event, shared by every announcement about it. */
  eventKey?: string | null;
  /** The instant the announcement itself says the effect ends. */
  startsAt?: string | null;
  endsAt?: string | null;
  /** The last time an announcement confirmed this notice. */
  lastSeenAt?: string;
  /** The next time the evidence should be checked again. */
  reviewAt?: string | null;
  /** scheduled | verified | unverified | reviewing | none */
  reviewState?: string | null;
  /** The last time the review agent looked at this notice. */
  lastVerifiedAt?: string | null;
  /**
   * The impact windows the verifier found.
   *
   * One notice can affect corridor 9 in the morning and a different route on
   * the next day. A single `endsAt` cannot express that.
   */
  validityWindows?: ValidityWindow[];
  affectedStationIds: string[];
  affectedLineIds: string[];
  /** What the notice is about: a stop, a corridor/line, or the operator. */
  scope?: NoticeScope | null;
  /** The line codes as the announcement printed them, even when unknown. */
  lineCodes?: string[];
  /** The roads the announcement named, grounded against OpenStreetMap. */
  roads?: RoadRef[];
  /**
   * The direction the announcement means, when it says one ("arah Kota").
   * A stop closure for one direction does not close the other.
   */
  direction?: Direction | null;
  /** The place the service heads to, as the announcement wrote it. */
  towards?: string | null;
  /**
   * The platforms the notice is limited to.
   *
   * A platform is one line in one direction: a closure of the northbound
   * side of a corridor does not close the southbound side, and a station
   * shared by two lines keeps serving the other one.
   */
  platforms?: {
    lineId: string;
    direction: Direction;
    /** The stop the platform belongs to, when the notice names one. */
    stationId?: string;
    /** The physical boarding point, when it is known. */
    platformId?: string;
  }[];
  /** True when the announcement says the service is diverted via a toll road. */
  viaToll?: boolean;
  /** The temporary patterns that keep the service running on another road. */
  diversions?: Diversion[];
  /** The route names the announcement described, before a path is built. */
  diversionDescription?: {
    from: string | null;
    to: string | null;
    via: string[];
    follows: string[];
  } | null | undefined;
  /** The case icon, when Jev has chosen one. Absent on older rows. */
  mark?: string | null;
};

/** The fields that decide whether a notice is in force at an instant. */
export type NoticeTimeline = Pick<Disruption, "startsAt" | "endsAt" | "validityWindows">;

/**
 * Whether a notice affects the network at an instant.
 *
 * A verified notice has one or more impact windows. It is not active just
 * because its last day is in the future: a running event can close a road
 * from 03:00 to 09:00 and be irrelevant for the rest of the day. A notice
 * without windows keeps the old `endsAt` behaviour.
 */
export function isActiveAt(disruption: NoticeTimeline, at: Date = new Date()): boolean {
  const windows = disruption.validityWindows ?? [];
  if (windows.length > 0) {
    return windows.some((window) => {
      const start = Date.parse(window.startsAt);
      const end = window.endsAt ? Date.parse(window.endsAt) : Number.POSITIVE_INFINITY;
      return Number.isFinite(start) && start <= at.getTime() && at.getTime() < end;
    });
  }
  if (disruption.startsAt) {
    const start = Date.parse(disruption.startsAt);
    if (Number.isFinite(start) && at.getTime() < start) return false;
  }
  if (!disruption.endsAt) return true;
  return at.getTime() < Date.parse(disruption.endsAt);
}

/**
 * What a notice is about, for rows stored before `scope` existed.
 *
 * A row that names a stop is about that stop even when it also names the
 * corridor: the rider can walk to the stop. The stored value wins once the
 * grounding pass has written one.
 */
export function noticeScopeOf(disruption: Disruption): NoticeScope {
  if (disruption.scope) return disruption.scope;
  const stations = [
    ...(disruption.stationId ? [disruption.stationId] : []),
    ...disruption.affectedStationIds,
  ];
  if (stations.length > 0) return "stop";
  const lines = [
    ...(disruption.lineId ? [disruption.lineId] : []),
    ...disruption.affectedLineIds,
  ];
  if (lines.length > 0) return "line";
  return "network";
}

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
  /** The service window label, e.g. "Frequent · every 3–6 min". */
  serviceLabel?: string | null;
  /** The shortest and longest scheduled headway at the boarding time. */
  headwayMinMinutes?: number | null;
  headwayMaxMinutes?: number | null;
  /** The line is outside its published service window. */
  outsideService?: boolean;
  /** The published daily window, e.g. "05:00–22:00 WIB". */
  serviceDetail?: string | null;
  /** The line the rider was on before this one, when they have to change. */
  changedFrom: string | null;
  /** Where the rider changes vehicle. */
  changedAt: string | null;
  /** The direction of travel along the line, for a ride. */
  direction: Direction | null;
  /** The platform the rider boards at. */
  fromPlatform: StopPlatform | null;
  /** The platform the rider alights at. */
  toPlatform: StopPlatform | null;
  /** The borrowed path this ride uses, when it is diverted. */
  detour?: DiversionDetail | null;
  /** This ride is on an announced temporary service, not the permanent network. */
  temporary?: boolean;
  /** The scheduled pattern of this line the rider boards. */
  patternId?: string | null;
  patternLabel?: string | null;
  patternType?: LinePatternType | null;
  patternService?: string | null;
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
