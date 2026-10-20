import { describe, expect, it } from "vitest";

import { centroid, haversineKm, interpolate, pathLengthKm, pointAlongPath, walkingMinutes } from "./geo.js";

describe("haversineKm", () => {
  it("returns zero for the same point", () => {
    expect(haversineKm({ latitude: -6.2, longitude: 106.8 }, { latitude: -6.2, longitude: 106.8 })).toBe(0);
  });

  it("matches a known distance across Jakarta", () => {
    // Bundaran HI to Monas is a little under 1 km as the crow flies.
    const bundaranHi = { latitude: -6.19447, longitude: 106.82297 };
    const monas = { latitude: -6.17539, longitude: 106.82496 };
    const distance = haversineKm(bundaranHi, monas);
    expect(distance).toBeGreaterThan(1.5);
    expect(distance).toBeLessThan(2.6);
  });
});

describe("centroid", () => {
  it("returns null for an empty list", () => {
    expect(centroid([])).toBeNull();
  });

  it("averages the points", () => {
    expect(
      centroid([
        { latitude: -6, longitude: 106 },
        { latitude: -7, longitude: 107 },
      ]),
    ).toEqual({ latitude: -6.5, longitude: 106.5 });
  });
});

describe("interpolate", () => {
  it("clamps the ratio to the segment", () => {
    const from = { latitude: -6, longitude: 106 };
    const to = { latitude: -7, longitude: 107 };
    expect(interpolate(from, to, 2)).toEqual(to);
    expect(interpolate(from, to, -1)).toEqual(from);
  });
});

describe("pointAlongPath", () => {
  const path = [
    { latitude: -6.2, longitude: 106.8 },
    { latitude: -6.1, longitude: 106.9 },
  ];

  it("returns the first point at fraction zero", () => {
    expect(pointAlongPath(path, 0)).toEqual(path[0]);
  });

  it("returns the last point at fraction one", () => {
    expect(pointAlongPath(path, 1)).toEqual(path[1]);
  });

  it("returns null for an empty path", () => {
    expect(pointAlongPath([], 0.5)).toBeNull();
  });
});

describe("pathLengthKm", () => {
  it("is zero for a single point", () => {
    expect(pathLengthKm([{ latitude: -6, longitude: 106 }])).toBe(0);
  });
});

describe("walkingMinutes", () => {
  it("uses a 4.5 km/h pace", () => {
    expect(walkingMinutes(4.5)).toBe(60);
  });
});
