import { describe, expect, it } from "vitest";

import {
  MODE_COLOR,
  SERVICE_CLASS_COLOR,
  transitModeToken,
  transitModeTokenOf,
  type TransitModeInput,
} from "./format.js";

const CASES: Array<{
  name: string;
  input: TransitModeInput;
  id: string;
  label: string;
  short: string;
}> = [
  {
    name: "KRL Commuter",
    input: { systemId: "krl-jabodetabek", serviceClass: "commuter-rail", lineCode: "Bogor" },
    id: "krl",
    label: "KRL Commuter",
    short: "KRL",
  },
  {
    name: "MRT Jakarta",
    input: { systemId: "mrt-jakarta", serviceClass: "rapid-transit", lineCode: "M" },
    id: "mrt",
    label: "MRT Jakarta",
    short: "MRT",
  },
  {
    name: "LRT Jabodebek",
    input: { systemId: "lrt-jabodebek", serviceClass: "lrt", lineCode: "Cibubur" },
    id: "lrtj",
    label: "LRT Jabodebek",
    short: "LRT",
  },
  {
    name: "LRT Jakarta",
    input: { systemId: "lrt-jakarta", serviceClass: "lrt", lineCode: "L1" },
    id: "lrtk",
    label: "LRT Jakarta",
    short: "LRT",
  },
  {
    name: "Transjakarta BRT",
    input: { systemId: "transjakarta", serviceClass: "brt", lineCode: "9" },
    id: "brt",
    label: "TransJakarta BRT",
    short: "TJ",
  },
  {
    name: "Transjakarta non-BRT",
    input: { systemId: "transjakarta", serviceClass: "non-brt", lineCode: "5F" },
    id: "nonbrt",
    label: "TransJakarta non-BRT",
    short: "TJ",
  },
  {
    name: "Mikrotrans",
    input: { systemId: "transjakarta", serviceClass: "mikrotrans", lineCode: "JAK.01" },
    id: "mikro",
    label: "Mikrotrans",
    short: "JAK",
  },
  {
    name: "Walk",
    input: { mode: "walk" },
    id: "walk",
    label: "Walk",
    short: "Jalan",
  },
];

describe("transitModeTokenOf", () => {
  for (const entry of CASES) {
    it(`maps ${entry.name}`, () => {
      const token = transitModeTokenOf(entry.input);
      expect(token.id).toBe(entry.id);
      expect(token.label).toBe(entry.label);
      expect(token.shortLabel).toBe(entry.short);
      expect(token.colorVar).toBe(`var(--${entry.id})`);
      expect(token.hexLight).toMatch(/^#[0-9A-F]{6}$/);
    });
  }

  it("separates the two LRT systems by system id", () => {
    expect(transitModeTokenOf({ systemId: "lrt-jabodebek" }).id).toBe("lrtj");
    expect(transitModeTokenOf({ systemId: "lrt-jakarta" }).id).toBe("lrtk");
    // A bare LRT defaults to the larger network, Jabodebek.
    expect(transitModeTokenOf({ serviceClass: "lrt" }).id).toBe("lrtj");
  });

  it("reads a Mikrotrans code even when the service class is missing", () => {
    expect(transitModeTokenOf({ systemId: "transjakarta", lineCode: "JAK.01" }).id).toBe("mikro");
  });

  it("reads a bare corridor code as BRT", () => {
    expect(transitModeTokenOf({ systemId: "transjakarta", lineCode: "9" }).id).toBe("brt");
    expect(transitModeTokenOf({ systemId: "transjakarta", lineCode: "6A" }).id).toBe("brt");
  });

  it("never invents a token for an unknown line", () => {
    expect(transitModeTokenOf({}).id).toBe("nonbrt");
    expect(transitModeTokenOf({ lineCode: "unknown" }).id).toBe("nonbrt");
  });

  it("returns the same object from the id helper", () => {
    expect(transitModeToken("krl")).toEqual(transitModeTokenOf({ systemId: "krl-jabodetabek" }));
  });
});

describe("legacy colour maps", () => {
  it("points every service class at a mode token", () => {
    expect(SERVICE_CLASS_COLOR.brt).toBe("var(--brt)");
    expect(SERVICE_CLASS_COLOR["non-brt"]).toBe("var(--nonbrt)");
    expect(SERVICE_CLASS_COLOR.mikrotrans).toBe("var(--mikro)");
    expect(SERVICE_CLASS_COLOR["rapid-transit"]).toBe("var(--mrt)");
    expect(SERVICE_CLASS_COLOR.lrt).toBe("var(--lrtj)");
    expect(SERVICE_CLASS_COLOR["commuter-rail"]).toBe("var(--krl)");
  });

  it("points every mode at a mode token", () => {
    expect(MODE_COLOR.bus).toBe("var(--brt)");
    expect(MODE_COLOR.minibus).toBe("var(--nonbrt)");
    expect(MODE_COLOR.tram).toBe("var(--lrtj)");
    expect(MODE_COLOR.metro).toBe("var(--mrt)");
    expect(MODE_COLOR.rail).toBe("var(--krl)");
    expect(MODE_COLOR.walk).toBe("var(--walk)");
  });
});
