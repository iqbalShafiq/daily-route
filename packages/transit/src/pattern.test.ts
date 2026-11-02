import { describe, expect, it } from "vitest";

import { planRoutes } from "./graph.js";
import type { Line, LinePattern, LineStop, Station } from "./types.js";

const line: Line = {
  id: "transjakarta:8",
  systemId: "transjakarta",
  code: "8",
  name: "Lebak Bulus - Pasar Baru",
  mode: "bus",
  serviceClass: "brt",
  operator: "PT Transportasi Jakarta",
  status: "operating",
  color: null,
  lengthKm: 20,
  description: "",
  aliases: [],
};

function stop(id: string, name: string, longitude: number): Station {
  return {
    id,
    systemId: "transjakarta",
    name,
    code: null,
    latitude: -6.2,
    longitude,
    stationType: "stop",
    zone: null,
    isInterchange: false,
    description: "",
    area: null,
    aliases: [],
  };
}

const stations = [
  stop("a", "Lebak Bulus", 106.79),
  stop("b", "Kebayoran", 106.8),
  stop("x", "Roxy", 106.81),
  stop("c", "Pasar Baru", 106.83),
];

const baseStops: LineStop[] = [
  { lineId: line.id, stationId: "a", direction: "forward", position: 1, distanceFromOriginKm: 0 },
  { lineId: line.id, stationId: "b", direction: "forward", position: 2, distanceFromOriginKm: 1 },
  { lineId: line.id, stationId: "c", direction: "forward", position: 3, distanceFromOriginKm: 2 },
];

const cideng: LinePattern = {
  id: "transjakarta:8:forward:cideng",
  lineId: line.id,
  code: "8",
  headsign: "Pasar Baru via Cideng",
  direction: "forward",
  patternType: "branch",
  stopIds: ["a", "x", "c"],
  geometry: [],
  stopOffsets: [0, 1, 2],
  serviceDays: ["Sunday"],
  serviceLabel: "Sunday",
  toll: false,
  isDefault: false,
  source: "gtfs",
  sourceUrl: null,
  metadata: {},
};

const network = {
  lines: [line],
  stations,
  lineStops: baseStops,
  stationGroups: [],
  patterns: [cideng],
};

describe("scheduled line patterns", () => {
  it("uses the Sunday branch only on Sunday", () => {
    const sunday = planRoutes(network, "a", "c", {
      at: new Date("2026-10-25T12:00:00+07:00"),
      maxAlternatives: 1,
    })[0];
    expect(sunday?.legs[0]?.patternId).toBe(cideng.id);
    expect(sunday?.legs[0]?.patternLabel).toBe("Pasar Baru via Cideng");
    expect(sunday?.legs[0]?.stops.map((stop) => stop.name)).toEqual([
      "Lebak Bulus",
      "Roxy",
      "Pasar Baru",
    ]);
  });

  it("does not invent a weekday service for a Sunday-only line", () => {
    const monday = planRoutes(network, "a", "c", {
      at: new Date("2026-10-26T12:00:00+07:00"),
      maxAlternatives: 1,
    });
    expect(monday).toEqual([]);
  });
});
