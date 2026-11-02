import { describe, expect, it } from "vitest";

import { INCIDENT_PULSE_PERIOD_MS, incidentPulsePaint } from "./incident-pulse.js";

describe("incidentPulsePaint", () => {
  it("starts flush with the plate at full strength", () => {
    expect(incidentPulsePaint(0)).toEqual({ scale: 1, opacity: 0.4 });
  });

  it("travels outward and fades, then begins again", () => {
    const mid = incidentPulsePaint(INCIDENT_PULSE_PERIOD_MS / 2);
    expect(mid.scale).toBeCloseTo(1 + 8 / 22.4 / 2);
    expect(mid.opacity).toBeCloseTo(0.2);

    const end = incidentPulsePaint(INCIDENT_PULSE_PERIOD_MS - 1);
    expect(end.scale).toBeGreaterThan(mid.scale);
    expect(end.scale).toBeLessThanOrEqual(1 + 8 / 22.4);
    expect(end.opacity).toBeLessThan(0.01);

    expect(incidentPulsePaint(INCIDENT_PULSE_PERIOD_MS)).toEqual(incidentPulsePaint(0));
  });

  it("stays in range for a negative clock", () => {
    const paint = incidentPulsePaint(-20);
    expect(paint.scale).toBeGreaterThanOrEqual(1);
    expect(paint.scale).toBeLessThanOrEqual(1 + 8 / 22.4);
    expect(paint.opacity).toBeGreaterThanOrEqual(0);
    expect(paint.opacity).toBeLessThanOrEqual(0.4);
  });
});
