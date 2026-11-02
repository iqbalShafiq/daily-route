import { describe, expect, it } from "vitest";

import { matchDisruptions, removesService } from "./disruption.js";
import {
  DEMO_DISRUPTION_ID,
  demoDisruptions,
  isDemonstration,
  mergeDemoDisruptions,
} from "./demo-watch.js";
import type { Disruption, Itinerary } from "./types.js";

function itinerary(stationIds: string[]): Itinerary {
  return {
    originStationId: stationIds[0] ?? "a",
    destinationStationId: stationIds[stationIds.length - 1] ?? "b",
    durationMinutes: 10,
    transferCount: 0,
    legs: [
      {
        kind: "ride",
        mode: "bus",
        lineId: "transjakarta:9",
        lineName: "Koridor 9",
        lineCode: "9",
        serviceClass: "brt",
        fromStationId: stationIds[0] ?? null,
        toStationId: stationIds[stationIds.length - 1] ?? null,
        fromName: "Asal",
        toName: "Tujuan",
        durationMinutes: 10,
        distanceKm: 2,
        stops: stationIds.map((stationId, position) => ({
          stationId,
          name: stationId,
          latitude: 0,
          longitude: 0,
          position,
        })),
        coordinates: [],
        walkReason: null,
        nextLineName: null,
        waitMinutes: 5,
        changedFrom: null,
        changedAt: null,
        direction: null,
        fromPlatform: null,
        toPlatform: null,
      },
    ],
    coordinates: [],
    warnings: [],
    distanceKm: 2,
    walkingKm: 0,
    cost: 10,
  };
}

describe("demo watch", () => {
  it("labels the Denpasar barrier as a demonstration and a closure", () => {
    const [demo] = demoDisruptions(new Date("2026-10-22T03:00:00.000Z"));
    expect(demo?.id).toBe(DEMO_DISRUPTION_ID);
    expect(demo && isDemonstration(demo)).toBe(true);
    expect(demo?.stationId).toBe("transjakarta:denpasar");
    expect(demo && removesService(demo)).toBe(true);
    expect(demo?.url).toBeNull();
    expect(demo?.body).toMatch(/bukan pengumuman operator/);
  });

  it("merges the scenario once", () => {
    const existing: Disruption[] = [];
    const once = mergeDemoDisruptions(existing, new Date("2026-10-22T03:00:00.000Z"));
    const twice = mergeDemoDisruptions(once, new Date("2026-10-22T04:00:00.000Z"));
    expect(twice.filter((row) => row.id === DEMO_DISRUPTION_ID)).toHaveLength(1);
  });

  it("attaches the closure only to a journey that stops at Denpasar", () => {
    const [demo] = demoDisruptions();
    expect(demo).toBeDefined();
    if (!demo) return;

    const hit = matchDisruptions(itinerary(["transjakarta:kali-grogol", "transjakarta:denpasar"]), [demo]);
    const miss = matchDisruptions(itinerary(["transjakarta:kali-grogol", "transjakarta:grogoL"]), [demo]);

    expect(hit).toHaveLength(1);
    expect(hit[0]?.stationIds).toEqual(["transjakarta:denpasar"]);
    expect(miss).toHaveLength(0);
  });
});
