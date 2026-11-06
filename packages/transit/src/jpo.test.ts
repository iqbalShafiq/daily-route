import { describe, expect, it } from "vitest";

import { jpoWalkEstimate, jposAlongPath, jposAtStation, type Jpo } from "./jpo.js";

function bridge(overrides: Partial<Jpo> = {}): Jpo {
  return {
    id: "jpo:test",
    name: "JPO Test",
    kind: "jpo",
    source: "jakarta-bina-marga",
    official: true,
    city: "Jakarta Pusat",
    address: null,
    remark: null,
    lengthM: 100,
    geometry: [
      { latitude: -6.2, longitude: 106.8 },
      { latitude: -6.2, longitude: 106.801 },
    ],
    startsAt: { latitude: -6.2, longitude: 106.8 },
    endsAt: { latitude: -6.2, longitude: 106.801 },
    officialPoint: null,
    stations: [
      {
        stationId: "transjakarta:test",
        stationName: "Test",
        distanceM: 20,
        end: "end",
      },
    ],
    confidence: "official-line",
    updatedAt: null,
    ...overrides,
  };
}

describe("jpoWalkEstimate", () => {
  it("uses the bridge when the rider is on one side and the stop on the other", () => {
    const estimate = jpoWalkEstimate(
      [bridge()],
      { latitude: -6.2, longitude: 106.7999 },
      { latitude: -6.2, longitude: 106.8011 },
    );

    expect(estimate).not.toBeNull();
    expect(estimate?.jpo.name).toBe("JPO Test");
    expect(estimate?.km).toBeGreaterThan(0.1);
    expect(estimate?.entryEnd).toBe("start");
  });

  it("does not use a bridge when both places are on the same side", () => {
    const estimate = jpoWalkEstimate(
      [bridge()],
      { latitude: -6.2, longitude: 106.7999 },
      { latitude: -6.2, longitude: 106.7998 },
    );

    expect(estimate).toBeNull();
  });
});

describe("jposAlongPath", () => {
  it("keeps a named official bridge ahead of an unnamed OSM segment", () => {
    const official = bridge({ id: "jpo:official", name: "JPO Resmi", official: true });
    const unnamed = bridge({
      id: "osm:way/1",
      name: "Footbridge",
      source: "osm",
      official: false,
      confidence: "osm",
      geometry: [
        { latitude: -6.2, longitude: 106.8009 },
        { latitude: -6.2, longitude: 106.8011 },
      ],
    });

    const used = jposAlongPath(
      [unnamed, official],
      [
        { latitude: -6.2, longitude: 106.8 },
        { latitude: -6.2, longitude: 106.801 },
      ],
    );

    expect(used[0]?.jpo.id).toBe("jpo:official");
  });

  it("ignores a bridge that the walk does not touch", () => {
    const used = jposAlongPath(
      [bridge()],
      [
        { latitude: -6.201, longitude: 106.799 },
        { latitude: -6.201, longitude: 106.7991 },
      ],
    );

    expect(used).toEqual([]);
  });
});

describe("jposAtStation", () => {
  it("returns the bridges recorded beside a stop", () => {
    const found = jposAtStation([bridge()], "transjakarta:test");
    expect(found.map((jpo) => jpo.id)).toEqual(["jpo:test"]);
  });
});
