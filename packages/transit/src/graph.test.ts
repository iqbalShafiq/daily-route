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

  it("does not invent the return of a line that only publishes one direction", () => {
    expect(planRoutes(network, "c", "a")).toEqual([]);
  });

  it("returns a zero-length itinerary for a station to itself", () => {
    const itineraries = planRoutes(network, "a", "a");
    expect(itineraries).toHaveLength(1);
    expect(itineraries[0]?.legs).toEqual([]);
  });


  it("keeps a line state when a cheaper line cannot continue", () => {
    // A cheaper line reaches the middle station first, but it ends there.
    // Collapsing the search state by station would prune the through line
    // and force a needless change of vehicle.
    const a: Station = { id: "s-a", systemId: "transjakarta", name: "A", code: null, latitude: -6.2, longitude: 106.8, stationType: "stop", zone: null, isInterchange: false, description: "", area: null, aliases: [] };
    const b: Station = { ...a, id: "s-b", name: "B", longitude: 106.81 };
    const c: Station = { ...a, id: "s-c", name: "C", longitude: 106.82 };
    const through: Line = { ...line, id: "bus:through", code: "T", name: "Through", mode: "bus", systemId: "transjakarta", serviceClass: "brt" };
    const short: Line = { ...line, id: "bus:short", code: "S", name: "Short", mode: "bus", systemId: "transjakarta", serviceClass: "brt" };
    const result = planRoutes(
      {
        lines: [through, short],
        stations: [a, b, c],
        lineStops: [
          { lineId: through.id, stationId: a.id, direction: "forward", position: 1, distanceFromOriginKm: 0 },
          { lineId: through.id, stationId: b.id, direction: "forward", position: 2, distanceFromOriginKm: 1.1 },
          { lineId: through.id, stationId: c.id, direction: "forward", position: 3, distanceFromOriginKm: 2.2 },
          { lineId: short.id, stationId: a.id, direction: "forward", position: 1, distanceFromOriginKm: 0 },
          { lineId: short.id, stationId: b.id, direction: "forward", position: 2, distanceFromOriginKm: 0.1 },
        ],
        stationGroups: [],
      },
      a.id,
      c.id,
      { maxAlternatives: 1 },
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.legs).toHaveLength(1);
    expect(result[0]?.legs[0]?.lineId).toBe(through.id);
    expect(result[0]?.transferCount).toBe(0);
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

  it("ignores a cumulative distance that jumps away from the two stops", () => {
    const near = stations[0];
    const neighbour = stations[1];
    if (!near || !neighbour) throw new Error("fixture");
    const beside: Station = {
      ...neighbour,
      id: "beside",
      name: "Sebelah",
      latitude: near.latitude + 0.003,
      longitude: near.longitude,
    };
    const broken: LineStop[] = [
      { lineId: line.id, stationId: near.id, direction: "forward", position: 1, distanceFromOriginKm: 0 },
      { lineId: line.id, stationId: near.id, direction: "forward", position: 2, distanceFromOriginKm: 36 },
      { lineId: line.id, stationId: beside.id, direction: "forward", position: 3, distanceFromOriginKm: 36.4 },
    ];

    const itineraries = planRoutes(
      { lines: [line], stations: [near, beside], lineStops: broken, stationGroups: [] },
      near.id,
      beside.id,
    );

    expect(itineraries[0]?.distanceKm).toBeLessThan(2);
  });

  it("lists the fastest journey first", () => {
    const bus: Line = { ...line, id: "tj:bus", mode: "bus", serviceClass: "brt", systemId: "transjakarta" };
    const rail: Line = { ...line, id: "krl:rail", mode: "rail", serviceClass: "commuter-rail", systemId: "krl" };
    const from = stations[0];
    const to = stations[2];
    if (!from || !to) throw new Error("fixture");
    const busStops: LineStop[] = [
      { lineId: bus.id, stationId: from.id, direction: "forward", position: 1, distanceFromOriginKm: 0 },
      { lineId: bus.id, stationId: "b", direction: "forward", position: 2, distanceFromOriginKm: 1 },
      { lineId: bus.id, stationId: "mid", direction: "forward", position: 3, distanceFromOriginKm: 2 },
      { lineId: bus.id, stationId: to.id, direction: "forward", position: 4, distanceFromOriginKm: 3 },
    ];
    const railStops: LineStop[] = [
      { lineId: rail.id, stationId: from.id, direction: "forward", position: 1, distanceFromOriginKm: 0 },
      { lineId: rail.id, stationId: to.id, direction: "forward", position: 2, distanceFromOriginKm: 6 },
    ];
    const template = stations[1];
    if (!template) throw new Error("fixture");
    const mid: Station = {
      ...template,
      id: "mid",
      name: "Tengah",
      latitude: -6.24,
      longitude: 106.81,
    };

    const itineraries = planRoutes(
      {
        lines: [bus, rail],
        stations: [...stations, mid],
        lineStops: [...busStops, ...railStops],
        stationGroups: [],
      },
      from.id,
      to.id,
      { maxAlternatives: 2 },
    );

    expect(itineraries.length).toBeGreaterThan(1);
    expect(itineraries[0]?.legs[0]?.lineId).toBe(rail.id);
    const durations = itineraries.map((item) => item.durationMinutes);
    expect(durations[0]).toBeLessThanOrEqual(durations[1] ?? durations[0] ?? 0);
  });
});
