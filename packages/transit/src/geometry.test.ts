import { describe, expect, it } from "vitest";

import {
  clipSliceToStops,
  joinWalkEnds,
  sliceGeometry,
  sliceGeometryNearStops,
  toFlatCoordinates,
  type LineGeometry,
} from "./geometry.js";

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

  it("starts and ends on the stops and drops a vertex behind the boarding stop", () => {
    // Bundaran HI to Dukuh Atas: the first vertex of the stored rail is
    // 91 m north of the station, and the station is not a vertex.
    const behind = { latitude: -6.191026, longitude: 106.823039 };
    const origin = { latitude: -6.1918487, longitude: 106.8230619 };
    const passed = { latitude: -6.198464, longitude: 106.823188 };
    const passedToo = { latitude: -6.19895, longitude: 106.823146 };
    const destination = { latitude: -6.2008018, longitude: 106.8228278 };
    const points = [behind, passed, passedToo, destination];
    const geometry: LineGeometry = {
      lineId: "mrt-jakarta:ns",
      direction: "forward",
      coordinates: toFlatCoordinates(points),
      stopOffsets: [0, 3],
      lengthKm: 1.1,
    };

    const slice = sliceGeometryNearStops(geometry, origin, destination);
    if (!slice) throw new Error("expected a slice");

    expect(slice[0]).toEqual(origin);
    expect(slice[slice.length - 1]).toEqual(destination);
    expect(slice).not.toContainEqual(behind);
    for (const point of slice) {
      expect(point.latitude).toBeLessThanOrEqual(origin.latitude);
    }

    // The stops the vehicle passes between the two ends stay on the line.
    expect(slice).toContainEqual(passed);
    expect(slice).toContainEqual(passedToo);
  });

  it("trims the stored offset slice to the same two ends", () => {
    const behind = { latitude: -6.191026, longitude: 106.823039 };
    const origin = { latitude: -6.1918487, longitude: 106.8230619 };
    const passed = { latitude: -6.198464, longitude: 106.823188 };
    const destination = { latitude: -6.2008018, longitude: 106.8228278 };
    const points = [behind, passed, destination];
    const geometry: LineGeometry = {
      lineId: "mrt-jakarta:ns",
      direction: "forward",
      coordinates: toFlatCoordinates(points),
      stopOffsets: [0, 2],
      lengthKm: 1.1,
    };

    const trimmed = clipSliceToStops(sliceGeometry(geometry, 1, 2), origin, destination);
    if (!trimmed) throw new Error("expected a trimmed slice");

    expect(trimmed[0]).toEqual(origin);
    expect(trimmed[trimmed.length - 1]).toEqual(destination);
    expect(trimmed).not.toContainEqual(behind);
    expect(trimmed).toContainEqual(passed);
  });
});

describe("joinWalkEnds", () => {
  const station = { latitude: -6.137579, longitude: 106.814634 };
  const place = { latitude: -6.136927, longitude: 106.815087 };

  it("closes a walk to the stop and the place it joins", () => {
    // The router snapped the station end to a footpath 40 m away.
    const routed = [
      { latitude: -6.137671, longitude: 106.814283 },
      { latitude: -6.1372, longitude: 106.8145 },
      { latitude: -6.136927, longitude: 106.815087 },
    ];

    const joined = joinWalkEnds(routed, station, place);

    expect(joined[0]).toEqual(station);
    expect(joined[joined.length - 1]).toEqual(place);
    expect(joined).toContainEqual(routed[0]);
    expect(joined.length).toBe(routed.length + 1);
  });

  it("keeps the gap when the router answered from a street far away", () => {
    const far = { latitude: -6.147671, longitude: 106.814283 };
    const routed = [far, { latitude: -6.136927, longitude: 106.815087 }];

    const joined = joinWalkEnds(routed, station, place);

    expect(joined[0]).toEqual(far);
    expect(joined[joined.length - 1]).toEqual(place);
  });

  it("adds no point when the walk already meets both ends", () => {
    const routed = [station, { latitude: -6.1372, longitude: 106.8145 }, place];

    expect(joinWalkEnds(routed, station, place)).toEqual(routed);
  });

  it("returns no line for a walk the router could not draw", () => {
    expect(joinWalkEnds([], station, place)).toEqual([]);
    expect(joinWalkEnds([station], station, place)).toEqual([]);
  });
});
