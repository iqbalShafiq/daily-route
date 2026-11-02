import { describe, expect, it } from "vitest";

import type { Station } from "@daily-route/transit";

import {
  groupRoads,
  metersBetween,
  nameMatches,
  roadKeyword,
  RoadLookup,
  stopsOnRoad,
  type RoadCandidate,
} from "./roads.js";

/** A straight street of `points` along a line of longitude. */
function street(
  name: string,
  id: number,
  latitude: number,
  longitude: number,
  points = 3,
): RoadCandidate {
  const geometry: [number, number][] = [];
  for (let index = 0; index < points; index += 1) {
    geometry.push([longitude + index * 0.001, latitude]);
  }
  return {
    id: `road:${id}`,
    name,
    latitude,
    longitude: longitude + 0.001,
    lengthKm: 0.3,
    osmIds: [id],
    segments: [{ osmId: id, geometry }],
  };
}

function station(id: string, name: string, latitude: number, longitude: number): Station {
  return {
    id,
    systemId: "transjakarta",
    name,
    code: null,
    latitude,
    longitude,
    stationType: "stop",
    zone: null,
    isInterchange: false,
    description: "",
    area: null,
    aliases: [],
  };
}

describe("roadKeyword", () => {
  it("drops the prefix people write instead of the name", () => {
    expect(roadKeyword("Jl. Pintu Air Raya")).toBe("Pintu Air Raya");
    expect(roadKeyword("Jalan Damai Raya")).toBe("Damai Raya");
    expect(roadKeyword("Gg. H. Syarip")).toBe("H. Syarip");
  });

  it("keeps a name that has no prefix", () => {
    expect(roadKeyword("Damai Raya")).toBe("Damai Raya");
  });
});

describe("nameMatches", () => {
  it("accepts the same street written with and without 'Jalan'", () => {
    expect(nameMatches("Jalan Damai Raya", "Damai Raya")).toBe(true);
  });

  it("rejects a near miss", () => {
    expect(nameMatches("Jalan Damai II", "Damai Raya")).toBe(false);
    expect(nameMatches("Jalan Salam Damai Raya", "Damai Raya")).toBe(false);
  });
});

describe("groupRoads", () => {
  it("joins the pieces of one street and keeps another district apart", () => {
    const ways = [
      {
        type: "way",
        id: 1,
        tags: { name: "Jalan Damai Raya" },
        geometry: [
          { lat: -6.25, lon: 106.75 },
          { lat: -6.251, lon: 106.751 },
        ],
      },
      {
        type: "way",
        id: 2,
        tags: { name: "Jalan Damai Raya" },
        geometry: [
          { lat: -6.2505, lon: 106.7505 },
          { lat: -6.252, lon: 106.752 },
        ],
      },
      {
        type: "way",
        id: 3,
        tags: { name: "Jalan Damai Raya" },
        geometry: [
          { lat: -6.31, lon: 106.9 },
          { lat: -6.311, lon: 106.901 },
        ],
      },
    ];

    const groups = groupRoads(ways, 8);
    expect(groups).toHaveLength(2);
    const sizes = groups.map((group) => group.osmIds.length).sort();
    expect(sizes).toEqual([1, 2]);
  });

  it("ignores a way with no name", () => {
    const groups = groupRoads([
      { type: "way", id: 9, tags: {}, geometry: [{ lat: 0, lon: 0 }, { lat: 0, lon: 1 }] },
    ]);
    expect(groups).toHaveLength(0);
  });
});

describe("stopsOnRoad", () => {
  const road = street("Jalan Damai Raya", 1, -6.25, 106.75);
  const lines = new Map([
    ["b", ["4H"]],
    ["a", ["1"]],
  ]);

  it("keeps the stops that stand on the street", () => {
    const stops = stopsOnRoad(
      road,
      [
        station("a", "Halte Satu", -6.2499, 106.7505),
        station("b", "Halte Dua", -6.2505, 106.7521),
        station("c", "Halte Jauh", -6.3, 106.75),
      ],
      lines,
    );
    expect(stops.map((stop) => stop.stationId).sort()).toEqual(["a", "b"]);
    expect(stops[0]?.meters).toBeLessThanOrEqual(60);
    expect(stops.find((stop) => stop.stationId === "b")?.lineCodes).toEqual(["4H"]);
  });

  it("finds nothing when the street is a kilometre away", () => {
    const stops = stopsOnRoad(road, [station("c", "Halte Jauh", -6.26, 106.76)], lines);
    expect(stops).toHaveLength(0);
  });
});

describe("RoadLookup", () => {
  it("asks once for the same street and remembers the answer", async () => {
    let calls = 0;
    const lookup = new RoadLookup(
      {
        nominatim: async (name) => {
          calls += 1;
          return [
            {
              type: "way",
              id: 42,
              tags: { name: "Jalan Damai Raya" },
              geometry: [
                { lat: -6.25, lon: 106.75 },
                { lat: -6.251, lon: 106.751 },
              ],
            },
          ].filter(() => name.length > 0);
        },
        overpass: async () => [],
      },
      60_000,
    );

    const first = await lookup.search("Jl. Damai Raya");
    const second = await lookup.search("Jl. Damai Raya");
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(calls).toBe(1);
    expect(lookup.byId(first[0]?.id ?? "")?.name).toBe("Jalan Damai Raya");
  });

  it("falls back to the name pattern when the address service has no match", async () => {
    const lookup = new RoadLookup(
      {
        nominatim: async () => [],
        overpass: async () => [
          {
            type: "way",
            id: 7,
            tags: { name: "Jalan Pintu Air Raya" },
            geometry: [
              { lat: -6.16, lon: 106.83 },
              { lat: -6.161, lon: 106.831 },
            ],
          },
        ],
      },
      60_000,
    );
    const roads = await lookup.search("Jl. Pintu Air Raya");
    expect(roads.map((road) => road.name)).toEqual(["Jalan Pintu Air Raya"]);
  });

  it("returns nothing for a name no provider knows", async () => {
    const lookup = new RoadLookup({ nominatim: async () => [], overpass: async () => [] });
    expect(await lookup.search("Jl. Tidak Ada")).toEqual([]);
  });
});

describe("metersBetween", () => {
  it("measures a degree of latitude as about 110 km", () => {
    const distance = metersBetween(
      { latitude: -6.2, longitude: 106.8 },
      { latitude: -7.2, longitude: 106.8 },
    );
    expect(distance).toBeGreaterThan(109_000);
    expect(distance).toBeLessThan(112_000);
  });
});
