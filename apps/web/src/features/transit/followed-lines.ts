import { useCallback, useEffect, useState } from "react";

import type { DisruptionSummary, LineSummary } from "../../lib/api.js";

/**
 * The corridors the rider chose to follow.
 *
 * This is browser memory, not an account: the list is a local preference the
 * line board reads to put the followed corridors first. It never hides a
 * line and it never claims to send a notification.
 */

export const FOLLOWED_LINES_KEY = "daily-route.followed-lines";
const FOLLOWED_LINES_EVENT = "daily-route:followed-lines-changed";
const MAX_FOLLOWED = 32;

function storage(): Storage | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function readStored(): string[] {
  const store = storage();
  if (!store) return [];
  try {
    const raw = store.getItem(FOLLOWED_LINES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .slice(0, MAX_FOLLOWED);
  } catch {
    return [];
  }
}

function announce(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(FOLLOWED_LINES_EVENT));
}

export function readFollowedLines(): string[] {
  return readStored();
}

/** Add or remove a line id and return the list after the change. */
export function toggleFollowedLine(lineId: string): string[] {
  const trimmed = lineId.trim();
  if (trimmed.length === 0) return readStored();
  const current = readStored();
  const next = current.includes(trimmed)
    ? current.filter((id) => id !== trimmed)
    : [trimmed, ...current].slice(0, MAX_FOLLOWED);
  const store = storage();
  if (store) {
    try {
      store.setItem(FOLLOWED_LINES_KEY, JSON.stringify(next));
    } catch {
      // A private window may refuse the write. The list stays in memory.
      return next;
    }
  }
  announce();
  return next;
}

export function useFollowedLines(): {
  followed: readonly string[];
  isFollowed: (lineId: string) => boolean;
  toggle: (lineId: string) => void;
} {
  const [followed, setFollowed] = useState<string[]>(() => readStored());

  useEffect(() => {
    const sync = (): void => setFollowed(readStored());
    window.addEventListener(FOLLOWED_LINES_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(FOLLOWED_LINES_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggle = useCallback((lineId: string): void => {
    setFollowed(toggleFollowedLine(lineId));
  }, []);

  return {
    followed,
    isFollowed: (lineId: string) => followed.includes(lineId),
    toggle,
  };
}

/* -------------------------------------------------------------------------
 * Line status
 * ---------------------------------------------------------------------- */

export type LineStatus = "lancar" | "tersendat" | "terganggu";

export type LineStatusInfo = {
  status: LineStatus;
  /** The active notices that decide the status, newest first. */
  notices: DisruptionSummary[];
};

export type LineStatusCounts = Record<LineStatus, number>;

export const LINE_STATUS_LABEL: Record<LineStatus, string> = {
  lancar: "Lancar",
  tersendat: "Tersendat",
  terganggu: "Terganggu",
};

const STATUS_ORDER: Record<LineStatus, number> = {
  lancar: 0,
  tersendat: 1,
  terganggu: 2,
};

function severityOf(notice: DisruptionSummary): LineStatus {
  if (notice.severity === "severe" || notice.severity === "critical") return "terganggu";
  if (
    notice.kind === "closure" ||
    notice.kind === "diversion" ||
    notice.kind === "strike"
  ) {
    return "terganggu";
  }
  return "tersendat";
}

function isLiveNotice(notice: DisruptionSummary): boolean {
  if (!notice.activeNow) return false;
  // A labelled scenario is not a live disruption, even when it is stored.
  return !notice.id.startsWith("contoh:");
}

/** The line ids a notice names, through every field the API carries. */
function lineIdsOf(notice: DisruptionSummary): string[] {
  const ids = new Set<string>();
  if (notice.lineId) ids.add(notice.lineId);
  for (const id of notice.affectedLineIds) ids.add(id);
  for (const line of notice.lines) ids.add(line.id);
  return [...ids];
}

/**
 * The status of every line, from the live notices only.
 *
 * A notice about a corridor marks that corridor. A notice about a stop is
 * not a corridor status: the planner decides whether it blocks a journey,
 * and this table is about the line itself. A notice about an operator's
 * whole service marks the lines of that operator.
 */
export function classifyLineStatuses(
  lines: readonly LineSummary[],
  notices: readonly DisruptionSummary[],
): { byLine: Record<string, LineStatusInfo>; counts: LineStatusCounts } {
  const live = notices
    .filter(isLiveNotice)
    .filter((notice) => notice.scope !== "stop")
    .slice()
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

  const byLine: Record<string, LineStatusInfo> = {};
  const counts: LineStatusCounts = { lancar: 0, tersendat: 0, terganggu: 0 };

  for (const line of lines) {
    const matching = live.filter((notice) => {
      if (notice.scope === "network") {
        return notice.systemId !== null && notice.systemId === line.systemId;
      }
      return lineIdsOf(notice).includes(line.id);
    });
    const status = matching.reduce<LineStatus>(
      (worst, notice) =>
        STATUS_ORDER[severityOf(notice)] > STATUS_ORDER[worst] ? severityOf(notice) : worst,
      "lancar",
    );
    byLine[line.id] = { status, notices: matching };
    counts[status] += 1;
  }

  return { byLine, counts };
}

/** Whether a line is one of the rail systems, for the status filters. */
export function lineFilterGroupOf(line: LineSummary): "krl" | "rail" | "brt" | "mikro" | "other" {
  if (line.systemId === "krl-jabodetabek") return "krl";
  if (
    line.systemId === "mrt-jakarta" ||
    line.systemId === "lrt-jakarta" ||
    line.systemId === "lrt-jabodebek"
  ) {
    return "rail";
  }
  if (line.serviceClass === "mikrotrans") return "mikro";
  if (line.systemId === "transjakarta") return "brt";
  return "other";
}
