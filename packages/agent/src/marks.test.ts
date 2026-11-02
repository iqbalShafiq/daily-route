import { describe, expect, it } from "vitest";

import { acceptedMark, storedMark } from "./marks.js";

describe("acceptedMark", () => {
  it("keeps a confident choice", () => {
    expect(acceptedMark("crash", 0.45)).toBe("crash");
    expect(acceptedMark("unknown", 0.8)).toBe("unknown");
  });

  it("drops a weak or unknown key", () => {
    expect(acceptedMark("flood", 0.44)).toBeNull();
    expect(acceptedMark("banner", 0.9)).toBeNull();
    expect(acceptedMark(undefined, 1)).toBeNull();
  });
});

describe("storedMark", () => {
  it("reads only a known key", () => {
    expect(storedMark({ mark: "fire" })).toBe("fire");
    expect(storedMark({ mark: "logo" })).toBeNull();
    expect(storedMark(null)).toBeNull();
  });
});
