import { describe, expect, it } from "vitest";

import { INCIDENT_FALLBACK_HOURS, noticeTtlHours } from "./monitor.js";

/**
 * The fallback lifetime.
 *
 * A Jakarta diversion is normally over in hours. Eight hours is the default;
 * a newer Post that says the route is still disrupted moves `lastSeenAt`, so
 * `expireStaleDisruptions` moves the deadline with it.
 */
describe("noticeTtlHours", () => {
  it("uses an eight-hour fallback for an incidental diversion or closure", () => {
    expect(INCIDENT_FALLBACK_HOURS).toBe(8);
    expect(noticeTtlHours("diversion", "warning")).toBe(8);
    expect(noticeTtlHours("closure", "critical")).toBe(8);
    expect(noticeTtlHours("service-change", "warning")).toBe(8);
  });

  it("keeps the special lifetimes for other kinds", () => {
    expect(noticeTtlHours("delay", "warning")).toBe(4);
    expect(noticeTtlHours("weather", "warning")).toBe(8);
    expect(noticeTtlHours("strike", "warning")).toBe(48);
    expect(noticeTtlHours("maintenance", "warning")).toBe(72);
  });
});
