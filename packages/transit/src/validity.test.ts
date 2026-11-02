import { describe, expect, it } from "vitest";

import { isActiveAt, type Disruption } from "./types.js";

const base: Disruption = {
  id: "notice",
  source: "x:operator",
  sourceType: "social",
  systemId: "transjakarta",
  lineId: "transjakarta:9",
  stationId: null,
  stationGroupId: null,
  severity: "warning",
  status: "active",
  kind: "diversion",
  title: "Corridor 9 diverted",
  body: "",
  url: null,
  confidence: 0.9,
  publishedAt: "2026-10-23T00:00:00.000Z",
  observedAt: "2026-10-23T00:00:00.000Z",
  resolvedAt: null,
  affectedStationIds: [],
  affectedLineIds: [],
};

describe("isActiveAt", () => {
  it("uses the impact window, not the event's last day", () => {
    const notice: Disruption = {
      ...base,
      endsAt: "2026-10-25T17:00:00.000Z",
      validityWindows: [
        {
          startsAt: "2026-10-24T03:00:00+07:00",
          endsAt: "2026-10-24T09:00:00+07:00",
          timezone: "Asia/Jakarta",
          scope: { systemIds: [], lineIds: ["transjakarta:9"], stationIds: [] },
          label: "Corridor 9",
          quote: "03.00-09.00 WIB",
          evidenceUrl: "https://example.com",
          confidence: 0.95,
        },
      ],
    };
    expect(isActiveAt(notice, new Date("2026-10-24T04:00:00+07:00"))).toBe(true);
    expect(isActiveAt(notice, new Date("2026-10-24T10:00:00+07:00"))).toBe(false);
    expect(isActiveAt(notice, new Date("2026-10-25T10:00:00+07:00"))).toBe(false);
  });

  it("keeps the endsAt behaviour when no window has been verified", () => {
    const notice: Disruption = { ...base, endsAt: "2026-10-24T09:00:00+07:00" };
    expect(isActiveAt(notice, new Date("2026-10-24T08:00:00+07:00"))).toBe(true);
    expect(isActiveAt(notice, new Date("2026-10-24T10:00:00+07:00"))).toBe(false);
  });

  it("does not show an unresolved notice just because it has a start", () => {
    const notice: Disruption = { ...base, endsAt: "2026-10-24T09:00:00+07:00" };
    expect(isActiveAt(notice, new Date("2026-10-24T10:00:00+07:00"))).toBe(false);
  });
});
