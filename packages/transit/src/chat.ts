/**
 * The semantic shapes the chat interface renders.
 *
 * The model writes prose. These cards come from a tool result, so a card
 * cannot name a station, a duration or a fare the planner did not return.
 */

export type ChatRouteLeg = {
  kind: "walk" | "ride";
  mode: string;
  lineCode: string | null;
  lineName: string | null;
  serviceClass: string | null;
  from: string;
  to: string;
  durationMinutes: number;
  distanceKm: number;
  waitMinutes: number;
  serviceLabel: string | null;
  headwayMinMinutes: number | null;
  headwayMaxMinutes: number | null;
  outsideService: boolean;
  serviceDetail: string | null;
};

export type ChatRouteOption = {
  durationMinutes: number;
  distanceKm: number;
  walkingKm: number;
  transfers: number;
  fareLabel: string | null;
  fareTotal: number | null;
  legs: ChatRouteLeg[];
};

export type ChatRouteCard = {
  type: "route";
  origin: string;
  destination: string;
  status: "terbuka" | "terhalang" | "tidak-diketahui" | string;
  primary: ChatRouteOption;
  alternatives: ChatRouteOption[];
  notices: { id: string; title: string; severity: string; scope: string; role: string }[];
  note: string | null;
};

export type ChatStopCard = {
  type: "stop";
  stationId: string;
  name: string;
  systemId: string | null;
  latitude: number;
  longitude: number;
  area: string | null;
  lines: { code: string; name: string; serviceClass: string }[];
  departures: {
    code: string;
    direction: "forward" | "backward";
    headsign: string | null;
    serviceLabel: string;
    headwayMinMinutes: number | null;
    detail: string | null;
    active: boolean;
  }[];
};

export type ChatNoticeCard = {
  type: "notice";
  id: string;
  title: string;
  severity: string;
  kind: string;
  scope: string;
  affects: string;
  role: string;
  url: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type ChatSourceCard = {
  type: "source";
  title: string;
  url: string;
  publisher: string | null;
};

export type ChatCard = ChatRouteCard | ChatStopCard | ChatNoticeCard | ChatSourceCard;
