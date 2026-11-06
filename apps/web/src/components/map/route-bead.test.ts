import { describe, expect, it } from "vitest";

import { beadPointAt, type BeadPoint } from "./route-bead.js";

const LINE: BeadPoint[] = [
  { latitude: 0, longitude: 0 },
  { latitude: 0, longitude: 1 },
  { latitude: 0, longitude: 2 },
];

describe("beadPointAt", () => {
  it("starts at the first point and ends at the last", () => {
    expect(beadPointAt(LINE, 0)).toEqual({ latitude: 0, longitude: 0 });
    expect(beadPointAt(LINE, 1)).toEqual({ latitude: 0, longitude: 2 });
  });

  it("walks by segment length, not by point index", () => {
    const middle = beadPointAt(LINE, 0.25);
    expect(middle?.longitude).toBeCloseTo(0.5);
  });

  it("clamps outside the journey and accepts a single point", () => {
    expect(beadPointAt(LINE, -3)?.longitude).toBe(0);
    expect(beadPointAt(LINE, 9)?.longitude).toBe(2);
    expect(beadPointAt([{ latitude: 1, longitude: 1 }], 0.5)).toEqual({
      latitude: 1,
      longitude: 1,
    });
    expect(beadPointAt([], 0.5)).toBeNull();
  });
});
