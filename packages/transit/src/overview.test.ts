import { describe, expect, it } from "vitest";

import type { TransitNetwork } from "./graph.js";
import { decimateFlat, networkOverview, networkPlaces } from "./overview.js";
import type { Station } from "./types.js";
import type { Line } from "./types.js";

function line(partial: Pick<Line, "id" | "serviceClass" | "status">): Line {
  return {
    id: partial.id,
    systemId: "transjakarta",
    code: "1",
    name: "Koridor 1",
    mode: "bus",
    serviceClass: partial.serviceClass,
    operator: "Transjakarta",
    status: partial.status,
    color: null,
    lengthKm: 1,
    description: "",
    aliases: [],
  };
}

describe("decimateFlat", () => {
  it("keeps both ends and the requested count", () => {
    const flat = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4];
    const thinned = decimateFlat(flat, 3);
    expect(thinned).toEqual([0, 0, 2, 2, 4, 4]);
  });
});

describe("networkOverview", () => {
  it("keeps the longer direction and marks a feeder as local", () => {
    const network: TransitNetwork = {
      lines: [
        line({ id: "transjakarta:1", serviceClass: "brt", status: "operating" }),
        line({ id: "transjakarta:jak-01", serviceClass: "mikrotrans", status: "operating" }),
        line({ id: "transjakarta:soon", serviceClass: "brt", status: "planned" }),
      ],
      stations: [],
      lineStops: [],
      stationGroups: [],
      geometries: [
        { lineId: "transjakarta:1", direction: "forward", coordinates: [106, -6, 106.1, -6.1], stopOffsets: [], lengthKm: 2 },
        { lineId: "transjakarta:1", direction: "backward", coordinates: [106, -6, 106.2, -6.2, 106.3, -6.3], stopOffsets: [], lengthKm: 4 },
        { lineId: "transjakarta:jak-01", direction: "forward", coordinates: [106, -6, 106.01, -6.01], stopOffsets: [], lengthKm: 1 },
        { lineId: "transjakarta:soon", direction: "forward", coordinates: [106, -6, 106.01, -6.01], stopOffsets: [], lengthKm: 1 },
      ],
    };
    const overview = networkOverview(network);
    expect(overview.map((item) => [item.id, item.tier, item.coordinates.length, item.direction])).toEqual([
      ["transjakarta:1", "primary", 4, "forward"],
      ["transjakarta:1", "primary", 6, "backward"],
      ["transjakarta:jak-01", "local", 4, "forward"],
    ]);
  });

  it("keeps both directions of the same road for the close-zoom offset", () => {
    const network: TransitNetwork = {
      lines: [line({ id: "transjakarta:1", serviceClass: "brt", status: "operating" })],
      stations: [],
      lineStops: [],
      stationGroups: [],
      geometries: [
        { lineId: "transjakarta:1", direction: "forward", coordinates: [106, -6, 106.01, -6.01, 106.02, -6], stopOffsets: [], lengthKm: 2 },
        { lineId: "transjakarta:1", direction: "backward", coordinates: [106.02, -6, 106.01, -6.01, 106, -6], stopOffsets: [], lengthKm: 2 },
      ],
    };
    const overview = networkOverview(network);
    expect(overview).toHaveLength(2);
    expect(overview.map((item) => item.direction)).toEqual(["forward", "backward"]);
    expect(overview.every((item) => item.oneWay === false)).toBe(true);
    expect(overview[0]?.coordinates).toEqual([106, -6, 106.01, -6.01, 106.02, -6]);
  });
});

describe("one-way lines", () => {
  it("marks a line with a single geometry as one-way", () => {
    const network: TransitNetwork = {
      lines: [line({ id: "transjakarta:1", serviceClass: "brt", status: "operating" })],
      stations: [],
      lineStops: [],
      stationGroups: [],
      geometries: [
        { lineId: "transjakarta:1", direction: "forward", coordinates: [106, -6, 106.01, -6.01], stopOffsets: [], lengthKm: 1 },
      ],
    };
    expect(networkOverview(network)[0]?.oneWay).toBe(true);
  });
});

function station(id: string): Station {
  return {
    id,
    systemId: "transjakarta",
    name: id,
    code: null,
    latitude: -6.2,
    longitude: 106.8,
    stationType: "stop",
    zone: null,
    isInterchange: false,
    description: "",
    area: null,
    aliases: [],
  };
}

describe("networkPlaces", () => {
  it("keeps a stop of an operating line and drops a planned or unused one", () => {
    const network: TransitNetwork = {
      lines: [
        line({ id: "transjakarta:1", serviceClass: "brt", status: "operating" }),
        line({ id: "transjakarta:soon", serviceClass: "brt", status: "planned" }),
      ],
      stations: [station("transjakarta:blok-m"), station("transjakarta:future"), station("transjakarta:orphan")],
      lineStops: [
        {
          lineId: "transjakarta:1",
          stationId: "transjakarta:blok-m",
          direction: "forward",
          position: 0,
          distanceFromOriginKm: 0,
        },
        {
          lineId: "transjakarta:soon",
          stationId: "transjakarta:future",
          direction: "forward",
          position: 0,
          distanceFromOriginKm: 0,
        },
      ],
      stationGroups: [],
      geometries: [],
    };
    expect(networkPlaces(network).map((place) => place.id)).toEqual(["transjakarta:blok-m"]);
  });
});
