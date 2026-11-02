import { describe, expect, it } from "vitest";

import { acceptedEndsAt } from "./classify.js";

describe("acceptedEndsAt", () => {
  it("keeps a real instant and drops anything else", () => {
    expect(acceptedEndsAt("2026-10-23T02:00:00.000Z")).toBe("2026-10-23T02:00:00.000Z");
    expect(acceptedEndsAt(null)).toBeNull();
    expect(acceptedEndsAt("")).toBeNull();
    expect(acceptedEndsAt("besok pagi")).toBeNull();
  });
});
