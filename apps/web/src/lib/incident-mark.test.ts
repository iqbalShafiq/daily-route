import { describe, expect, it } from "vitest";

import { incidentMarkOf } from "./incident-mark.js";

describe("incidentMarkOf", () => {
  it("keeps a stored choice", () => {
    expect(incidentMarkOf("crash", "service-change")).toBe("crash");
    expect(incidentMarkOf("unknown", "diversion")).toBe("unknown");
  });

  it("reads the kind when no choice is stored", () => {
    expect(incidentMarkOf(null, "service-change")).toBe("diversion");
    expect(incidentMarkOf(undefined, "closure")).toBe("closure");
    expect(incidentMarkOf("not-a-mark", "delay")).toBe("delay");
    expect(incidentMarkOf(null, "weather")).toBe("weather");
    expect(incidentMarkOf(null, "")).toBe("unknown");
  });
});
