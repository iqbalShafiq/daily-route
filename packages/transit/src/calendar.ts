/**
 * Indonesian national holidays, 2026.
 *
 * Source: SKB 3 Menteri Nos. 1497/2025, 2/2025 and 5/2025 (signed
 * 19 September 2025), as published by Setneg:
 * https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2026
 *
 * These are the 17 national holidays. The 8 `cuti bersama` dates are a
 * separate list and are not treated as a national holiday by a transit
 * service unless the operator says so. Dates are Jakarta civil dates.
 */
export const NATIONAL_HOLIDAYS_2026: ReadonlySet<string> = new Set([
  "2026-01-01",
  "2026-01-16",
  "2026-02-17",
  "2026-03-19",
  "2026-03-21",
  "2026-03-22",
  "2026-04-03",
  "2026-04-05",
  "2026-05-01",
  "2026-05-14",
  "2026-05-27",
  "2026-05-31",
  "2026-06-01",
  "2026-06-16",
  "2026-08-17",
  "2026-08-25",
  "2026-12-25",
]);

const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The Jakarta date (`YYYY-MM-DD`) of an instant. */
export function jakartaDateKey(at: Date): string {
  return dateKeyFormatter.format(at);
}

/** Whether an instant falls on an Indonesian national holiday. */
export function isNationalHoliday(at: Date): boolean {
  return NATIONAL_HOLIDAYS_2026.has(jakartaDateKey(at));
}
