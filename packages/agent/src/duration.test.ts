import { describe, expect, it } from "vitest";

import { normalizeDuration, reviewAtFor } from "./duration.js";

describe("duration assessment", () => {
  it("clamps a model-sized review window", () => {
    expect(
      normalizeDuration({
        horizon: "months",
        reviewAfterHours: 9_999,
        reason: "  pekerjaan panjang  ",
        confidence: 2,
      }),
    ).toEqual({
      horizon: "months",
      reviewAfterHours: 2_160,
      reason: "pekerjaan panjang",
      confidence: 1,
    });
  });

  it("anchors a future event to its start, not to the publication", () => {
    const now = new Date("2026-10-30T09:00:00+07:00");
    const start = new Date("2026-11-01T05:00:00+07:00");
    expect(
      reviewAtFor({ horizon: "weeks", reviewAfterHours: 24, reason: "", confidence: 0.8 }, start, now)?.toISOString(),
    ).toBe("2026-11-01T22:00:00.000Z");
  });

  it("does not schedule a review when an explicit end exists", () => {
    expect(
      reviewAtFor({ horizon: "hours", reviewAfterHours: null, reason: "", confidence: 0.9 }, new Date(), new Date()),
    ).toBeNull();
  });
});
