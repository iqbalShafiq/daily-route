import { describe, expect, it } from "vitest";

import { frequencyLabel, isNightDeparture, lineRunsAt, serviceAt } from "./service.js";
import type { Line } from "./types.js";

function line(service?: unknown): Line {
  return {
    id: "test:9",
    systemId: "transjakarta",
    code: "9",
    name: "Pinang Ranti - Pluit",
    mode: "bus",
    serviceClass: "brt",
    operator: "Transjakarta",
    status: "operating",
    color: null,
    lengthKm: null,
    description: "",
    aliases: [],
    ...(service ? { metadata: { service } } : {}),
  };
}

const service = {
  source: "gtfs",
  timezone: "Asia/Jakarta",
  byDirection: {
    forward: [
      { days: [1, 2, 3, 4, 5], startMinute: 300, endMinute: 1320, headwayMinutes: 10 },
      { days: [1, 2, 3, 4, 5], startMinute: 420, endMinute: 540, headwayMinutes: 4 },
    ],
    backward: [
      { days: [1, 2, 3, 4, 5], startMinute: 300, endMinute: 1200, headwayMinutes: 20 },
    ],
  },
  reliableByDirection: { forward: true, backward: true },
  updatedAt: "2026-10-27T00:00:00.000Z",
};

describe("scheduled service", () => {
  it("uses the median headway of the windows covering the minute", () => {
    const state = serviceAt(line(service), "forward", new Date("2026-10-27T09:00:00+07:00"));
    expect(state?.active).toBe(true);
    expect(state?.reliable).toBe(true);
    expect(state?.headwayMinMinutes).toBe(4);
    expect(state?.headwayMaxMinutes).toBe(10);
    expect(state?.waitMinutes).toBe(5);
    expect(state?.label).toContain("Frequent");
  });

  it("closes a reliable line outside its window", () => {
    const at = new Date("2026-10-27T23:00:00+07:00");
    expect(serviceAt(line(service), "forward", at)?.active).toBe(false);
    expect(lineRunsAt(line(service), "forward", at)).toBe(false);
  });

  it("keeps an unreliable window as context but never removes the line", () => {
    const unreliable = {
      ...service,
      reliableByDirection: { forward: false, backward: false },
    };
    const at = new Date("2026-10-27T23:00:00+07:00");
    const state = serviceAt(line(unreliable), "forward", at);
    expect(state?.active).toBe(true);
    expect(state?.reliable).toBe(false);
    expect(state?.waitMinutes).toBeNull();
    expect(lineRunsAt(line(unreliable), "forward", at)).toBe(true);
  });

  it("trusts a short single window only for a one-way route", () => {
    const shortService = {
      source: "gtfs",
      timezone: "Asia/Jakarta",
      byDirection: {
        forward: [{ days: [1, 2, 3, 4, 5], startMinute: 300, endMinute: 360, headwayMinutes: 30 }],
      },
      reliableByDirection: { forward: false },
      updatedAt: "2026-10-27T00:00:00.000Z",
    };
    const oneWay = {
      ...line(),
      metadata: { service: shortService, oneWay: true },
    };
    const at = new Date("2026-10-27T15:18:00+07:00");
    const state = serviceAt(oneWay, "forward", at);
    expect(state?.reliable).toBe(true);
    expect(state?.active).toBe(false);
    expect(lineRunsAt(oneWay, "forward", at)).toBe(false);
    expect(serviceAt(oneWay, "forward", new Date("2026-10-27T05:30:00+07:00"))?.active).toBe(true);

    // 10H: the return row is only 05:00-07:00 in GTFS, but the official
    // service runs to 22:00. A short row without a one-way flag is context,
    // not permission to close the direction.
    const twoWayShort = { ...line(), metadata: { service: shortService } };
    const twoWayState = serviceAt(twoWayShort, "forward", at);
    expect(twoWayState?.reliable).toBe(false);
    expect(twoWayState?.active).toBe(true);
    expect(lineRunsAt(twoWayShort, "forward", at)).toBe(true);
  });

  it("trusts a full-day single row", () => {
    const fullDay = line({
      source: "gtfs",
      timezone: "Asia/Jakarta",
      byDirection: {
        backward: [{ days: [1, 2, 3, 4, 5, 6, 7], startMinute: 300, endMinute: 1320, headwayMinutes: 5 }],
      },
      reliableByDirection: { backward: false },
      updatedAt: "2026-10-27T00:00:00.000Z",
    });
    const state = serviceAt(fullDay, "backward", new Date("2026-10-27T23:00:00+07:00"));
    expect(state?.reliable).toBe(true);
    expect(state?.active).toBe(false);
  });

  it("returns no service metadata for a line without one", () => {
    expect(serviceAt(line(), "forward", new Date())).toBeNull();
  });

  it("writes a short rider-facing frequency label", () => {
    expect(frequencyLabel(5, 3, 8)).toBe("Very frequent · about every 5 min · 3–8 min range");
    expect(frequencyLabel(20, 20, 20)).toBe("Infrequent · every 20 min");
  });
});

describe("isNightDeparture", () => {
  it("follows the Jakarta clock at the edges of the night window", () => {
    expect(isNightDeparture(new Date("2026-10-27T21:59:00+07:00"))).toBe(false);
    expect(isNightDeparture(new Date("2026-10-27T22:00:00+07:00"))).toBe(true);
    expect(isNightDeparture(new Date("2026-10-27T04:59:00+07:00"))).toBe(true);
    expect(isNightDeparture(new Date("2026-10-27T05:00:00+07:00"))).toBe(false);
  });
});

describe("night-safe service window in the graph", () => {
  it("does not route a line after its last service", async () => {
    const { planRoutes } = await import("./graph.js");
    const lineWithService = {
      ...line(service),
      id: "test:night",
      code: "N1",
      metadata: {
        service: {
          ...service,
          byDirection: {
            forward: [
              { days: [1, 2, 3, 4, 5], startMinute: 300, endMinute: 1200, headwayMinutes: 10 },
            ],
          },
          reliableByDirection: { forward: true },
        },
      },
    };
    const network = {
      lines: [lineWithService],
      stations: [
        { id: "a", systemId: "transjakarta", name: "A", code: null, latitude: 0, longitude: 0, stationType: "stop" as const, zone: null, isInterchange: false, description: "", area: null, aliases: [] },
        { id: "b", systemId: "transjakarta", name: "B", code: null, latitude: 0, longitude: 0.01, stationType: "stop" as const, zone: null, isInterchange: false, description: "", area: null, aliases: [] },
      ],
      lineStops: [
        { lineId: "test:night", stationId: "a", direction: "forward" as const, position: 1, distanceFromOriginKm: 0 },
        { lineId: "test:night", stationId: "b", direction: "forward" as const, position: 2, distanceFromOriginKm: 1 },
      ],
      stationGroups: [],
    };
    expect(planRoutes(network, "a", "b", { at: new Date("2026-10-27T12:00:00+07:00") })).toHaveLength(1);
    expect(planRoutes(network, "a", "b", { at: new Date("2026-10-27T23:00:00+07:00") })).toHaveLength(0);
  });
});
