import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DisruptionSummary, PersonalAlert } from "../../lib/api.js";
import type { RoutineRecord } from "../route-planner/live-trip.js";

import {
  INBOX_READ_KEY,
  buildInboxItems,
  filterInboxItems,
  groupInboxItems,
  markInboxRead,
  readInboxReadIds,
  unreadInboxCount,
} from "./inbox-items.js";

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

function noticeOf(
  id: string,
  publishedAt: string,
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
    lineId: null,
    stationId: null,
    affectedStationIds: [],
    affectedLineIds: [],
    publishedAt,
    observedAt: publishedAt,
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
    lines: [],
    lineCodes: [],
    roads: [],
    latitude: null,
    longitude: null,
    stationName: null,
    ...overrides,
  };
}

function routineOf(overrides: Partial<RoutineRecord> = {}): RoutineRecord {
  return {
    id: "routine-1",
    originName: "Blok M",
    destinationName: "Kota",
    origin: null,
    destination: null,
    departureTime: "07:10",
    createdAt: "2026-11-20T00:00:00.000Z",
    ...overrides,
  };
}

const NOW = new Date("2026-11-27T04:00:00.000Z");

describe("buildInboxItems", () => {
  it("groups today and earlier rows and keeps the newest first", () => {
    const notices = [
      noticeOf("today-old", "2026-11-27T01:00:00.000Z"),
      noticeOf("today-new", "2026-11-27T03:00:00.000Z"),
      noticeOf("yesterday", "2026-11-26T03:00:00.000Z"),
    ];
    const items = buildInboxItems({
      notices,
      personalAlerts: [],
      routines: [],
      readIds: [],
      now: NOW,
    });

    expect(items.map((item) => item.id)).toEqual([
      "notice:today-new",
      "notice:today-old",
      "notice:yesterday",
    ]);
    const groups = groupInboxItems(items);
    expect(groups.map((group) => group.group)).toEqual(["Hari ini", "Sebelumnya"]);
    expect(groups[0]?.items).toHaveLength(2);
    expect(groups[1]?.items).toHaveLength(1);
  });

  it("ignores an inactive notice and a labelled sample", () => {
    const items = buildInboxItems({
      notices: [
        noticeOf("inactive", "2026-11-27T01:00:00.000Z", { activeNow: false }),
        noticeOf("contoh:demo", "2026-11-27T02:00:00.000Z"),
      ],
      personalAlerts: [],
      routines: [],
      readIds: [],
      now: NOW,
    });
    expect(items).toEqual([]);
  });

  it("builds a reminder from a saved usual journey without duplicating its routine", () => {
    const alerts: PersonalAlert[] = [
      {
        habit: {
          originName: "Blok M",
          destinationName: "Kota",
          originLabel: null,
          destinationLabel: null,
          count: 4,
        },
        notices: [{ id: "today-new", title: "Notice today-new" }],
      },
    ];
    const items = buildInboxItems({
      notices: [noticeOf("today-new", "2026-11-27T03:00:00.000Z")],
      personalAlerts: alerts,
      routines: [routineOf()],
      readIds: [],
      now: NOW,
    });

    const reminders = filterInboxItems(items, "reminder");
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({
      id: "alert:Blok M>Kota",
      kind: "reminder",
      routineId: "routine-1",
      noticeId: "today-new",
    });
    expect(filterInboxItems(items, "disruption")).toHaveLength(1);
  });

  it("turns a routine with a departure clock into a today reminder", () => {
    const items = buildInboxItems({
      notices: [],
      personalAlerts: [],
      routines: [routineOf()],
      readIds: [],
      now: NOW,
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "routine:routine-1",
      group: "Hari ini",
      at: "2026-11-27T07:10:00+07:00",
    });
  });

  it("marks the rows the rider already read and counts the rest", () => {
    const items = buildInboxItems({
      notices: [
        noticeOf("a", "2026-11-27T01:00:00.000Z"),
        noticeOf("b", "2026-11-27T02:00:00.000Z"),
      ],
      personalAlerts: [],
      routines: [],
      readIds: ["notice:a"],
      now: NOW,
    });
    expect(unreadInboxCount(items)).toBe(1);
    expect(items.find((item) => item.id === "notice:a")?.read).toBe(true);
  });
});

describe("markInboxRead", () => {
  it("keeps the ids once and survives a second call", () => {
    expect(markInboxRead(["notice:a"])).toEqual(["notice:a"]);
    expect(markInboxRead(["notice:b", "notice:a"])).toEqual(["notice:b", "notice:a"]);
    expect(readInboxReadIds()).toEqual(["notice:b", "notice:a"]);
    expect(JSON.parse(localStorage.getItem(INBOX_READ_KEY) ?? "[]")).toEqual([
      "notice:b",
      "notice:a",
    ]);
  });
});
