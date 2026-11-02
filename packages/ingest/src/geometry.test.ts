import { describe, expect, it } from "vitest";

import { buildLineGeometry, stitchPolyline, stitchRoutePath } from "./geometry.js";

/**
 * A coordinate a given number of metres north of a point.
 *
 * One degree of latitude is 111.32 km, which is enough to place a way
 * where the test needs it.
 */
function northOf(latitude: number, longitude: number, metres: number) {
  return { latitude: latitude + metres / 111_320, longitude };
}

describe("stitchPolyline", () => {
  it("does not draw a line across the city to a way listed at the wrong end", () => {
    const terminus = [
      northOf(-6.2, 106.8, 0),
      northOf(-6.2, 106.8, 80),
    ];
    const route = [
      northOf(-6.2, 106.8, 12_000),
      northOf(-6.2, 106.8, 12_400),
      northOf(-6.2, 106.8, 12_800),
    ];

    const path = stitchPolyline([{ geometry: terminus }, { geometry: route }]);

    expect(path[0]?.latitude).toBeCloseTo(route[0]?.latitude ?? 0, 5);
    expect(path.some((point) => Math.abs(point.latitude - (terminus[0]?.latitude ?? 0)) < 1e-6)).toBe(
      false,
    );
  });

  it("keeps a short break that is still the same road", () => {
    const first = [northOf(-6.2, 106.8, 0), northOf(-6.2, 106.8, 200)];
    const second = [northOf(-6.2, 106.8, 700), northOf(-6.2, 106.8, 1_000)];

    const path = stitchPolyline([{ geometry: first }, { geometry: second }]);

    expect(path).toHaveLength(4);
    expect(path[0]?.latitude).toBeCloseTo(first[0]?.latitude ?? 0, 5);
    expect(path[3]?.latitude).toBeCloseTo(second[1]?.latitude ?? 0, 5);
  });

  it("moves a platform way onto the end of the route it belongs to", () => {
    // The relation lists the terminus first. The next way is the other
    // end of the route, so the two cannot be one chain. The terminus
    // does meet the far end of the route, and that is where it belongs.
    const platform = [northOf(-6.2, 106.8, 10_000), northOf(-6.2, 106.8, 10_080)];
    const outbound = [northOf(-6.2, 106.8, 0), northOf(-6.2, 106.8, 400)];
    const inbound = [northOf(-6.2, 106.8, 400), northOf(-6.2, 106.8, 9_900)];

    const stitched = stitchRoutePath([
      { id: 1, geometry: platform },
      { id: 2, geometry: outbound },
      { id: 3, geometry: inbound },
    ]);

    expect(stitched.points[0]?.latitude).toBeCloseTo(outbound[0]?.latitude ?? 0, 5);
    expect(stitched.points[stitched.points.length - 1]?.latitude).toBeCloseTo(
      platform[1]?.latitude ?? 0,
      5,
    );
    expect(stitched.wayIds).toHaveLength(stitched.points.length);
    expect(stitched.wayIds[0]).toBe(2);
    expect(stitched.wayIds[stitched.wayIds.length - 1]).toBe(1);
  });
});

describe("buildLineGeometry", () => {
  it("keeps the road when a single stop stands away from it", () => {
    const road = [northOf(-6.2, 106.8, 0), northOf(-6.2, 106.8, 1_200)];
    const stops = [
      road[0],
      northOf(-6.2, 106.8, 400),
      northOf(-6.2, 106.8, 800),
      road[1],
      { latitude: -6.22, longitude: 106.8 },
    ].filter((stop): stop is { latitude: number; longitude: number } => stop !== undefined);

    const geometry = buildLineGeometry({
      lineId: "transjakarta:1",
      direction: "forward",
      polyline: road,
      stops,
    });

    const latitudes = geometry.coordinates.filter((_, index) => index % 2 === 1);
    expect(Math.min(...latitudes)).toBeGreaterThan(-6.21);
  });

  it("keeps the road when the stops stand somewhere else", () => {
    const road = [northOf(-6.2, 106.8, 0), northOf(-6.2, 106.8, 200)];
    const stops = [0, 1, 2].map((index) => northOf(-6.3, 106.9, index * 300));

    const geometry = buildLineGeometry({
      lineId: "transjakarta:1",
      direction: "forward",
      polyline: road,
      stops,
    });

    const latitudes = geometry.coordinates.filter((_, index) => index % 2 === 1);
    expect(Math.min(...latitudes)).toBeGreaterThan(-6.21);
    expect(geometry.coordinates).toHaveLength(4);
  });

  it("measures through the stops when the road stops short of them", () => {
    const road = [northOf(-6.2, 106.8, 0), northOf(-6.2, 106.8, 200)];
    const stops = [0, 5_000, 10_000].map((metres) => northOf(-6.2, 106.8, metres));

    const geometry = buildLineGeometry({
      lineId: "transjakarta:1",
      direction: "forward",
      polyline: road,
      stops,
    });

    // The road is still the drawn path.
    expect(geometry.coordinates).toHaveLength(4);
    // The distance no longer collapses to zero after the road ends.
    expect(geometry.stopDistancesKm[1]).toBeCloseTo(5, 1);
    expect(geometry.stopDistancesKm[2]).toBeCloseTo(10, 1);
  });
});
