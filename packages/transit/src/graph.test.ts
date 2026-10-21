import { describe, expect, it } from "vitest";

import { planRoutes } from "./graph.js";
import type { Line, LineStop, Station, StationGroup } from "./types.js";

const line: Line = {
  id: "metro:ns",
  systemId: "mrt-jakarta",
  code: "NS",
  name: "North–South Line",
  mode: "metro",
  serviceClass: "rapid-transit",
  operator: "PT MRT Jakarta",
  status: "operating",
  color: null,
  lengthKm: 20,
  description: "",
  aliases: [],
};

const stations: Station[] = [
  { id: "a", systemId: "mrt-jakarta", name: "Lebak Bulus", code: "NS01", latitude: -6.29, longitude: 106.798, stationType: "station", zone: null, isInterchange: false, description: "", area: null, aliases: [] },
  { id: "b", systemId: "mrt-jakarta", name: "Bundaran HI", code: "NS08", latitude: -6.19447, longitude: 106.82297, stationType: "station", zone: null, isInterchange: true, description: "", area: null, aliases: [] },
  { id: "c", systemId: "mrt-jakarta", name: "Bundaran Senayan", code: "NS10", latitude: -6.22503, longitude: 106.80061, stationType: "station", zone: null, isInterchange: true, description: "", area: null, aliases: [] },
];

const lineStops: LineStop[] = [
  { lineId: line.id, stationId: "a", direction: "forward", position: 1, distanceFromOriginKm: 0 },
  { lineId: line.id, stationId: "b", direction: "forward", position: 2, distanceFromOriginKm: 9.8 },
  { lineId: line.id, stationId: "c", direction: "forward", position: 3, distanceFromOriginKm: 14.2 },
];

const network = { lines: [line], stations, lineStops, stationGroups: [] as StationGroup[] };

describe("planRoutes", () => {
  it("finds a direct ride", () => {
    const itineraries = planRoutes(network, "a", "c");
    expect(itineraries).toHaveLength(1);
    const itinerary = itineraries[0];
    expect(itinerary?.legs).toHaveLength(1);
    expect(itinerary?.legs[0]?.kind).toBe("ride");
    expect(itinerary?.legs[0]?.lineId).toBe(line.id);
    expect(itinerary?.transferCount).toBe(0);
  });

  it("returns an empty result for unknown stations", () => {
    expect(planRoutes(network, "a", "missing")).toEqual([]);
  });

  it("returns a zero-length itinerary for a station to itself", () => {
    const itineraries = planRoutes(network, "a", "a");
    expect(itineraries).toHaveLength(1);
    expect(itineraries[0]?.legs).toEqual([]);
  });

  it("routes around a closed station", () => {
    const closed = planRoutes(network, "a", "c", { avoidStationIds: ["b"] });
    expect(closed).toEqual([]);
  });

  it("walks between stations of the same interchange", () => {
    const withGroup: Station[] = [
      ...stations,
      { id: "krl-hi", systemId: "krl", name: "Bundaran HI", code: null, latitude: -6.19447, longitude: 106.82297, stationType: "station", zone: null, isInterchange: true, description: "", area: null, aliases: [] },
    ];
    const krlLine: Line = { ...line, id: "krl:bs", code: "BS", name: "Bogor Line", mode: "rail", serviceClass: "commuter-rail" };
    const krlStops: LineStop[] = [
      { lineId: krlLine.id, stationId: "krl-hi", direction: "forward", position: 1, distanceFromOriginKm: 0 },
    ];
    const groups: StationGroup[] = [
      { id: "bundaran-hi", name: "Bundaran HI", latitude: -6.19447, longitude: 106.82297, stationIds: ["b", "krl-hi"] },
    ];

    const itineraries = planRoutes(
      { lines: [line, krlLine], stations: withGroup, lineStops: [...lineStops, ...krlStops], stationGroups: groups },
      "a",
      "krl-hi",
    );
    expect(itineraries).toHaveLength(1);
    const legs = itineraries[0]?.legs ?? [];
    expect(legs).toHaveLength(2);
    expect(legs[0]?.kind).toBe("ride");
    expect(legs[1]?.kind).toBe("walk");
    // The walk is the last step of the journey, so the rider changes
    // vehicles nowhere.
    expect(legs[1]?.walkReason).toBe("egress");
    expect(itineraries[0]?.transferCount).toBe(0);
  });

  it("counts a change of vehicle only between two vehicles", () => {
    // A station that only the train serves, so the journey has to change
    // vehicle in the middle.
    const withGroup: Station[] = [
      ...stations,
      { id: "krl-hi", systemId: "krl", name: "Bundaran HI", code: null, latitude: -6.19447, longitude: 106.82297, stationType: "station", zone: null, isInterchange: true, description: "", area: null, aliases: [] },
      { id: "d", systemId: "krl", name: "Cawang", code: null, latitude: -6.22503, longitude: 106.80061, stationType: "station", zone: null, isInterchange: false, description: "", area: null, aliases: [] },
    ];
    const krlLine: Line = { ...line, id: "krl:bs", code: "BS", name: "Bogor Line", mode: "rail", serviceClass: "commuter-rail" };
    const krlStops: LineStop[] = [
      { lineId: krlLine.id, stationId: "krl-hi", direction: "forward", position: 1, distanceFromOriginKm: 0 },
      { lineId: krlLine.id, stationId: "d", direction: "forward", position: 2, distanceFromOriginKm: 4 },
    ];
    const groups: StationGroup[] = [
      { id: "bundaran-hi", name: "Bundaran HI", latitude: -6.19447, longitude: 106.82297, stationIds: ["b", "krl-hi"] },
    ];

    const itineraries = planRoutes(
      { lines: [line, krlLine], stations: withGroup, lineStops: [...lineStops, ...krlStops], stationGroups: groups },
      "a",
      "d",
    );

    const legs = itineraries[0]?.legs ?? [];
    expect(legs.map((leg) => leg.kind)).toEqual(["ride", "walk", "ride"]);
    expect(legs[1]?.walkReason).toBe("transfer");
    expect(itineraries[0]?.transferCount).toBe(1);
  });
});
