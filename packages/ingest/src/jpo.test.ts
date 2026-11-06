import { describe, expect, it } from "vitest";

import { buildJpoDocument, type OfficialJpoFeature, type OsmBridge } from "./jpo.js";
import type { Station, TransitNetwork } from "@daily-route/transit";

const station: Station = {
  id: "transjakarta:grogol-reformasi",
  systemId: "transjakarta",
  name: "Grogol Reformasi",
  code: null,
  latitude: -6.2,
  longitude: 106.801,
  stationType: "stop",
  zone: null,
  isInterchange: false,
  description: "",
  area: null,
  aliases: [],
};

function network(): TransitNetwork {
  return { stations: [station] } as unknown as TransitNetwork;
}

const official: OfficialJpoFeature = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [106.8, -6.2] },
  properties: {
    NO_REG: "JPO-TEST-1",
    NAMOBJ: "JPO Test",
    TYPE: "JPO",
    ALAMAT: "Jl. Test",
    WADMKK: "KOTA ADM. JAKARTA BARAT",
    REMARK: "BUSWAY TEST",
    LAST_EDITED_DATE: 1_700_000_000_000,
  },
};

function bridge(id: number, name: string | undefined, latitudeOffset = 0): OsmBridge {
  return {
    id,
    nodes: [],
    tags: name ? { name } : {},
    geometry: [
      { latitude: -6.2 + latitudeOffset, longitude: 106.8 },
      { latitude: -6.2 + latitudeOffset, longitude: 106.801 },
    ],
  };
}

describe("buildJpoDocument", () => {
  it("matches an official point to the bridge line and the stop at its end", () => {
    const document = buildJpoDocument({
      officialFeatures: [official],
      osmBridges: [bridge(1, "Jembatan Test")],
      network: network(),
      officialRetrievedAt: "2026-01-01T00:00:00.000Z",
      osmRetrievedAt: "2026-01-01T00:00:00.000Z",
    });

    const jpo = document.jpos[0];
    expect(jpo?.id).toBe("jpo:JPO-TEST-1");
    expect(jpo?.official).toBe(true);
    expect(jpo?.confidence).toBe("official-line");
    expect(jpo?.geometry).toHaveLength(2);
    expect(jpo?.stations[0]?.stationId).toBe("transjakarta:grogol-reformasi");
    expect(jpo?.stations[0]?.end).toBe("end");
  });

  it("keeps a named OSM bridge beside a stop and drops an unrelated park bridge", () => {
    const document = buildJpoDocument({
      officialFeatures: [],
      osmBridges: [
        bridge(10, "JPO Taman", 0),
        bridge(11, undefined, 0.02),
      ],
      network: network(),
      officialRetrievedAt: "2026-01-01T00:00:00.000Z",
      osmRetrievedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(document.jpos.map((jpo) => jpo.id)).toEqual(["osm:way/10"]);
    expect(document.jpos[0]?.source).toBe("osm");
    expect(document.jpos[0]?.official).toBe(false);
  });

  it("keeps an unnamed bridge only when it stands beside a stop", () => {
    const document = buildJpoDocument({
      officialFeatures: [],
      osmBridges: [bridge(20, undefined)],
      network: network(),
      officialRetrievedAt: "2026-01-01T00:00:00.000Z",
      osmRetrievedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(document.jpos).toHaveLength(1);
    expect(document.jpos[0]?.stations[0]?.stationName).toBe("Grogol Reformasi");
  });
});
