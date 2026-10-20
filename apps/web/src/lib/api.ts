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

export type StationSummary = {
  id: string;
  name: string;
  systemId: string;
  systemName?: string;
  code: string | null;
  latitude: number;
  longitude: number;
  isInterchange: boolean;
  score?: number;
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
};

export type Itinerary = {
  durationMinutes: number;
  transferCount: number;
  lines: string[];
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

export const api = {
  health: () => request<{ status: string; agent: boolean; model: string }>("/health"),

  systems: () => request<SystemSummary[]>("/systems"),

  lines: (systemId?: string) =>
    request<LineSummary[]>(`/lines${systemId ? `?systemId=${encodeURIComponent(systemId)}` : ""}`),

  stations: (params: { q?: string; limit?: number; systemId?: string }) => {
    const search = new URLSearchParams();
    if (params.q) search.set("q", params.q);
    if (params.limit) search.set("limit", String(params.limit));
    if (params.systemId) search.set("systemId", params.systemId);
    const query = search.toString();
    return request<StationSummary[]>(`/stations${query ? `?${query}` : ""}`);
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
