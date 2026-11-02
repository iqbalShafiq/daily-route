import { describe, expect, it } from "vitest";

import { searchToll, tollInfoForLine } from "./toll.js";

describe("toll knowledge", () => {
  it("knows that 6P uses Jagorawi and the inner ring road", () => {
    const info = tollInfoForLine("6p");
    expect(info?.service.confidence).toBe("confirmed");
    expect(info?.roads.map((road) => road.id)).toEqual(["jagorawi", "dalam-kota"]);
  });

  it("keeps the corridor 9 toll use conditional, not a default", () => {
    const info = tollInfoForLine("9");
    expect(info?.service.mode).toBe("conditional");
    expect(info?.service.note).toContain("not on it");
  });

  it("searches by toll name and gates", () => {
    const byRoad = searchToll({ toll: "Jagorawi" });
    expect(byRoad.services.some((service) => service.lineCode === "6P")).toBe(true);
    const byGate = searchToll({ toll: "Cibubur" });
    expect(byGate.roads.some((road) => road.id === "jagorawi")).toBe(true);
  });

  it("returns null for a line with no researched toll use", () => {
    expect(tollInfoForLine("1")).toBeNull();
  });
});
