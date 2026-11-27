import type { DisruptionSummary, PersonalAlert } from "../../lib/api.js";
import type { RoutineRecord } from "../route-planner/live-trip.js";

/**
 * The inbox, as pure rules.
 *
 * Every row is built from a stored notice, a saved usual journey or a local
 * routine. Nothing is invented: a reminder exists because the rider saved a
 * routine, and a disruption row exists because the monitor stored a notice.
 */

export const INBOX_READ_KEY = "daily-route.inbox-read";
const MAX_READ_IDS = 300;

export type InboxFilter = "all" | "disruption" | "reminder";
export type InboxGroup = "Hari ini" | "Sebelumnya";
export type InboxKind = "disruption" | "reminder";

export type InboxItem = {
  id: string;
  kind: InboxKind;
  title: string;
  subtitle: string;
  /** The instant the row belongs to, for ordering and the day group. */
  at: string;
  group: InboxGroup;
  read: boolean;
  /** The stored notice the row opens, when it is a disruption. */
  noticeId: string | null;
  /** The saved routine the row opens, when it is a reminder. */
  routineId: string | null;
  /** The stored severity, for the leading tone. Never a crowd estimate. */
  severity: string | null;
};

function storage(): Storage | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function readInboxReadIds(): string[] {
  const store = storage();
  if (!store) return [];
  try {
    const raw = store.getItem(INBOX_READ_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string").slice(0, MAX_READ_IDS);
  } catch {
    return [];
  }
}

/** Remember the rows the rider read and return the whole read list. */
export function markInboxRead(ids: readonly string[]): string[] {
  const current = readInboxReadIds();
  const next = [...new Set([...ids, ...current])].slice(0, MAX_READ_IDS);
  const store = storage();
  if (store) {
    try {
      store.setItem(INBOX_READ_KEY, JSON.stringify(next));
    } catch {
      // A private window may refuse the write. The list stays usable.
    }
  }
  return next;
}

function jakartaDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function groupOf(iso: string, today: string): InboxGroup {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Sebelumnya";
  return jakartaDateKey(date) === today ? "Hari ini" : "Sebelumnya";
}

function scopeTextOf(notice: DisruptionSummary): string {
  if (notice.scope === "stop") {
    const names = notice.stations
      .slice(0, 2)
      .map((station) => station.name)
      .join(" · ");
    if (names.length === 0) return "Perhentian";
    const rail = notice.stations.some(
      (station) =>
        station.systemId === "krl-jabodetabek" ||
        station.systemId === "mrt-jakarta" ||
        station.systemId === "lrt-jakarta" ||
        station.systemId === "lrt-jabodebek",
    );
    return `${rail ? "Stasiun" : "Halte"} ${names}`;
  }
  if (notice.scope === "line") {
    const codes = notice.lines.slice(0, 3).map((line) => line.code);
    const text = codes.length > 0 ? codes.join(" · ") : notice.lineCodes.slice(0, 3).join(" · ");
    return text.length > 0 ? `Jalur ${text}` : "Jalur";
  }
  return "Seluruh layanan";
}

function noticeSubtitle(notice: DisruptionSummary): string {
  const scope = scopeTextOf(notice);
  if (scope.length > 0) return scope;
  return notice.scope === "network" ? "Seluruh layanan" : "Pemberitahuan jaringan";
}

function newestAt(notices: readonly DisruptionSummary[], fallback: string): string {
  const times = notices
    .map((notice) => Date.parse(notice.publishedAt))
    .filter((value) => Number.isFinite(value));
  if (times.length === 0) return fallback;
  return new Date(Math.max(...times)).toISOString();
}

export type BuildInboxInput = {
  notices: readonly DisruptionSummary[];
  personalAlerts: readonly PersonalAlert[];
  routines: readonly RoutineRecord[];
  readIds: readonly string[];
  /** The instant the inbox is read. Defaults to now. */
  now?: Date;
};

/**
 * Build every inbox row, newest first, and mark the read ones.
 *
 * A disruption remains in the inbox while the notice is active, and a
 * reminder exists for a saved usual journey the notice touches or for a
 * routine the rider saved with a departure clock. A routine that already has
 * an alert row is not duplicated.
 */
export function buildInboxItems({
  notices,
  personalAlerts,
  routines,
  readIds,
  now = new Date(),
}: BuildInboxInput): InboxItem[] {
  const today = jakartaDateKey(now);
  const fallbackAt = now.toISOString();
  const read = new Set(readIds);
  const items: InboxItem[] = [];

  for (const notice of notices) {
    if (!notice.activeNow) continue;
    if (notice.id.startsWith("contoh:")) continue;
    items.push({
      id: `notice:${notice.id}`,
      kind: "disruption",
      title: notice.title,
      subtitle: noticeSubtitle(notice),
      at: notice.publishedAt,
      group: groupOf(notice.publishedAt, today),
      read: read.has(`notice:${notice.id}`),
      noticeId: notice.id,
      routineId: null,
      severity: notice.severity,
    });
  }

  const alertedPairs = new Set<string>();
  for (const alert of personalAlerts) {
    const pair = `${alert.habit.originName}>${alert.habit.destinationName}`;
    alertedPairs.add(pair);
    const matchingNotices = notices.filter((notice) =>
      alert.notices.some((entry) => entry.id === notice.id),
    );
    const routine =
      routines.find(
        (entry) =>
          entry.originName === alert.habit.originName &&
          entry.destinationName === alert.habit.destinationName,
      ) ?? null;
    const id = `alert:${pair}`;
    const at = newestAt(matchingNotices, fallbackAt);
    const first = alert.notices[0];
    const extra = alert.notices.length > 1 ? ` · ${alert.notices.length - 1} lagi` : "";
    items.push({
      id,
      kind: "reminder",
      title: `Rute ${alert.habit.originName} ke ${alert.habit.destinationName} terdampak`,
      subtitle: first ? `${first.title}${extra}` : "Perjalanan rutin tersimpan",
      at,
      group: groupOf(at, today),
      read: read.has(id),
      noticeId: first?.id ?? null,
      routineId: routine?.id ?? null,
      severity: matchingNotices[0]?.severity ?? "warning",
    });
  }

  for (const routine of routines) {
    if (!routine.departureTime) continue;
    const pair = `${routine.originName}>${routine.destinationName}`;
    if (alertedPairs.has(pair)) continue;
    if (!/^\d{2}:\d{2}$/.test(routine.departureTime)) continue;
    const at = `${today}T${routine.departureTime}:00+07:00`;
    const id = `routine:${routine.id}`;
    items.push({
      id,
      kind: "reminder",
      title: `Berangkat ${routine.departureTime} · ${routine.originName} ke ${routine.destinationName}`,
      subtitle: "Rutinitas tersimpan",
      at,
      group: "Hari ini",
      read: read.has(id),
      noticeId: null,
      routineId: routine.id,
      severity: null,
    });
  }

  return items.sort((a, b) => {
    if (a.group !== b.group) return a.group === "Hari ini" ? -1 : 1;
    return Date.parse(b.at) - Date.parse(a.at);
  });
}

export function filterInboxItems(
  items: readonly InboxItem[],
  filter: InboxFilter,
): InboxItem[] {
  if (filter === "all") return [...items];
  return items.filter((item) => item.kind === filter);
}

/** The rows under their day heading, in order, with no empty heading. */
export function groupInboxItems(items: readonly InboxItem[]): {
  group: InboxGroup;
  items: InboxItem[];
}[] {
  const groups: { group: InboxGroup; items: InboxItem[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.group === item.group) last.items.push(item);
    else groups.push({ group: item.group, items: [item] });
  }
  return groups;
}

export function unreadInboxCount(items: readonly InboxItem[]): number {
  return items.filter((item) => !item.read).length;
}
