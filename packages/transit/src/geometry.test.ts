import { describe, expect, it } from "vitest";

import { sliceGeometry, sliceGeometryNearStops, toFlatCoordinates, type LineGeometry } from "./geometry.js";

describe("sliceGeometryNearStops", () => {
  it("draws the rail between the two stops when the stored offsets collapse", () => {
    const points = [
      { latitude: -6.15, longitude: 106.8 },
      { latitude: -6.17, longitude: 106.81 },
      { latitude: -6.19, longitude: 106.82 },
      { latitude: -6.2, longitude: 106.84 },
    ];
    const geometry: LineGeometry = {
      lineId: "krl-jabodetabek:c",
      direction: "forward",
      coordinates: toFlatCoordinates(points),
      // Every stop was pinned to the last vertex, which is what a loop
      // does when its first stop is matched at the wrong end.
      stopOffsets: [3, 3, 3, 3],
      lengthKm: 8,
    };
    const from = points[0];
    const to = points[2];
    if (!from || !to) throw new Error("fixture");

    const collapsed = sliceGeometry(geometry, 1, 3);
    expect(collapsed).toHaveLength(1);

    const slice = sliceGeometryNearStops(geometry, from, to);
    expect(slice?.[0]).toEqual(from);
    expect(slice?.[slice.length - 1]).toEqual(to);
    expect(slice?.length).toBeGreaterThanOrEqual(3);
  });

  it("refuses a chord that jumps across the city", () => {
    const points = [
      { latitude: -6.15, longitude: 106.8 },
      { latitude: -6.25, longitude: 106.9 },
    ];
    const geometry: LineGeometry = {
      lineId: "krl-jabodetabek:c",
      direction: "forward",
      coordinates: toFlatCoordinates(points),
      stopOffsets: [0, 1],
      lengthKm: 15,
    };
    const from = points[0];
    const to = points[1];
    if (!from || !to) throw new Error("fixture");

    expect(sliceGeometryNearStops(geometry, from, to)).toBeNull();
  });
});
