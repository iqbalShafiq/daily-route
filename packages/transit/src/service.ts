import { isNationalHoliday } from "./calendar.js";
import type { Direction, Line, LineService, LineServiceWindow } from "./types.js";

/**
 * What the published service calendar says about a line at one instant.
 *
 * The planner does not invent a departure. It uses the operator's windows
 * when the feed is complete enough to trust them, and labels the result as
 * a scheduled window rather than a live arrival.
 */
export type ServiceState = {
  /** The line runs at this minute according to the operator feed. */
  active: boolean;
  /** The window is complete enough to remove a journey outside it. */
  reliable: boolean;
  /** The shortest scheduled headway among the windows covering the minute. */
  headwayMinMinutes: number | null;
  /** The longest scheduled headway among the windows covering the minute. */
  headwayMaxMinutes: number | null;
  /** Half the shortest headway, or null when there is no usable row. */
  waitMinutes: number | null;
  /** A rider-facing label, for a chip. */
  label: string;
  /** The time span of the line today, for a secondary line. */
  detail: string | null;
  /** The first and last scheduled minute of the day. */
  firstMinute: number | null;
  lastMinute: number | null;
  /** The requested instant falls in the night window (22:00–05:00). */
  night: boolean;
};

/** Read the service metadata from a line without trusting unknown JSON. */
export function serviceOfLine(line: Line): LineService | null {
  const raw = line.metadata?.["service"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (record["source"] !== "gtfs" && record["source"] !== "temporary") return null;
  const rawDirections = record["byDirection"];
  if (!rawDirections || typeof rawDirections !== "object" || Array.isArray(rawDirections)) return null;
  const byDirection: LineService["byDirection"] = {};
  const reliableByDirection: LineService["reliableByDirection"] = {};
  for (const direction of ["forward", "backward"] as const) {
    const rows = (rawDirections as Record<string, unknown>)[direction];
    if (!Array.isArray(rows)) continue;
    const windows: LineServiceWindow[] = [];
    for (const entry of rows) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const row = entry as Record<string, unknown>;
      const startMinute = finite(row["startMinute"]);
      const endMinute = finite(row["endMinute"]);
      const headwayMinutes = finite(row["headwayMinutes"]);
      const days = Array.isArray(row["days"])
        ? row["days"].filter((day): day is number => Number.isInteger(day) && day >= 1 && day <= 7)
        : [];
      if (startMinute === null || endMinute === null || headwayMinutes === null) continue;
      if (days.length === 0 || headwayMinutes <= 0) continue;
      windows.push({
        days,
        startMinute,
        endMinute,
        headwayMinutes,
        ...(row["exactTimes"] === true ? { exactTimes: true } : {}),
        ...(row["estimated"] === true ? { estimated: true } : {}),
      });
    }
    if (windows.length > 0) {
      byDirection[direction] = windows;
      reliableByDirection[direction] = (record["reliableByDirection"] as Record<string, unknown> | undefined)?.[direction] === true;
    }
  }
  if (Object.keys(byDirection).length === 0) return null;
  return {
    source: record["source"],
    timezone: "Asia/Jakarta",
    byDirection,
    reliableByDirection,
    ...(typeof record["validFrom"] === "string" ? { validFrom: record["validFrom"] } : {}),
    ...(typeof record["validUntil"] === "string" ? { validUntil: record["validUntil"] } : {}),
    updatedAt: typeof record["updatedAt"] === "string" ? record["updatedAt"] : "",
  };
}

/** The local Jakarta minute and ISO weekday of an instant. */
export function jakartaClock(at: Date): { minute: number; weekday: number; night: boolean } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(at);
  const value = (type: string): string => parts.find((part) => part.type === type)?.value ?? "0";
  const hour = Number(value("hour"));
  const minute = Number(value("minute"));
  const names: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return {
    minute: hour * 60 + minute,
    weekday: names[value("weekday")] ?? 1,
    night: hour >= 22 || hour < 5,
  };
}

/**
 * Whether one feed row is a complete schedule rather than a template.
 *
 * A full-day row (at least four hours) with a plausible headway is trusted
 * for any line: 9A's 05:00-22:00 return is real. A short row is trusted only
 * for a curated one-way service: 7R is 05:00-06:00 with two published
 * Cibubur departures. 10H is the counter-example: its return row is only
 * 05:00-07:00 while the official service runs 05:00-22:00 daily, so the
 * short row is incomplete context and must not close the direction at 07:00.
 */
export function serviceWindowsAreReliable(
  windows: readonly LineServiceWindow[],
  oneWay = false,
): boolean {
  if (windows.length !== 1) return false;
  const window = windows[0];
  if (!window || window.headwayMinutes <= 0 || window.headwayMinutes > 90) return false;
  const span = window.endMinute - window.startMinute;
  return span >= 240 || (oneWay && span >= 60);
}

/** The service state of one direction at one instant. */
export function serviceAt(line: Line, direction: Direction, at: Date): ServiceState | null {
  const service = serviceOfLine(line);
  if (!service) return null;
  const windows = service.byDirection[direction];
  if (!windows || windows.length === 0) return null;
  const validFrom = service.validFrom ? Date.parse(service.validFrom) : null;
  const validUntil = service.validUntil ? Date.parse(service.validUntil) : null;
  const requested = at.getTime();
  if (
    (validFrom !== null && !Number.isNaN(validFrom) && requested < validFrom) ||
    (validUntil !== null && !Number.isNaN(validUntil) && requested > validUntil)
  ) {
    return {
      active: false,
      reliable: true,
      headwayMinMinutes: null,
      headwayMaxMinutes: null,
      waitMinutes: null,
      label: "Not in service",
      detail: null,
      firstMinute: null,
      lastMinute: null,
      night: false,
    };
  }
  const reliable =
    service.reliableByDirection[direction] === true ||
    serviceWindowsAreReliable(windows, line.metadata?.["oneWay"] === true);
  const clock = jakartaClock(at);
  const holiday = isNationalHoliday(at);
  const hasSunday = windows.some((window) => window.days.includes(7));
  const day = holiday && hasSunday ? 7 : clock.weekday;
  const today = windows.filter((window) => window.days.includes(day));
  const firstMinute = today.length > 0 ? Math.min(...today.map((window) => window.startMinute)) : null;
  const lastMinute = today.length > 0 ? Math.max(...today.map((window) => window.endMinute)) : null;
  const detail =
    firstMinute !== null && lastMinute !== null
      ? `${minutesLabel(firstMinute)}–${minutesLabel(lastMinute)} WIB`
      : null;

  if (!reliable) {
    return {
      active: true,
      reliable: false,
      headwayMinMinutes: null,
      headwayMaxMinutes: null,
      waitMinutes: null,
      label: today.length > 0 ? "Schedule not confirmed" : "No confirmed schedule",
      detail,
      firstMinute,
      lastMinute,
      night: clock.night,
    };
  }

  const covering = today.filter(
    (window) => clock.minute >= window.startMinute && clock.minute <= window.endMinute,
  );
  if (covering.length === 0) {
    return {
      active: false,
      reliable: true,
      headwayMinMinutes: null,
      headwayMaxMinutes: null,
      waitMinutes: null,
      label: "No service now",
      detail,
      firstMinute,
      lastMinute,
      night: clock.night,
    };
  }

  const range = headways(covering);
  const estimated = covering.some((window) => window.estimated === true);
  return {
    active: true,
    reliable: true,
    headwayMinMinutes: range.min,
    headwayMaxMinutes: range.max,
    waitMinutes: range.median / 2,
    label: `${frequencyLabel(range.median, range.min, range.max)}${estimated ? " · estimated" : ""}`,
    detail,
    firstMinute,
    lastMinute,
    night: clock.night,
  };
}

/** Whether the line should be removed from the graph at this instant. */
export function lineRunsAt(line: Line, direction: Direction, at: Date): boolean {
  const state = serviceAt(line, direction, at);
  return state === null || !state.reliable || state.active;
}

/** A rider-facing frequency chip. */
export function frequencyLabel(medianMinutes: number, minMinutes: number, maxMinutes: number): string {
  const band =
    medianMinutes <= 5
      ? "Very frequent"
      : medianMinutes <= 10
        ? "Frequent"
        : medianMinutes <= 15
          ? "Regular"
          : medianMinutes <= 25
            ? "Infrequent"
            : "Rare";
  const every =
    Math.round(minMinutes) === Math.round(maxMinutes)
      ? `every ${Math.round(medianMinutes)} min`
      : `about every ${Math.round(medianMinutes)} min · ${Math.round(minMinutes)}–${Math.round(maxMinutes)} min range`;
  return `${band} · ${every}`;
}

function headways(windows: readonly LineServiceWindow[]): { min: number; max: number; median: number } {
  const values = windows.map((window) => window.headwayMinutes).sort((a, b) => a - b);
  return {
    min: values[0] ?? 0,
    max: values[values.length - 1] ?? values[0] ?? 0,
    median: values[Math.floor(values.length / 2)] ?? values[0] ?? 0,
  };
}

function minutesLabel(minute: number): string {
  const normalized = ((minute % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
