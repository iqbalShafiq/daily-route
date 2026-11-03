import { describe, expect, it } from "vitest";

import {
  habitsFrom,
  jakartaDayClock,
  noticesForHabit,
  type HabitNotice,
  type HabitObservation,
  type TravelHabit,
} from "./habits.js";

/**
 * The habit rules, exactly.
 *
 * These are pure functions, so the test states the boundaries the API and the
 * agent rely on: three observations, a median window, a 28-day memory, and a
 * notice that matches only inside the window.
 */

const NOW = new Date("2026-11-03T01:00:00Z"); // Tuesday, 08:00 WIB.

function observation(overrides: Partial<HabitObservation> = {}): HabitObservation {
  return {
    originKey: "transjakarta:origin",
    destinationKey: "transjakarta:destination",
    originName: "Origin",
    destinationName: "Destination",
    originLabel: null,
    destinationLabel: null,
    lineCodes: ["9"],
    weekday: 2,
    minuteOfDay: 480,
    at: "2026-10-27T01:00:00Z",
    ...overrides,
  };
}

function habit(overrides: Partial<TravelHabit> = {}): TravelHabit {
  return {
    originKey: "transjakarta:origin",
    destinationKey: "transjakarta:destination",
    originName: "Origin",
    destinationName: "Destination",
    originLabel: null,
    destinationLabel: null,
    lineCodes: ["9"],
    weekday: 2,
    minuteOfDay: 480,
    count: 3,
    windowStart: 435,
    windowEnd: 525,
    ...overrides,
  };
}

function notice(overrides: Partial<HabitNotice> = {}): HabitNotice {
  return {
    id: "notice",
    title: "A notice",
    lineCodes: [],
    stationIds: [],
    scope: "network",
    ...overrides,
  };
}

describe("jakartaDayClock", () => {
  it("uses Sunday = 0 and the Jakarta minute", () => {
    expect(jakartaDayClock(NOW)).toEqual({ weekday: 2, minuteOfDay: 480 });
    // 2026-11-08 is a Sunday; 17:30 UTC is 00:30 on Monday in Jakarta, which
    // is the boundary the observation weekday has to get right.
    expect(jakartaDayClock(new Date("2026-11-08T17:30:00Z"))).toEqual({
      weekday: 1,
      minuteOfDay: 30,
    });
  });
});

describe("habitsFrom", () => {
  it("needs three observations in one group and takes the median minute", () => {
    const observations = [
      observation({ minuteOfDay: 470, at: "2026-10-20T01:00:00Z" }),
      observation({ minuteOfDay: 480, at: "2026-10-27T01:00:00Z" }),
      observation({ minuteOfDay: 490, at: "2026-11-03T01:00:00Z" }),
    ];

    const habits = habitsFrom(observations, NOW);
    expect(habits).toHaveLength(1);
    expect(habits[0]?.count).toBe(3);
    expect(habits[0]?.minuteOfDay).toBe(480);
    expect(habits[0]?.windowStart).toBe(435);
    expect(habits[0]?.windowEnd).toBe(525);

    expect(habitsFrom(observations.slice(0, 2), NOW)).toEqual([]);
  });

  it("forgets an observation older than 28 days", () => {
    const observations = [
      observation({ at: "2026-09-01T01:00:00Z" }),
      observation({ at: "2026-10-27T01:00:00Z" }),
      observation({ at: "2026-11-03T01:00:00Z" }),
    ];
    expect(habitsFrom(observations, NOW)).toEqual([]);
  });

  it("keeps the latest non-null labels and the union of the line codes", () => {
    const observations = [
      observation({ originLabel: "Rumah", lineCodes: ["9"], at: "2026-10-20T01:00:00Z" }),
      observation({ originLabel: null, lineCodes: ["9", "5N"], at: "2026-10-27T01:00:00Z" }),
      observation({ originLabel: "Home", lineCodes: ["5N"], at: "2026-11-03T01:00:00Z" }),
    ];

    const habits = habitsFrom(observations, NOW);
    expect(habits[0]?.originLabel).toBe("Home");
    expect(habits[0]?.destinationLabel).toBeNull();
    expect(habits[0]?.lineCodes).toEqual(["5N", "9"]);
  });

  it("sorts by count and keeps at most four habits", () => {
    const observations: HabitObservation[] = [];
    for (let index = 0; index < 5; index += 1) {
      const count = 6 - index;
      for (let repeat = 0; repeat < count; repeat += 1) {
        observations.push(
          observation({
            destinationKey: `destination-${index}`,
            minuteOfDay: 480 + index * 10,
          }),
        );
      }
    }

    const habits = habitsFrom(observations, NOW);
    expect(habits).toHaveLength(4);
    expect(habits.map((entry) => entry.count)).toEqual([6, 5, 4, 3]);
  });

  it("stores a window that crosses midnight as a wrapping pair", () => {
    const observations = [
      observation({ minuteOfDay: 0 }),
      observation({ minuteOfDay: 5 }),
      observation({ minuteOfDay: 10 }),
    ];
    const habits = habitsFrom(observations, NOW);
    expect(habits[0]?.minuteOfDay).toBe(5);
    expect(habits[0]?.windowStart).toBe(1_400);
    expect(habits[0]?.windowEnd).toBe(50);
  });
});

describe("noticesForHabit", () => {
  it("matches a network notice, a shared line and an endpoint station", () => {
    const notices = [
      notice({ id: "network", scope: "network" }),
      notice({ id: "unknown", scope: "unknown" }),
      notice({ id: "line", scope: "line", lineCodes: ["9"] }),
      notice({ id: "other-line", scope: "line", lineCodes: ["7"] }),
      notice({ id: "station", scope: "stop", stationIds: ["transjakarta:destination"] }),
      notice({ id: "other-station", scope: "stop", stationIds: ["somewhere-else"] }),
    ];

    expect(noticesForHabit(habit(), notices, NOW).map((entry) => entry.id)).toEqual([
      "network",
      "line",
      "station",
    ]);
  });

  it("does not match outside the window or on another weekday", () => {
    const notices = [notice({ id: "network", scope: "network" })];

    // 09:00 WIB is outside 07:15–08:45.
    expect(noticesForHabit(habit(), notices, new Date("2026-11-03T02:00:00Z"))).toEqual([]);
    // Monday.
    expect(noticesForHabit(habit(), notices, new Date("2026-11-02T01:00:00Z"))).toEqual([]);
    // The edge of the window is inside it.
    expect(noticesForHabit(habit(), notices, new Date("2026-11-03T00:15:00Z"))).toHaveLength(1);
  });

  it("reads a wrapping window as two comparisons", () => {
    const midnight = habit({ minuteOfDay: 5, windowStart: 1_400, windowEnd: 50 });
    const notices = [notice({ id: "network", scope: "network" })];

    // 00:10 WIB Tuesday.
    expect(noticesForHabit(midnight, notices, new Date("2026-11-02T17:10:00Z"))).toHaveLength(1);
    expect(noticesForHabit(midnight, notices, new Date("2026-11-03T05:00:00Z"))).toEqual([]);
  });
});
