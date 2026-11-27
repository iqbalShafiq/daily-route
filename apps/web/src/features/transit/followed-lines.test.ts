import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DisruptionSummary, LineSummary } from "../../lib/api.js";

import {
  FOLLOWED_LINES_KEY,
  classifyLineStatuses,
  readFollowedLines,
  toggleFollowedLine,
} from "./followed-lines.js";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

function lineOf(id: string, code: string, serviceClass = "brt"): LineSummary {
  return {
    id,
    systemId: "transjakarta",
    code,
    name: `Corridor ${code}`,
    mode: "bus",
    serviceClass,
    operator: "Transjakarta",
    status: "operating",
    color: null,
    lengthKm: null,
  };
}

function noticeOf(
  id: string,
  lineIds: string[],
  overrides: Partial<DisruptionSummary> = {},
): DisruptionSummary {
  return {
    id,
    title: `Notice ${id}`,
    body: "Body",
    severity: "warning",
    kind: "delay",
    status: "active",
    systemId: "transjakarta",
    source: "test",
    sourceType: "x",
    url: null,
    lineId: lineIds[0] ?? null,
    stationId: null,
    affectedStationIds: [],
    affectedLineIds: lineIds,
    publishedAt: "2026-11-27T05:00:00.000Z",
    observedAt: "2026-11-27T05:00:00.000Z",
    endsAt: null,
    eventKey: null,
    lastSeenAt: null,
    validityWindows: [],
    activeNow: true,
    impact: "line",
    demonstration: false,
    blocksService: false,
    viaToll: false,
    scope: "line",
    stations: [],
    lines: lineIds.map((id, index) => ({
      id,
      code: `${index + 1}`,
      name: `Line ${index + 1}`,
      systemId: "transjakarta",
    })),
    lineCodes: [],
    roads: [],
    latitude: null,
    longitude: null,
    stationName: null,
    ...overrides,
  };
}

describe("followed lines", () => {
  it("adds a line once and removes it again", () => {
    expect(toggleFollowedLine("transjakarta:1")).toEqual(["transjakarta:1"]);
    expect(toggleFollowedLine("transjakarta:1")).toEqual([]);
    expect(readFollowedLines()).toEqual([]);
  });

  it("keeps the newest line first and ignores an empty id", () => {
    toggleFollowedLine("transjakarta:1");
    toggleFollowedLine("transjakarta:2");
    toggleFollowedLine("  ");
    expect(readFollowedLines()).toEqual(["transjakarta:2", "transjakarta:1"]);
    expect(JSON.parse(localStorage.getItem(FOLLOWED_LINES_KEY) ?? "[]")).toEqual([
      "transjakarta:2",
      "transjakarta:1",
    ]);
  });
});

describe("classifyLineStatuses", () => {
  const lines = [
    lineOf("transjakarta:1", "1"),
    lineOf("transjakarta:2", "2"),
    lineOf("transjakarta:3", "3"),
  ];

  it("reads the worst active notice for each line", () => {
    const notices = [
      noticeOf("a", ["transjakarta:1"], { severity: "severe" }),
      noticeOf("b", ["transjakarta:2"], { severity: "warning", kind: "delay" }),
    ];
    const result = classifyLineStatuses(lines, notices);
    expect(result.byLine["transjakarta:1"]?.status).toBe("terganggu");
    expect(result.byLine["transjakarta:2"]?.status).toBe("tersendat");
    expect(result.byLine["transjakarta:3"]?.status).toBe("lancar");
    expect(result.counts).toEqual({ lancar: 1, tersendat: 1, terganggu: 1 });
  });

  it("ignores an inactive notice and a stop notice", () => {
    const notices = [
      noticeOf("closed", ["transjakarta:1"], { activeNow: false }),
      noticeOf("stop", [], { scope: "stop", stationId: "transjakarta:blok-m" }),
    ];
    const result = classifyLineStatuses(lines, notices);
    expect(result.counts).toEqual({ lancar: 3, tersendat: 0, terganggu: 0 });
    expect(result.byLine["transjakarta:1"]?.notices).toEqual([]);
  });

  it("marks an operator's lines when the notice is network wide", () => {
    const result = classifyLineStatuses(lines, [
      noticeOf("network", [], {
        scope: "network",
        severity: "warning",
        systemId: "transjakarta",
      }),
    ]);
    expect(result.counts).toEqual({ lancar: 0, tersendat: 3, terganggu: 0 });
  });

  it("ignores a labelled sample that is not a live feed row", () => {
    const result = classifyLineStatuses(lines, [
      noticeOf("contoh:demo", ["transjakarta:1"], { severity: "critical" }),
    ]);
    expect(result.byLine["transjakarta:1"]?.status).toBe("lancar");
  });
});
