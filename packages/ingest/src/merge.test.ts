import { describe, expect, it } from "vitest";

import type { FareRules } from "@daily-route/transit";

import type { CuratedLine } from "./curated.js";
import { mergeNetwork } from "./merge.js";

const rules = { modes: {}, integrations: [], holidays: [] } as FareRules;

function line(oneWay: boolean): CuratedLine {
  return {
    sourceKey: "transjakarta-angkutan-pengumpan",
    code: "7R",
    name: "Cibubur - Pluit",
    operator: "Bayu Holong Persada (MBT)",
    lengthKm: null,
    status: "operating",
    serviceClass: "non-brt",
    description: "",
    sources: ["https://smk.transjakarta.co.id/aset/berkas/rute/7R-20260922.jpeg"],
    ...(oneWay ? { oneWay: true } : {}),
    stations: [
      { name: "Simpang Kuningan", latitude: -6.2374529, longitude: 106.8278079 },
      { name: "Denpasar", latitude: -6.2332382, longitude: 106.8217725 },
      { name: "Kali Grogol", latitude: -6.1610798, longitude: 106.7903715 },
    ],
  };
}

describe("a one-way official sheet", () => {
  it("keeps the published direction and does not mirror a return", () => {
    const network = mergeNetwork({ curated: [line(true)], fareRules: rules, osmRoutes: [] });
    const stops = network.lineStops.filter((stop) => stop.lineId === "transjakarta:7r");
    expect(stops.map((stop) => stop.direction)).toEqual(["forward", "forward", "forward"]);
    expect(network.lineGeometries.some((geometry) => geometry.lineId === "transjakarta:7r" && geometry.direction === "backward")).toBe(false);
  });

  it("still mirrors a line the operator runs both ways", () => {
    const network = mergeNetwork({ curated: [line(false)], fareRules: rules, osmRoutes: [] });
    const directions = new Set(
      network.lineStops.filter((stop) => stop.lineId === "transjakarta:7r").map((stop) => stop.direction),
    );
    expect(directions).toEqual(new Set(["forward", "backward"]));
  });

  it("finds the return when its stop members start at the wrong end", () => {
    // A relation can have a stop_entry_only member first and omit it from
    // the plain `stop` list; the old check then saw the wrong end and
    // mirrored the outbound road. The path starts at the real origin.
    const outbound = route({
      relationId: 1,
      from: "Simpang Kuningan",
      to: "Kali Grogol",
      stops: [stop(1, "Simpang Kuningan", -6.2374529, 106.8278079), stop(2, "Kali Grogol", -6.1610798, 106.7903715)],
      polyline: [
        { latitude: -6.2374529, longitude: 106.8278079 },
        { latitude: -6.2, longitude: 106.86 },
        { latitude: -6.1610798, longitude: 106.7903715 },
      ],
    });
    const inbound = route({
      relationId: 2,
      from: "Kali Grogol",
      to: "Simpang Kuningan",
      stops: [stop(3, "Simpang Kuningan", -6.2374529, 106.8278079), stop(4, "Kali Grogol", -6.1610798, 106.7903715)],
      polyline: [
        { latitude: -6.1610798, longitude: 106.7903715 },
        { latitude: -6.2, longitude: 106.75 },
        { latitude: -6.2374529, longitude: 106.8278079 },
      ],
    });
    const network = mergeNetwork({
      curated: [line(false)],
      fareRules: rules,
      osmRoutes: [outbound, inbound],
    });
    const backward = network.lineGeometries.find(
      (geometry) => geometry.lineId === "transjakarta:7r" && geometry.direction === "backward",
    );
    expect(backward?.coordinates).toContain(106.75);
    expect(backward?.coordinates).not.toContain(106.86);
  });

  it("keeps the return on its own road", () => {
    const outbound = route({
      relationId: 1,
      from: "Simpang Kuningan",
      to: "Kali Grogol",
      stops: [stop(1, "Simpang Kuningan", -6.2374529, 106.8278079), stop(2, "Kali Grogol", -6.1610798, 106.7903715)],
      polyline: [
        { latitude: -6.2374529, longitude: 106.8278079 },
        { latitude: -6.2, longitude: 106.86 },
        { latitude: -6.1610798, longitude: 106.7903715 },
      ],
    });
    const inbound = route({
      relationId: 2,
      from: "Kali Grogol",
      to: "Simpang Kuningan",
      stops: [stop(3, "Kali Grogol", -6.1610798, 106.7903715), stop(4, "Simpang Kuningan", -6.2374529, 106.8278079)],
      polyline: [
        { latitude: -6.1610798, longitude: 106.7903715 },
        { latitude: -6.2, longitude: 106.75 },
        { latitude: -6.2374529, longitude: 106.8278079 },
      ],
    });
    const network = mergeNetwork({
      curated: [line(false)],
      fareRules: rules,
      osmRoutes: [outbound, inbound],
    });
    const geometries = network.lineGeometries.filter((geometry) => geometry.lineId === "transjakarta:7r");
    const forward = geometries.find((geometry) => geometry.direction === "forward");
    const backward = geometries.find((geometry) => geometry.direction === "backward");
    expect(forward?.coordinates).toContain(106.86);
    expect(backward?.coordinates).toContain(106.75);
    expect(backward?.coordinates).not.toContain(106.86);
  });
});

function stop(nodeId: number, name: string, latitude: number, longitude: number) {
  return {
    nodeId,
    name,
    latitude,
    longitude,
    code: null,
    localRef: null,
    routeRefs: [],
    tags: {},
    wikidata: null,
    wikipedia: null,
    street: null,
  };
}

function route(input: {
  relationId: number;
  from: string;
  to: string;
  stops: ReturnType<typeof stop>[];
  polyline: { latitude: number; longitude: number }[];
}) {
  return {
    relationId: input.relationId,
    systemId: "transjakarta" as const,
    code: "7R",
    rawName: "Transjakarta 7R",
    routeName: `${input.from} → ${input.to}`,
    from: input.from,
    to: input.to,
    via: null,
    colour: null,
    operator: null,
    stops: input.stops,
    polyline: input.polyline,
  };
}
