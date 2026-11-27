/**
 * The Jakarta clock, shared by the planner views.
 *
 * The planner is deterministic and the interface is read in Jakarta, so
 * every duration the rider sees is anchored to the same clock. A missing
 * start is read as now, because that is the instant the planner used for a
 * journey requested without a time.
 */

function startDateOf(startIso: string | undefined): Date {
  if (startIso) {
    const parsed = new Date(startIso);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

/** The instant the journey reaches its destination, as an ISO string. */
export function estimateArrivalIso(
  startIso: string | undefined,
  durationMinutes: number,
): string {
  const start = startDateOf(startIso);
  const minutes = Math.max(0, Math.round(durationMinutes));
  return new Date(start.getTime() + minutes * 60_000).toISOString();
}

/** The Jakarta clock, as the ticket writes it: 07.10. */
export function formatJakartaClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(date)
    .replace(":", ".");
}

/**
 * The departure and the arrival on one line: "07.10 - 07.48".
 *
 * The clock is Jakarta time, the same clock the rest of the interface
 * uses.
 */
export function formatJakartaSpan(
  startIso: string | undefined,
  durationMinutes: number,
): string {
  const start = startDateOf(startIso);
  return `${formatJakartaClock(start.toISOString())} - ${formatJakartaClock(
    estimateArrivalIso(start.toISOString(), durationMinutes),
  )}`;
}
