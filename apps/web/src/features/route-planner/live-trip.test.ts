import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Itinerary, ItineraryLeg } from "../../lib/api.js";

import {
  COMPLETED_TRIPS_KEY,
  ROUTINES_KEY,
  distanceMeters,
  flattenTripStops,
  readCompletedTrips,
  readRoutines,
  recordCompletedTrip,
  saveRoutine,
  stopsRemainingBeforeAlight,
} from "./live-trip.js";

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
    stops: [],
    walkReason: null,
    nextLineName: null,
    waitMinutes: 0,
    changedFrom: null,
    changedAt: null,
    geometry: [],
    ...overrides,
  };
}

function ride(
  fromStationId: string,
  toStationId: string,
  names: string[],
  overrides: Partial<ItineraryLeg> = {},
): ItineraryLeg {
  return leg({
    fromStationId,
    toStationId,
    fromName: names[0] ?? "",
    toName: names[names.length - 1] ?? "",
    stops: names.map((name, index) => ({
      stationId: `${toStationId}-${index}`,
      name,
      latitude: -6.2 + index * 0.001,
      longitude: 106.8 + index * 0.001,
    })),
    ...overrides,
  });
}

function itinerary(legs: ItineraryLeg[]): Itinerary {
  return {
    durationMinutes: legs.reduce((total, entry) => total + entry.durationMinutes, 0),
    transferCount: 0,
    distanceKm: 8,
    walkingKm: 0.3,
    cost: 30,
    lines: ["1"],
    fare: {
      available: true,
      totalIdr: 3500,
      label: "Rp3.500",
      breakdown: [],
      alternatives: [],
      notes: [],
    },
    legs,
    geometry: [],
  };
}

function memoryStorage(): Storage {
  const rows = new Map<string, string>();
  return {
    get length() {
      return rows.size;
    },
    clear: () => rows.clear(),
    getItem: (key) => rows.get(key) ?? null,
    key: (index) => [...rows.keys()][index] ?? null,
    removeItem: (key) => {
      rows.delete(key);
    },
    setItem: (key, value) => {
      rows.set(key, value);
    },
  };
}

describe("flattenTripStops", () => {
  it("reads the real stops of every ride in order", () => {
    const route = itinerary([
      leg({
        kind: "walk",
        mode: "walk",
        lineId: null,
        lineName: null,
        lineCode: null,
        serviceClass: null,
        fromStationId: null,
        toStationId: "a-0",
        fromName: "Place",
        toName: "Blok M",
        walkReason: "access",
        stops: [
          { stationId: "a-0", name: "Blok M", latitude: -6.244, longitude: 106.8 },
        ],
      }),
      ride("a-0", "b-2", ["Blok M", "Senayan", "Istora"]),
    ]);
    const stops = flattenTripStops(route);
    expect(stops.map((stop) => stop.name)).toEqual(["Blok M", "Senayan", "Istora"]);
    expect(stops[0]?.isBoarding).toBe(true);
    expect(stops[0]?.isTransfer).toBe(false);
    expect(stops[2]?.isAlighting).toBe(true);
    expect(stops[0]?.mode).toBe("brt");
  });

  it("marks the boarding stop of a second vehicle as a transfer", () => {
    const route = itinerary([
      ride("a-0", "b-2", ["Blok M", "Senayan", "Istora"]),
      leg({
        kind: "walk",
        mode: "walk",
        lineId: null,
        lineName: null,
        lineCode: null,
        serviceClass: null,
        fromStationId: "b-2",
        toStationId: "c-0",
        fromName: "Istora",
        toName: "Bundaran HI",
        walkReason: "transfer",
        stops: [
          { stationId: "b-2", name: "Istora", latitude: -6.22, longitude: 106.8 },
          { stationId: "c-0", name: "Bundaran HI", latitude: -6.19, longitude: 106.82 },
        ],
      }),
      ride("c-0", "d-1", ["Bundaran HI", "Dukuh Atas"], {
        lineId: "mrt-jakarta:1",
        mode: "metro",
        serviceClass: "rapid-transit",
      }),
    ]);
    const stops = flattenTripStops(route);
    expect(stops.map((stop) => stop.name)).toEqual([
      "Blok M",
      "Senayan",
      "Istora",
      "Bundaran HI",
      "Dukuh Atas",
    ]);
    expect(stops[3]?.isTransfer).toBe(true);
    expect(stops[4]?.isAlighting).toBe(true);
    expect(stops[4]?.mode).toBe("mrt");
  });

  it("marks a change at the same platform when the stop is not repeated", () => {
    const samePlace = { stationId: "hub", name: "Hub", latitude: -6.2, longitude: 106.8 };
    const route = itinerary([
      leg({
        fromStationId: "a",
        toStationId: "hub",
        stops: [
          { stationId: "a", name: "A", latitude: -6.19, longitude: 106.79 },
          samePlace,
        ],
      }),
      leg({
        fromStationId: "hub",
        toStationId: "b",
        lineId: "mrt-jakarta:1",
        mode: "metro",
        serviceClass: "rapid-transit",
        stops: [
          samePlace,
          { stationId: "b", name: "B", latitude: -6.21, longitude: 106.81 },
        ],
      }),
    ]);
    const stops = flattenTripStops(route);
    expect(stops.map((stop) => stop.name)).toEqual(["A", "Hub", "B"]);
    expect(stops[1]?.isTransfer).toBe(true);
    expect(stops[2]?.isAlighting).toBe(true);
  });

  it("falls back to the walk stops of a journey on foot", () => {
    const route = itinerary([
      leg({
        kind: "walk",
        mode: "walk",
        lineId: null,
        serviceClass: null,
        stops: [
          { stationId: "from", name: "From", latitude: -6.2, longitude: 106.8 },
          { stationId: "to", name: "To", latitude: -6.21, longitude: 106.81 },
        ],
      }),
    ]);
    expect(flattenTripStops(route).map((stop) => stop.name)).toEqual(["From", "To"]);
  });
});

describe("stopsRemainingBeforeAlight", () => {
  const route = itinerary([ride("a-0", "d-3", ["Blok M", "Senayan", "Istora", "Dukuh Atas"])]);
  const stops = flattenTripStops(route);

  it("counts the stops to the alighting stop", () => {
    const progress = stopsRemainingBeforeAlight(stops, 1);
    expect(progress.remainingStops).toBe(2);
    expect(progress.alightStopName).toBe("Dukuh Atas");
    expect(progress.nextStopName).toBe("Istora");
    expect(progress.progress).toBeCloseTo(1 / 3, 5);
  });

  it("wakes the rider one stop before the alighting stop", () => {
    expect(stopsRemainingBeforeAlight(stops, 1).shouldWakeNow).toBe(false);
    expect(stopsRemainingBeforeAlight(stops, 2).shouldWakeNow).toBe(true);
    expect(stopsRemainingBeforeAlight(stops, 3).shouldWakeNow).toBe(false);
  });

  it("arms the alarm one stop before a change of vehicle", () => {
    const twoRides = itinerary([
      ride("a-0", "b-1", ["Blok M", "Senayan"]),
      ride("c-0", "d-1", ["Istora", "Dukuh Atas"], {
        lineId: "mrt-jakarta:1",
        mode: "metro",
        serviceClass: "rapid-transit",
      }),
    ]);
    const list = flattenTripStops(twoRides);
    const progress = stopsRemainingBeforeAlight(list, 1);
    expect(progress.nextIsTransfer).toBe(true);
    expect(progress.shouldWakeNow).toBe(true);
  });
});

describe("distanceMeters", () => {
  it("measures a short hop in metres", () => {
    const distance = distanceMeters(
      { latitude: -6.2, longitude: 106.8 },
      { latitude: -6.2009, longitude: 106.8 },
    );
    expect(distance).toBeGreaterThan(90);
    expect(distance).toBeLessThan(110);
  });
});

describe("local records", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
  });

  it("saves a completed journey newest first", () => {
    expect(readCompletedTrips()).toEqual([]);
    recordCompletedTrip({
      originName: "Bundaran HI",
      destinationName: "Kota",
      durationMinutes: 38,
      fareIdr: 13000,
      walkKm: 0.95,
      crowdRating: "lumayan",
      completedAt: "2026-11-27T08:00:00.000Z",
    });
    recordCompletedTrip({
      originName: "Lebak Bulus",
      destinationName: "Dukuh Atas",
      durationMinutes: 27,
      fareIdr: null,
      walkKm: 0.2,
      crowdRating: null,
      completedAt: "2026-11-27T09:00:00.000Z",
    });
    const trips = readCompletedTrips();
    expect(trips).toHaveLength(2);
    expect(trips[0]?.originName).toBe("Lebak Bulus");
    expect(localStorage.getItem(COMPLETED_TRIPS_KEY)).toContain("Bundaran HI");
  });

  it("ignores a stored row that is not a completed trip", () => {
    localStorage.setItem(COMPLETED_TRIPS_KEY, JSON.stringify([{ originName: "x" }]));
    expect(readCompletedTrips()).toEqual([]);
  });

  it("stores a routine once per pair", () => {
    saveRoutine({
      originName: "Rumah",
      destinationName: "Kantor",
      origin: null,
      destination: null,
      departureTime: "07:10",
    });
    saveRoutine({
      originName: "Rumah",
      destinationName: "Kantor",
      origin: null,
      destination: null,
      departureTime: "07:20",
    });
    const routines = readRoutines();
    expect(routines).toHaveLength(1);
    expect(routines[0]?.departureTime).toBe("07:20");
    expect(localStorage.getItem(ROUTINES_KEY)).toContain("Kantor");
  });
});
