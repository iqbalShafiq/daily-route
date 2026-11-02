/**
 * The typed API client.
 *
 * The browser never talks to a model provider or a database; it talks to this
 * module, which talks to the application API.
 */

const BASE_URL = "/api";

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(payload?.error ?? `Permintaan gagal (${response.status})`, response.status);
  }

  return (await response.json()) as T;
}

export type MatchedRange = { start: number; end: number };

/** A suggestion in the place field: a stop, or a place that is not one. */
export type PlaceSuggestion = {
  kind: "station" | "place";
  id: string;
  name: string;
  systemId: string | null;
  systemName: string | null;
  code: string | null;
  latitude: number;
  longitude: number;
  isInterchange: boolean;
  lineCount?: number;
  street?: string | null;
  detail?: string;
  matchedRanges?: MatchedRange[];
};

export type StationSummary = {
  id: string;
  name: string;
  systemId: string;
  systemName?: string;
  code: string | null;
  latitude: number;
  longitude: number;
  isInterchange: boolean;
  /** How many lines serve the station. */
  lineCount?: number;
  /** The road the station stands on, when it is known. */
  street?: string | null;
  score?: number;
  /** The parts of the name that matched the query. */
  matchedRanges?: MatchedRange[];
};

export type SystemSummary = {
  id: string;
  name: string;
  mode: string;
  operator: string;
  description: string;
  color: string;
  website: string | null;
  lineCount: number;
};

export type LineSummary = {
  id: string;
  systemId: string;
  code: string;
  name: string;
  mode: string;
  serviceClass: string;
  operator: string;
  status: string;
  color: string | null;
  lengthKm: number | null;
};

export type LegStop = {
  stationId: string;
  name: string;
  latitude: number;
  longitude: number;
  /** The vehicle passes this stop, but does not serve it. */
  skipped?: boolean;
  /** The notice that says the stop is skipped. */
  skippedNotice?: string;
};

export type NoticeDiversionVia = {
  stationId: string;
  name: string;
  served: boolean;
};

export type DiversionDescription = {
  from: string | null;
  to: string | null;
  via: string[];
  follows: string[];
};

export type NoticeDiversion = {
  lineId: string;
  direction: "forward" | "backward";
  fromStationId: string;
  toStationId: string;
  via: NoticeDiversionVia[];
  viaLineCodes: string[];
  skippedStationIds: string[];
  skippedNames: string[];
  approximate: boolean;
  sourceUrl: string | null;
  quote: string | null;
};

export type LegDetour = {
  via: NoticeDiversionVia[];
  viaLineCodes: string[];
  skipped: string[];
  approximate: boolean;
};

export type LegVariant = {
  id: string;
  headsign: string;
  direction: "forward" | "backward";
  patternType: string;
  serviceLabel: string;
  serviceDays: string[];
  situational: boolean;
  serviceNote: string | null;
  holidayService: boolean;
  toll: boolean;
  isDefault: boolean;
  activeNow: boolean;
  stops: string[];
  skipped: string[];
  extra: string[];
};

export type ItineraryLeg = {
  kind: "walk" | "ride";
  mode: string;
  lineId: string | null;
  lineName: string | null;
  lineCode: string | null;
  serviceClass: string | null;
  /** An announced temporary service, not a permanent line. */
  temporary?: boolean;
  fromStationId: string | null;
  toStationId: string | null;
  fromName: string;
  toName: string;
  durationMinutes: number;
  distanceKm: number;
  stops: LegStop[];
  /** What a walk is for: to the first vehicle, to the last one, or a change. */
  walkReason: "access" | "egress" | "transfer" | null;
  /** The line the rider takes after this walk, for a change of vehicle. */
  nextLineName: string | null;
  /** The average wait for the vehicle, for a ride. */
  waitMinutes: number;
  /** The line the rider was on before this one, when they have to change. */
  changedFrom: string | null;
  /** Where the rider changes vehicle. */
  changedAt: string | null;
  /** The side of the road and the direction of travel, for a ride. */
  direction?: "forward" | "backward" | null;
  directionLabel?: string | null;
  fromPlatform?: { name: string; latitude: number; longitude: number; code: string | null } | null;
  toPlatform?: { name: string; latitude: number; longitude: number; code: string | null } | null;
  /** The scheduled service window for this ride. */
  serviceLabel?: string | null;
  headwayMinMinutes?: number | null;
  headwayMaxMinutes?: number | null;
  outsideService?: boolean;
  serviceDetail?: string | null;
  /** The path of this leg, along the road the vehicle travels. */
  geometry: { latitude: number; longitude: number }[];
  /** The borrowed path, when this ride is a diversion. */
  detour?: LegDetour | null;
  /** The scheduled trip pattern this ride uses. */
  patternId?: string | null;
  patternLabel?: string | null;
  patternType?: string | null;
  patternService?: string | null;
  /** All patterns of this line in this direction, for the switcher. */
  variants?: LegVariant[];
};

export type NoticeSource = {
  type: "x" | "news" | "link";
  text: string | null;
  authorHandle: string | null;
  authorName: string | null;
  publishedAt: string | null;
  url: string;
  title: string | null;
};

export type NoticeEvidence = {
  id: string;
  title: string;
  sources: NoticeSource[];
};

export async function getNoticeEvidence(id: string): Promise<NoticeEvidence> {
  return request<NoticeEvidence>(`/routes/disruptions/${encodeURIComponent(id)}/sources`);
}

export type FareBreakdownItem = {
  label: string;
  amountIdr: number;
  detail?: string;
};

/** Another price that is legal for the same journey. */
export type FareAlternative = {
  label: string;
  amountIdr: number;
  note: string;
};

export type FareQuote = {
  /** Whether the snapshot carries the published tariffs. */
  available: boolean;
  totalIdr: number | null;
  label: string | null;
  breakdown: FareBreakdownItem[];
  alternatives: FareAlternative[];
  notes: string[];
};

export type Itinerary = {
  durationMinutes: number;
  transferCount: number;
  /** The distance of the whole journey, along the roads. */
  distanceKm: number;
  /** The distance the rider covers on foot. */
  walkingKm: number;
  /** The planner's score: time, distance and changes in one number. */
  cost: number;
  lines: string[];
  /** What the journey costs. */
  fare: FareQuote;
  legs: ItineraryLeg[];
  geometry: { latitude: number; longitude: number }[];
};

export type ValidityWindow = {
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  scope: {
    systemIds: string[];
    lineIds: string[];
    stationIds: string[];
  };
  label: string;
  quote: string;
  evidenceUrl: string;
  confidence: number;
};

export type DisruptionSummary = {
  id: string;
  title: string;
  body: string;
  severity: string;
  kind: string;
  /** The case Jev chose. Absent until a choice is stored. */
  mark?: string | null;
  status: string;
  systemId: string | null;
  source: string;
  sourceType: string;
  url: string | null;
  lineId: string | null;
  stationId: string | null;
  affectedStationIds: string[];
  affectedLineIds: string[];
  publishedAt: string;
  observedAt: string;
  /** The instant the announcement says the effect starts, when it knows. */
  startsAt?: string | null;
  /** The instant the announcement says the effect ends. */
  endsAt: string | null;
  /** A stable slug for the event, shared by updates. */
  eventKey: string | null;
  /** The last time an announcement confirmed the notice. */
  lastSeenAt: string | null;
  /** The next time we will look for a fresher update. */
  reviewAt?: string | null;
  /** scheduled | verified | unverified | reviewing | none */
  reviewState?: string | null;
  /** The last time a reviewer checked the notice. */
  lastVerifiedAt?: string | null;
  /** The verified impact windows, when a verifier has run. */
  validityWindows: ValidityWindow[];
  /** Whether a window covers the current instant. */
  activeNow: boolean;
  impact: "direct" | "station" | "line";
  /** True when the record is a labelled scenario, not an operator announcement. */
  demonstration: boolean;
  /** True when the planner should stop using the stop or the line. */
  blocksService: boolean;
  /** The announcement says the service diverts via a toll road. */
  viaToll: boolean;
  /** The route names the announcement described. */
  diversionDescription?: DiversionDescription | null;
  /** The temporary patterns that keep the corridor running. */
  diversions?: NoticeDiversion[];
  /** What the notice is about: a stop, a corridor/line, or the operator. */
  scope: "stop" | "line" | "network";
  /** Every stop the notice names, in the order the API grounded them. */
  stations: {
    id: string;
    name: string;
    systemId: string;
    latitude: number;
    longitude: number;
  }[];
  /** Every corridor or rail line the notice names. */
  lines: {
    id: string;
    code: string;
    name: string;
    systemId: string;
  }[];
  /** The codes as printed, including a code the snapshot does not carry. */
  lineCodes: string[];
  /** The streets the announcement named, when it named one. */
  roads: { name: string; latitude: number; longitude: number; osmId: number }[];
  /**
   * The first stop, kept for the map's single point.
   *
   * A notice about a corridor has no such point; the row uses `scope` and
   * the map uses `stations` or `lines`.
   */
  latitude: number | null;
  longitude: number | null;
  stationName: string | null;
};

export type PlanResult = {
  origin: StationSummary & { text: string };
  destination: StationSummary & { text: string };
  itineraries: Itinerary[];
  alternatives: Itinerary[];
  /** Notices that touch the fastest journey. */
  disruptions: DisruptionSummary[];
  /**
   * Labelled scenarios that do not touch the fastest journey.
   *
   * They stay visible so the rider can see that the incident was checked
   * and that this journey does not pass it.
   */
  watch: DisruptionSummary[];
  /** The fastest journey uses a stop or a line that is out of service. */
  routeBlocked: boolean;
  /** When the answer was computed, as an ISO timestamp. */
  computedAt: string;
  /** The departure instant the planner used. */
  quotedAt?: string;
  /** The rider chose a departure time instead of "now". */
  scheduled?: boolean;
  /** The planner preferred fewer night walks. */
  nightSafe?: boolean;
};

export type DepartureLine = {
  lineId: string;
  code: string;
  name: string;
  mode: string;
  serviceClass: string;
  color: string | null;
  direction: "forward" | "backward";
  headsign: string | null;
  origin: string | null;
  platform: string | null;
  serviceLabel: string;
  detail: string | null;
  headwayMinMinutes: number | null;
  headwayMaxMinutes: number | null;
  waitMinutes: number | null;
  reliable: boolean;
  night: boolean;
};

export type DepartureBoard = {
  station: { id: string; name: string; latitude: number; longitude: number };
  at: string;
  lines: DepartureLine[];
};

export type StationDetail = {
  id: string;
  name: string;
  systemId: string;
  code: string | null;
  latitude: number;
  longitude: number;
  stationType: string;
  isInterchange: boolean;
  area: string | null;
  description: string;
  aliases: string[];
  lines: {
    id: string;
    code: string;
    name: string;
    serviceClass: string;
    mode: string;
  }[];
  interchangeWith: { id: string; name: string; systemId: string }[];
};

/** The walk from the reader's place to the stop that serves it. */
export type WalkRoute = {
  stationId: string;
  stationName: string;
  stationLatitude: number;
  stationLongitude: number;
  straightDistanceKm: number;
  distanceKm: number;
  durationMinutes: number;
  steps: { instruction: string; street: string | null; distanceKm: number }[];
  geometry: { latitude: number; longitude: number }[];
};

/** The journey planned from the reader's own position. */
export type PositionPlan = {
  needsDestination: boolean;
  stationId: string | null;
  stationName: string | null;
  totalMinutes: number | null;
  transferCount: number | null;
  distanceKm: number | null;
  walkingKm: number | null;
  accessWalkKm: number | null;
  walk: {
    distanceKm: number;
    durationMinutes: number;
    steps: { instruction: string; street: string | null; distanceKm: number }[];
    geometry: { latitude: number; longitude: number }[];
  } | null;
  profiles: {
    id: string;
    label: string;
    stationId: string | null;
    stationName: string | null;
    score: number | null;
    totalMinutes: number | null;
    transferCount: number | null;
    accessWalkKm: number | null;
  }[];
  candidates: {
    stationId: string;
    stationName: string;
    accessWalkKm: number;
    totalMinutes: number;
    transferCount: number;
    score: number;
  }[];
};

export const api = {
  health: () => request<{ status: string; agent: boolean; model: string }>("/health"),

  planFromPosition: (coordinates: { latitude: number; longitude: number }, destination: string) =>
    request<PositionPlan>(
      `/walk/plan?latitude=${coordinates.latitude}&longitude=${coordinates.longitude}` +
        `&destination=${encodeURIComponent(destination)}`,
    ),

  walk: (coordinates: { latitude: number; longitude: number }) =>
    request<WalkRoute>(
      `/walk?latitude=${coordinates.latitude}&longitude=${coordinates.longitude}`,
    ),

  networkOverview: () =>
    request<{
      lines: { id: string; systemId: string; tier: "primary" | "local"; coordinates: number[] }[];
      places: { id: string; systemId: string; name: string; longitude: number; latitude: number }[];
      platforms: {
        id: string;
        systemId: string;
        name: string;
        code: string | null;
        lineCode: string;
        direction: "forward" | "backward";
        longitude: number;
        latitude: number;
      }[];
    }>("/network/overview"),

  systems: () => request<SystemSummary[]>("/systems"),

  lines: (systemId?: string) =>
    request<LineSummary[]>(`/lines${systemId ? `?systemId=${encodeURIComponent(systemId)}` : ""}`),

  places: (query: string, signal?: AbortSignal) =>
    request<PlaceSuggestion[]>(
      `/places?q=${encodeURIComponent(query)}&limit=6`,
      signal ? { signal } : undefined,
    ),

  stations: (
    params: { q?: string; limit?: number; systemId?: string; minScore?: number },
    signal?: AbortSignal,
  ) => {
    const search = new URLSearchParams();
    if (params.q) search.set("q", params.q);
    if (params.limit) search.set("limit", String(params.limit));
    if (params.systemId) search.set("systemId", params.systemId);
    if (params.minScore !== undefined) search.set("minScore", String(params.minScore));
    const query = search.toString();
    return request<StationSummary[]>(
      `/stations${query ? `?${query}` : ""}`,
      signal ? { signal } : undefined,
    );
  },

  station: (id: string, signal?: AbortSignal) =>
    request<StationDetail>(
      `/stations/${encodeURIComponent(id)}`,
      signal ? { signal } : undefined,
    ),

  departures: (id: string, at?: string, signal?: AbortSignal) => {
    const search = new URLSearchParams();
    if (at) search.set("at", at);
    return request<DepartureBoard>(
      `/stations/${encodeURIComponent(id)}/departures${search.size ? `?${search}` : ""}`,
      signal ? { signal } : undefined,
    );
  },

  plan: (input: {
    origin: string;
    destination: string;
    originLatitude?: number;
    originLongitude?: number;
    destinationLatitude?: number;
    destinationLongitude?: number;
    at?: string;
    nightSafe?: boolean;
  }) => {
    const search = new URLSearchParams({
      origin: input.origin,
      destination: input.destination,
    });
    if (input.at) search.set("at", input.at);
    if (input.nightSafe) search.set("nightSafe", "true");
    if (input.originLatitude !== undefined && input.originLongitude !== undefined) {
      search.set("originLatitude", String(input.originLatitude));
      search.set("originLongitude", String(input.originLongitude));
    }
    if (input.destinationLatitude !== undefined && input.destinationLongitude !== undefined) {
      search.set("destinationLatitude", String(input.destinationLatitude));
      search.set("destinationLongitude", String(input.destinationLongitude));
    }
    return request<PlanResult>(`/routes/plan?${search.toString()}`);
  },

  disruptions: () => request<DisruptionSummary[]>("/routes/disruptions"),

  agentTools: () =>
    request<{ configured: boolean; model: string; provider: string }>("/agent/tools"),
};
