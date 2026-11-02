import { describe, expect, it } from "vitest";

import { ROUTE_FLOW_PERIOD_MS, routeFlowDash, routeFlowIndex } from "./route-flow.js";

describe("routeFlowDash", () => {
  it("starts on the first step and repeats", () => {
    expect(routeFlowDash(0)).toEqual([0, 4, 3, 0]);
    expect(routeFlowDash(ROUTE_FLOW_PERIOD_MS)).toEqual(routeFlowDash(0));
    expect(routeFlowIndex(ROUTE_FLOW_PERIOD_MS)).toBe(0);
  });

  it("keeps every step the same shape, long enough to tile", () => {
    const seen = new Set<number>();
    for (let ms = 0; ms < ROUTE_FLOW_PERIOD_MS; ms += 20) {
      const dash = routeFlowDash(ms);
      seen.add(routeFlowIndex(ms));
      const sum = dash.reduce((total, value) => total + value, 0);
      expect(dash).toHaveLength(4);
      expect(sum).toBeCloseTo(7);
      expect(dash.every((value) => value >= 0)).toBe(true);
    }
    expect(seen.size).toBeGreaterThan(8);
  });
});
