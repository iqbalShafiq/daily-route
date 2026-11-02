import { describe, expect, it } from "vitest";

import { bestAccess, stopsWithinWalk } from "./access.js";
import { blocksJourney, matchDisruptions, removesService, routeIsClear } from "./disruption.js";
import type {
  Disruption,
  Itinerary,
  ItineraryLeg,
  Line,
  LineStop,
  Station,
  TransitNetwork,
} from "./index.js";

function station(id: string, name: string, latitude: number, longitude: number, systemId = "transjakarta"): Station {
  return {
    id,
    systemId,
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

function ride(lineId: string, stops: Station[]): ItineraryLeg {
  return {
    kind: "ride",
    mode: "bus",
    lineId,
    lineName: lineId,
    lineCode: lineId,
    serviceClass: "brt",
    fromStationId: stops[0]?.id ?? null,
    toStationId: stops.at(-1)?.id ?? null,
    fromName: stops[0]?.name ?? "",
    toName: stops.at(-1)?.name ?? "",
    durationMinutes: 10,
    distanceKm: 5,
    stops: stops.map((entry, position) => ({
      stationId: entry.id,
      name: entry.name,
      latitude: entry.latitude,
      longitude: entry.longitude,
      position,
    })),
    coordinates: [],
    walkReason: null,
    nextLineName: null,
    waitMinutes: 2,
    changedFrom: null,
    changedAt: null,
    direction: null,
    fromPlatform: null,
    toPlatform: null,
  };
}

const a = station("a", "Asal", -6.2, 106.8);
const b = station("b", "Antara", -6.21, 106.81);
const c = station("c", "Tujuan", -6.22, 106.82);
const d = station("d", "Tetangga", -6.204, 106.804);

function itinerary(): Itinerary {
  return {
    originStationId: "a",
    destinationStationId: "c",
    durationMinutes: 30,
    transferCount: 0,
    legs: [ride("line-1", [a, b, c])],
    coordinates: [],
    warnings: [],
    distanceKm: 9,
    walkingKm: 0,
    cost: 30,
  };
}

function closure(overrides: Partial<Disruption>): Disruption {
  return {
    id: "notice-1",
    source: "x:PT_Transjakarta",
    sourceType: "social",
    systemId: "transjakarta",
    lineId: null,
    stationId: null,
    stationGroupId: null,
    severity: "warning",
    status: "active",
    kind: "closure",
    title: "Halte ditutup",
    body: "",
    url: null,
    confidence: 0.9,
    publishedAt: new Date().toISOString(),
    observedAt: new Date().toISOString(),
    resolvedAt: null,
    affectedStationIds: [],
    affectedLineIds: [],
    ...overrides,
  };
}

describe("journeyRole", () => {
  it("tells a stop the rider passes from one they use", () => {
    const trip = itinerary();
    const [passing] = matchDisruptions(trip, [
      closure({ stationId: "b", scope: "stop", affectedStationIds: ["b"] }),
    ]);
    expect(passing?.role).toBe("pass-through");

    const [boarding] = matchDisruptions(trip, [
      closure({ stationId: "a", scope: "stop", affectedStationIds: ["a"] }),
    ]);
    expect(boarding?.role).toBe("origin");

    const [alighting] = matchDisruptions(trip, [
      closure({ stationId: "c", scope: "stop", affectedStationIds: ["c"] }),
    ]);
    expect(alighting?.role).toBe("destination");
  });
});

describe("blocksJourney", () => {
  it("does not block a journey that only passes the closed stop", () => {
    const [match] = matchDisruptions(itinerary(), [
      closure({ stationId: "b", scope: "stop", affectedStationIds: ["b"] }),
    ]);
    expect(match).toBeDefined();
    expect(match ? blocksJourney(match) : null).toBe(false);
  });

  it("blocks a journey that boards or alights at the closed stop", () => {
    const [match] = matchDisruptions(itinerary(), [
      closure({ stationId: "c", scope: "stop", affectedStationIds: ["c"] }),
    ]);
    expect(match ? blocksJourney(match) : null).toBe(true);
  });

  it("blocks every journey on a corridor whose service is withdrawn", () => {
    const [match] = matchDisruptions(itinerary(), [
      closure({ lineId: "line-1", scope: "line", affectedLineIds: ["line-1"] }),
    ]);
    expect(match?.role).toBe("line");
    expect(match ? blocksJourney(match) : null).toBe(true);
  });

  it("does not block a journey travelling the other direction", () => {
    const trip = itinerary();
    const leg = trip.legs.find((entry) => entry.kind === "ride");
    if (leg) leg.direction = "forward";
    const [match] = matchDisruptions(trip, [
      closure({
        stationId: "c",
        scope: "stop",
        affectedStationIds: ["c"],
        direction: "backward",
      }),
    ]);
    expect(match?.noticeDirection).toBe("backward");
    expect(match ? blocksJourney(match) : null).toBe(false);
  });

  it("ignores a platform-scoped notice for the other direction", () => {
    const trip = itinerary();
    const leg = trip.legs.find((entry) => entry.kind === "ride");
    if (leg) leg.direction = "forward";
    const matches = matchDisruptions(trip, [
      closure({
        stationId: "c",
        scope: "stop",
        affectedStationIds: ["c"],
        platforms: [{ lineId: "line-1", direction: "backward" }],
      }),
    ]);
    expect(matches).toEqual([]);
  });

  it("matches a platform only at the stop the notice names", () => {
    const trip = itinerary();
    const leg = trip.legs.find((entry) => entry.kind === "ride");
    if (leg) leg.direction = "forward";
    const atStop = matchDisruptions(trip, [
      closure({
        stationId: "b",
        scope: "stop",
        affectedStationIds: ["b"],
        platforms: [{ lineId: "line-1", direction: "forward", stationId: "b" }],
      }),
    ]);
    expect(atStop).toHaveLength(1);

    const elsewhere = matchDisruptions(trip, [
      closure({
        stationId: "b",
        scope: "stop",
        affectedStationIds: ["b"],
        platforms: [{ lineId: "line-1", direction: "forward", stationId: "z" }],
      }),
    ]);
    expect(elsewhere).toEqual([]);
  });

  it("blocks a stop that a diversion no longer calls at", () => {
    const [match] = matchDisruptions(itinerary(), [
      closure({ stationId: "c", scope: "stop", kind: "diversion", affectedStationIds: ["c"] }),
    ]);
    expect(match ? blocksJourney(match) : null).toBe(true);
  });

  it("does not block anything for a delay", () => {
    const notice = closure({ stationId: "c", scope: "stop", kind: "delay", affectedStationIds: ["c"] });
    expect(removesService(notice)).toBe(false);
    const [match] = matchDisruptions(itinerary(), [notice]);
    expect(match ? blocksJourney(match) : null).toBe(false);
  });
});

describe("stopsWithinWalk", () => {
  const lines: Line[] = [
    {
      id: "line-1",
      systemId: "transjakarta",
      code: "1",
      name: "Koridor 1",
      mode: "bus",
      serviceClass: "brt",
      operator: "Transjakarta",
      status: "operating",
      color: null,
      lengthKm: null,
      description: "",
      aliases: [],
    },
  ];
  const lineStops: LineStop[] = [
    { lineId: "line-1", stationId: "a", direction: "forward", position: 0, distanceFromOriginKm: 0 },
    { lineId: "line-1", stationId: "d", direction: "forward", position: 1, distanceFromOriginKm: 1 },
  ];
  const network: TransitNetwork = {
    lines,
    stations: [a, d, station("e", "Tutup", -6.2001, 106.8001)],
    lineStops,
    stationGroups: [],
  };

  it("returns served stops when the closed stop is not closed yet", () => {
    const found = stopsWithinWalk(network, { latitude: -6.2, longitude: 106.8 }, { maxKm: 1 });
    expect(found.map((entry) => entry.station.id).sort()).toEqual(["a", "d"]);
  });

  it("leaves out the stop the rider cannot use", () => {
    const found = stopsWithinWalk(
      network,
      { latitude: -6.2, longitude: 106.8 },
      { maxKm: 1, exclude: new Set(["a"]) },
    );
    expect(found.map((entry) => entry.station.id)).toEqual(["d"]);
  });

  it("does not offer a stop nobody serves", () => {
    const found = stopsWithinWalk(network, { latitude: -6.2001, longitude: 106.8001 }, { maxKm: 1 });
    expect(found.some((entry) => entry.station.id === "e")).toBe(false);
  });

  it("chooses the stop whose journey plus walk is quickest", () => {
    const found = stopsWithinWalk(network, { latitude: -6.2, longitude: 106.8 }, { maxKm: 1 });
    const best = bestAccess(found, (candidate) => (candidate.id === "d" ? 5 : 60));
    expect(best?.access.station.id).toBe("d");
  });
});

describe("routeIsClear", () => {
  it("accepts a route that only passes a closed stop", () => {
    expect(
      routeIsClear(itinerary(), [
        closure({ stationId: "b", scope: "stop", affectedStationIds: ["b"] }),
      ]),
    ).toBe(true);
  });

  it("rejects a route that boards or alights at a closed stop", () => {
    expect(
      routeIsClear(itinerary(), [
        closure({ stationId: "c", scope: "stop", affectedStationIds: ["c"] }),
      ]),
    ).toBe(false);
  });

  it("rejects a route on a closed line", () => {
    expect(
      routeIsClear(itinerary(), [
        closure({ lineId: "line-1", scope: "line", affectedLineIds: ["line-1"] }),
      ]),
    ).toBe(false);
  });
});
