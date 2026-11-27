import { describe, expect, it } from "vitest";

import type { DisruptionSummary, Itinerary, ItineraryLeg } from "../../lib/api.js";

import {
  estimateArrivalIso,
  formatJakartaClock,
  formatJakartaSpan,
  sortItineraries,
} from "./route-sort.js";

function leg(overrides: Partial<ItineraryLeg> = {}): ItineraryLeg {
  return {
    kind: "ride",
    mode: "bus",
    lineId: "transjakarta:1",
    lineName: "Koridor 1",
    lineCode: "1",
    serviceClass: "brt",
    fromStationId: "a",
    toStationId: "b",
    fromName: "A",
    toName: "B",
    durationMinutes: 10,
    distanceKm: 2,
    stops: [
      { stationId: "a", name: "A", latitude: -6.2, longitude: 106.8 },
      { stationId: "b", name: "B", latitude: -6.21, longitude: 106.81 },
    ],
    walkReason: null,
    nextLineName: null,
    waitMinutes: 0,
    changedFrom: null,
    changedAt: null,
    geometry: [],
    ...overrides,
  };
}

function itinerary(overrides: Partial<Itinerary> = {}): Itinerary {
  return {
    durationMinutes: 20,
    transferCount: 0,
    distanceKm: 4,
    walkingKm: 0.2,
    cost: 20,
    lines: ["1"],
    fare: {
      available: true,
      totalIdr: 3500,
      label: "Rp3.500",
      breakdown: [],
      alternatives: [],
      notes: [],
    },
    legs: [leg()],
    geometry: [],
    ...overrides,
  };
}

function makeRoutes(): Itinerary[] {
  return [
    itinerary({
      durationMinutes: 30,
      transferCount: 1,
      walkingKm: 0.4,
      fare: {
        available: true,
        totalIdr: 7000,
        label: "Rp7.000",
        breakdown: [],
        alternatives: [],
        notes: [],
      },
    }),
    itinerary({
      durationMinutes: 20,
      transferCount: 2,
      walkingKm: 0.1,
      fare: {
        available: true,
        totalIdr: 5000,
        label: "Rp5.000",
        breakdown: [],
        alternatives: [],
        notes: [],
      },
    }),
    itinerary({
      durationMinutes: 25,
      transferCount: 0,
      walkingKm: 0.9,
      fare: {
        available: false,
        totalIdr: null,
        label: null,
        breakdown: [],
        alternatives: [],
        notes: [],
      },
    }),
  ];
}

function notice(overrides: Partial<DisruptionSummary> = {}): DisruptionSummary {
  return {
    id: "notice-1",
    title: "A stop is closed",
    body: "The stop is closed.",
    severity: "severe",
    kind: "closure",
    status: "verified",
    systemId: "transjakarta",
    source: "test",
    sourceType: "operator",
    url: null,
    lineId: null,
    stationId: "b",
    affectedStationIds: ["b"],
    affectedLineIds: [],
    publishedAt: "2026-11-27T00:00:00.000Z",
    observedAt: "2026-11-27T00:00:00.000Z",
    endsAt: null,
    eventKey: null,
    lastSeenAt: null,
    validityWindows: [],
    activeNow: true,
    impact: "station",
    demonstration: false,
    blocksService: true,
    viaToll: false,
    scope: "stop",
    stations: [
      { id: "b", name: "B", systemId: "transjakarta", latitude: -6.21, longitude: 106.81 },
    ],
    lines: [],
    lineCodes: [],
    roads: [],
    latitude: -6.21,
    longitude: 106.81,
    stationName: "B",
    ...overrides,
  };
}

describe("sortItineraries", () => {
  it("orders by duration for the fastest mode", () => {
    expect(sortItineraries(makeRoutes(), "fastest", [])).toEqual([1, 2, 0]);
  });

  it("orders by the published fare and puts an unpublished fare last", () => {
    expect(sortItineraries(makeRoutes(), "cheapest", [])).toEqual([1, 0, 2]);
  });

  it("orders by transfers, then by walking, for the fewest-transfers mode", () => {
    expect(sortItineraries(makeRoutes(), "fewest-transfers", [])).toEqual([2, 0, 1]);
  });

  it("keeps every open journey ahead of a blocked one", () => {
    const routes = makeRoutes();
    const third = routes[2];
    if (!third) throw new Error("fixture is missing");
    third.legs = [
      leg({
        stops: [
          { stationId: "c", name: "C", latitude: -6.3, longitude: 106.9 },
          { stationId: "d", name: "D", latitude: -6.31, longitude: 106.91 },
        ],
      }),
    ];
    const order = sortItineraries(routes, "fastest", [
      notice({ stationId: "d", affectedStationIds: ["d"] }),
    ]);
    expect(order).toEqual([1, 0, 2]);
  });

  it("puts a blocked fastest route behind every open route", () => {
    const routes = makeRoutes();
    const fastest = routes[1];
    if (!fastest) throw new Error("fixture is missing");
    fastest.legs = [
      leg({
        stops: [
          { stationId: "x", name: "X", latitude: -6.4, longitude: 107 },
          { stationId: "y", name: "Y", latitude: -6.41, longitude: 107.01 },
        ],
      }),
    ];
    const order = sortItineraries(routes, "fastest", [
      notice({ stationId: "y", affectedStationIds: ["y"] }),
    ]);
    expect(order).toEqual([2, 0, 1]);
  });
});

describe("Jakarta time", () => {
  it("reads an instant on the Jakarta clock", () => {
    expect(formatJakartaClock("2026-11-27T00:10:00.000Z")).toBe("07.10");
  });

  it("writes the span from the departure to the arrival", () => {
    expect(formatJakartaSpan("2026-11-27T00:10:00.000Z", 38)).toBe("07.10 - 07.48");
  });

  it("moves an instant by the duration", () => {
    expect(estimateArrivalIso("2026-11-27T00:10:00.000Z", 38)).toBe(
      "2026-11-27T00:48:00.000Z",
    );
  });

  it("falls back to the current day when the plan has no start", () => {
    const arrival = estimateArrivalIso(undefined, 0);
    expect(Number.isNaN(Date.parse(arrival))).toBe(false);
  });
});
