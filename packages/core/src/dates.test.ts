import { describe, expect, it } from "vitest";

import { addDays, addMonths, daysBetween, isoDay, MS_PER_DAY } from "./dates.js";

describe("isoDay", () => {
  it("takes the UTC day of the instant, not the local time zone's", () => {
    expect(isoDay(new Date("2026-03-01T23:30:00-02:00"))).toBe("2026-03-02");
    expect(isoDay(new Date(Date.UTC(2024, 1, 29)))).toBe("2024-02-29");
  });
});

describe("addDays", () => {
  it("adds and subtracts days across month and year ends", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2026-03-10", 0)).toBe("2026-03-10");
  });

  it("respects leap years", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2025-02-28", 1)).toBe("2025-03-01");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
  });

  it("is not affected by daylight saving changes (UTC has none)", () => {
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
  });
});

describe("daysBetween", () => {
  it("counts calendar days, signed", () => {
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
    expect(daysBetween("2025-02-28", "2025-03-01")).toBe(1);
    expect(daysBetween("2026-01-01", "2025-12-31")).toBe(-1);
    expect(daysBetween("2026-05-05", "2026-05-05")).toBe(0);
    expect(daysBetween("2025-01-01", "2026-01-01")).toBe(365);
  });

  it("is consistent with MS_PER_DAY", () => {
    expect(MS_PER_DAY).toBe(24 * 60 * 60 * 1000);
  });
});

describe("addMonths", () => {
  it("counts from date to date", () => {
    expect(addMonths("2025-07-16", 2)).toBe("2025-09-16");
    expect(addMonths("2025-07-16", -2)).toBe("2025-05-16");
  });

  it("crosses years", () => {
    expect(addMonths("2025-11-30", 2)).toBe("2026-01-30");
    expect(addMonths("2025-01-15", -2)).toBe("2024-11-15");
  });

  it("takes the last day of the month when the target has no such day", () => {
    expect(addMonths("2025-12-31", 2)).toBe("2026-02-28");
    expect(addMonths("2023-12-31", 2)).toBe("2024-02-29");
    expect(addMonths("2025-10-31", -2)).toBe("2025-08-31");
    expect(addMonths("2025-04-30", -2)).toBe("2025-02-28");
  });
});
