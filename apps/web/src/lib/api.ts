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
};

export type ItineraryLeg = {
  kind: "walk" | "ride";
  mode: string;
  lineId: string | null;
  lineName: string | null;
  lineCode: string | null;
  serviceClass: string | null;
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
  /** The path of this leg, along the road the vehicle travels. */
  geometry: { latitude: number; longitude: number }[];
};

export type FareBreakdownItem = {
  label: string;
  amountIdr: number;
  detail?: string;
};

export type FareQuote = {
  /** Whether the snapshot carries the published tariffs. */
  available: boolean;
  totalIdr: number | null;
  label: string | null;
  breakdown: FareBreakdownItem[];
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

export type DisruptionSummary = {
  id: string;
  title: string;
  body: string;
  severity: string;
  kind: string;
  status: string;
  source: string;
  sourceType: string;
  url: string | null;
  lineId: string | null;
  stationId: string | null;
  affectedStationIds: string[];
  affectedLineIds: string[];
  publishedAt: string;
  impact: "direct" | "station" | "line";
};

export type PlanResult = {
  origin: StationSummary & { text: string };
  destination: StationSummary & { text: string };
  itineraries: Itinerary[];
  alternatives: Itinerary[];
  disruptions: DisruptionSummary[];
  /** When the answer was computed, as an ISO timestamp. */
  computedAt: string;
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

  systems: () => request<SystemSummary[]>("/systems"),

  lines: (systemId?: string) =>
    request<LineSummary[]>(`/lines${systemId ? `?systemId=${encodeURIComponent(systemId)}` : ""}`),

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

  station: (id: string) => request<StationDetail>(`/stations/${encodeURIComponent(id)}`),

  plan: (origin: string, destination: string) =>
    request<PlanResult>(
      `/routes/plan?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`,
    ),

  disruptions: () => request<DisruptionSummary[]>("/routes/disruptions"),

  agentTools: () =>
    request<{ configured: boolean; model: string; provider: string }>("/agent/tools"),
};
