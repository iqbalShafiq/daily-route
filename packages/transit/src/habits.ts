/**
 * The rider's usual journeys, derived from the journeys they planned.
 *
 * Nothing here is stored or promised: a habit is a description of what the
 * rider did, and the planner still decides whether a line runs. The module is
 * pure so the rule can be tested exactly, and it has no database dependency.
 */

export type HabitObservation = {
  originKey: string;
  destinationKey: string;
  originName: string;
  destinationName: string;
  originLabel: string | null;
  destinationLabel: string | null;
  lineCodes: string[];
  weekday: number;
  minuteOfDay: number;
  at: string;
};

export type TravelHabit = {
  originKey: string;
  destinationKey: string;
  originName: string;
  destinationName: string;
  originLabel: string | null;
  destinationLabel: string | null;
  lineCodes: string[];
  weekday: number;
  minuteOfDay: number;
  count: number;
  /**
   * The window around the median minute, inside one day.
   *
   * Both values are 0–1439. A window whose start is later than its end
   * crosses midnight (`windowStart > windowEnd`), so a reader tests two
   * comparisons instead of one.
   */
  windowStart: number;
  windowEnd: number;
};

export type HabitNotice = {
  id: string;
  title: string;
  lineCodes: string[];
  stationIds: string[];
  scope: "stop" | "line" | "network" | "unknown";
};

const MINUTES_PER_DAY = 24 * 60;
const HABIT_WINDOW_MINUTES = 45;
const HABIT_MIN_OBSERVATIONS = 3;
const HABIT_LOOKBACK_DAYS = 28;
const MAX_HABITS = 4;

import { jakartaClock } from "./service.js";

/**
 * The weekday and minute in Jakarta, from an instant.
 *
 * `jakartaClock` in `service.ts` uses ISO weekdays (Monday 1, Sunday 7); the
 * rider's observations use 0 for Sunday to 6 for Saturday, so the two cannot
 * be confused by a caller.
 */
export function jakartaDayClock(now: Date): { weekday: number; minuteOfDay: number } {
  const clock = jakartaClock(now);
  return { weekday: clock.weekday % 7, minuteOfDay: clock.minute };
}

/**
 * Derive the usual journeys from a list of observations.
 *
 * A group is one origin, destination and weekday. Three observations make a
 * habit; one or two are still just trips. Only the last 28 days count, so an
 * old commute fades instead of defining the rider forever.
 */
export function habitsFrom(observations: HabitObservation[], now: Date): TravelHabit[] {
  const cutoff = now.getTime() - HABIT_LOOKBACK_DAYS * 24 * 60 * 60_000;
  const groups = new Map<string, HabitObservation[]>();

  for (const observation of observations) {
    const at = Date.parse(observation.at);
    if (!Number.isFinite(at) || at < cutoff) continue;
    if (
      !Number.isInteger(observation.weekday) ||
      observation.weekday < 0 ||
      observation.weekday > 6
    ) {
      continue;
    }
    if (
      !Number.isInteger(observation.minuteOfDay) ||
      observation.minuteOfDay < 0 ||
      observation.minuteOfDay > MINUTES_PER_DAY - 1
    ) {
      continue;
    }
    const key = `${observation.originKey}\u0000${observation.destinationKey}\u0000${observation.weekday}`;
    const group = groups.get(key);
    if (group) {
      group.push(observation);
    } else {
      groups.set(key, [observation]);
    }
  }

  const habits: TravelHabit[] = [];
  for (const group of groups.values()) {
    if (group.length < HABIT_MIN_OBSERVATIONS) continue;

    const minutes = group
      .map((observation) => observation.minuteOfDay)
      .sort((left, right) => left - right);
    const median = medianOf(minutes);
    const newestFirst = [...group].sort(
      (left, right) => Date.parse(right.at) - Date.parse(left.at),
    );
    const first = newestFirst[0];
    if (!first) continue;

    const lineCodes: string[] = [];
    const seen = new Set<string>();
    for (const observation of group) {
      for (const code of observation.lineCodes) {
        if (code.length === 0 || seen.has(code)) continue;
        seen.add(code);
        lineCodes.push(code);
      }
    }
    lineCodes.sort();

    habits.push({
      originKey: first.originKey,
      destinationKey: first.destinationKey,
      originName: first.originName,
      destinationName: first.destinationName,
      originLabel: latestLabel(newestFirst, "originLabel"),
      destinationLabel: latestLabel(newestFirst, "destinationLabel"),
      lineCodes,
      weekday: first.weekday,
      minuteOfDay: median,
      count: group.length,
      // The window crosses midnight when the median is near either end of
      // the day; bringing both ends into the day keeps the stored value
      // readable, and `windowStart > windowEnd` is the crossing test.
      windowStart: modulo(median - HABIT_WINDOW_MINUTES, MINUTES_PER_DAY),
      windowEnd: modulo(median + HABIT_WINDOW_MINUTES, MINUTES_PER_DAY),
    });
  }

  return habits
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.weekday - right.weekday ||
        left.minuteOfDay - right.minuteOfDay ||
        left.originName.localeCompare(right.originName),
    )
    .slice(0, MAX_HABITS);
}

/**
 * The notices that touch a habit while the rider is in its window.
 *
 * A network-wide notice always touches a journey. A stop or line notice
 * touches it only when it shares a corridor code or names one of the two
 * ends. A notice whose scope is unknown is not proven to touch anything, so
 * it is not shown here.
 */
export function noticesForHabit(
  habit: TravelHabit,
  notices: HabitNotice[],
  now: Date,
): HabitNotice[] {
  const clock = jakartaDayClock(now);
  if (clock.weekday !== habit.weekday) return [];
  if (!insideWindow(clock.minuteOfDay, habit.windowStart, habit.windowEnd)) return [];

  const codes = new Set(habit.lineCodes);
  return notices.filter((notice) => {
    if (notice.scope === "unknown") return false;
    if (notice.scope === "network") return true;
    if (notice.lineCodes.some((code) => codes.has(code))) return true;
    return notice.stationIds.some(
      (stationId) => stationId === habit.originKey || stationId === habit.destinationKey,
    );
  });
}

function insideWindow(minute: number, start: number, end: number): boolean {
  return start <= end ? minute >= start && minute <= end : minute >= start || minute <= end;
}

function medianOf(sorted: number[]): number {
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  const left = sorted[middle - 1] ?? 0;
  const right = sorted[middle] ?? left;
  return Math.round((left + right) / 2);
}

function latestLabel(
  newestFirst: HabitObservation[],
  field: "originLabel" | "destinationLabel",
): string | null {
  for (const observation of newestFirst) {
    const label = observation[field];
    if (label !== null && label.trim().length > 0) return label;
  }
  return null;
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
