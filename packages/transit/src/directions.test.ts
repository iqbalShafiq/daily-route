import { describe, expect, it } from "vitest";

import {
  compassOfDirection,
  directionAtStation,
  directionFromCompass,
  directionSummary,
  directionTowards,
  lineDirections,
  platformDirections,
} from "./directions.js";
import type { TransitNetwork } from "./graph.js";
import type { Station } from "./types.js";

function station(id: string, name: string, latitude = -6.2): Station {
  return {
    id,
    systemId: "transjakarta",
    name,
    code: null,
    latitude,
    longitude: 106.8,
    stationType: "stop",
    zone: null,
    isInterchange: false,
    description: "",
    area: null,
    aliases: [],
  };
}

const network = {
  stations: [
    station("a", "Kali Besar", -6.2),
    station("b", "Harmoni", -6.25),
    station("c", "Blok M", -6.3),
  ],
  lines: [],
  lineStops: [
    { lineId: "l1", stationId: "a", direction: "forward", position: 1, distanceFromOriginKm: 0 },
    { lineId: "l1", stationId: "b", direction: "forward", position: 2, distanceFromOriginKm: 1 },
    { lineId: "l1", stationId: "c", direction: "forward", position: 3, distanceFromOriginKm: 2 },
    { lineId: "l1", stationId: "c", direction: "backward", position: 1, distanceFromOriginKm: 0 },
    { lineId: "l1", stationId: "b", direction: "backward", position: 2, distanceFromOriginKm: 1 },
  ],
} as unknown as TransitNetwork;

describe("directionSummary", () => {
  it("names the direction by its two ends, not by the line", () => {
    const forward = directionSummary(network, "l1", "forward");
    expect(forward?.label).toBe("Kali Besar → Blok M");
    expect(forward?.stopCount).toBe(3);
    expect(directionSummary(network, "l1", "backward")?.label).toBe("Blok M → Harmoni");
  });

  it("lists only the directions that exist", () => {
    expect(lineDirections(network, "l1")).toHaveLength(2);
    expect(lineDirections(network, "missing")).toEqual([]);
  });

  it("reads a compass direction from the stops", () => {
    expect(compassOfDirection(network, "l1", "forward")).toBe("south");
    expect(compassOfDirection(network, "l1", "backward")).toBe("north");
    expect(directionFromCompass(network, "l1", "north")).toBe("backward");
    expect(directionFromCompass(network, "l1", "east")).toBeNull();
    expect(platformDirections(network, ["l1"], { compass: "north" })).toEqual([
      { lineId: "l1", direction: "backward" },
    ]);
  });

  it("reads the heading at one station, including the last stop", () => {
    expect(directionAtStation(network, "l1", "b", "south")).toBe("forward");
    expect(directionAtStation(network, "l1", "b", "north")).toBe("backward");
  });

  it("matches an alias of the terminus", () => {
    const withAlias = {
      ...network,
      stations: network.stations.map((entry) =>
        entry.id === "c" ? { ...entry, aliases: ["Terminal Selatan"] } : entry,
      ),
    } as unknown as TransitNetwork;
    expect(directionTowards(withAlias, ["l1"], "Terminal Selatan")).toBe("forward");
  });

  it("reads a named destination as a direction", () => {
    expect(directionTowards(network, ["l1"], "Blok M")).toBe("forward");
    expect(directionTowards(network, ["l1"], "menuju Blok M")).toBe("forward");
    expect(directionTowards(network, ["l1"], "arah Harmoni")).toBe("backward");
    expect(directionTowards(network, ["l1"], "Kali Besar")).toBeNull();
    expect(directionTowards(network, ["l1"], "Bandung")).toBeNull();
  });
});
