import { describe, expect, it } from "vitest";

import { isNationalHoliday, jakartaDateKey } from "./calendar.js";

describe("Indonesian national holidays 2026", () => {
  it("uses the Jakarta civil date, not UTC", () => {
    expect(jakartaDateKey(new Date("2026-08-16T20:00:00Z"))).toBe("2026-08-17");
    expect(isNationalHoliday(new Date("2026-08-16T20:00:00Z"))).toBe(true);
  });

  it("knows Independence Day and a normal Tuesday", () => {
    expect(isNationalHoliday(new Date("2026-08-17T12:00:00+07:00"))).toBe(true);
    expect(isNationalHoliday(new Date("2026-08-18T12:00:00+07:00"))).toBe(false);
  });

  it("does not treat cuti bersama as a national holiday", () => {
    // 16 February 2026 is cuti bersama, not one of the 17 national holidays.
    expect(isNationalHoliday(new Date("2026-02-16T12:00:00+07:00"))).toBe(false);
  });
});
