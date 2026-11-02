import { describe, expect, it } from "vitest";

import { planRoutes, type TransitNetwork } from "./graph.js";
import { diversionsFromMetadata, withDiversions } from "./diversion.js";
import type { Disruption, Line, LineStop, Station, Diversion } from "./types.js";

const stations: Station[] = ["A", "B", "C", "D", "X"].map((id, index) => ({
  id,
  systemId: "transjakarta",
  name: id,
  code: null,
  latitude: -6.2 + index * 0.01,
  longitude: 106.8 + index * 0.01,
  stationType: "stop",
  zone: null,
  isInterchange: false,
  description: "",
  area: null,
  aliases: [],
}));

const line: Line = {
  id: "line:l",
  systemId: "transjakarta",
  code: "L",
  name: "Line L",
  mode: "bus",
  serviceClass: "brt",
  operator: "Transjakarta",
  status: "operating",
  color: null,
  lengthKm: 1,
  description: "",
  aliases: [],
};

const lineStops: LineStop[] = [
  ...["A", "B", "C", "D"].map((stationId, index) => ({
    lineId: line.id,
    stationId,
    direction: "forward" as const,
    position: index + 1,
    distanceFromOriginKm: index,
  })),
  ...["D", "C", "B", "A"].map((stationId, index) => ({
    lineId: line.id,
    stationId,
    direction: "backward" as const,
    position: index + 1,
    distanceFromOriginKm: index,
  })),
];

const diversion: Diversion = {
  lineId: line.id,
  direction: "forward",
  fromStationId: "B",
  toStationId: "D",
  via: [{ stationId: "X", name: "X", served: true }],
  geometry: [
    { latitude: -6.19, longitude: 106.81 },
    { latitude: -6.21, longitude: 106.84 },
    { latitude: -6.18, longitude: 106.82 },
  ],
  viaLineCodes: ["6A"],
  skippedStationIds: ["C"],
  approximate: true,
};

const backwardDiversion: Diversion = {
  ...diversion,
  direction: "backward",
  fromStationId: "D",
  toStationId: "B",
  geometry: [...diversion.geometry].reverse(),
  via: [{ stationId: "X", name: "X", served: true }],
  skippedStationIds: ["C"],
};

const network: TransitNetwork = {
  lines: [line],
  stations,
  lineStops,
  stationGroups: [],
  geometries: [
    {
      lineId: line.id,
      direction: "forward",
      coordinates: [106.8, -6.2, 106.81, -6.19, 106.82, -6.18, 106.83, -6.17],
      stopOffsets: [0, 1, 2, 3],
      lengthKm: 4,
    },
    {
      lineId: line.id,
      direction: "backward",
      coordinates: [106.83, -6.17, 106.82, -6.18, 106.81, -6.19, 106.8, -6.2],
      stopOffsets: [0, 1, 2, 3],
      lengthKm: 4,
    },
  ],
};

const notice = {
  id: "notice",
  status: "active",
  startsAt: null,
  endsAt: null,
  diversions: [diversion, backwardDiversion],
} as unknown as Disruption;

describe("withDiversions", () => {
  it("replaces only the diverted span and keeps the line identity", () => {
    const routed = withDiversions(network, [notice]);
    const stops = routed.lineStops
      .filter((stop) => stop.lineId === line.id && stop.direction === "forward")
      .sort((left, right) => left.position - right.position)
      .map((stop) => stop.stationId);

    expect(stops).toEqual(["A", "B", "X", "D"]);
    expect(stops).not.toContain("C");

    const back = routed.lineStops
      .filter((stop) => stop.lineId === line.id && stop.direction === "backward")
      .sort((left, right) => left.position - right.position)
      .map((stop) => stop.stationId);
    expect(back).toEqual(["D", "X", "B", "A"]);
    expect(back).not.toContain("C");
    expect(routed.lines[0]?.id).toBe(line.id);

    const itinerary = planRoutes(routed, "A", "D")[0];
    expect(itinerary?.transferCount).toBe(0);
    expect(itinerary?.legs[0]?.lineId).toBe(line.id);
    expect(itinerary?.legs[0]?.stops.map((stop) => stop.stationId)).toEqual(["A", "B", "X", "D"]);
  });

  it("reads only a well-formed stored pattern", () => {
    expect(diversionsFromMetadata([diversion])).toHaveLength(1);
    expect(diversionsFromMetadata([{ lineId: "line:l" }])).toHaveLength(0);
    expect(diversionsFromMetadata("not an array")).toHaveLength(0);
  });
});
