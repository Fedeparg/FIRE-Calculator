import { describe, expect, it } from "vitest";

import { addDays, addMonths, daysBetween, isoDay, MS_PER_DAY } from "./dates.js";

describe("isoDay", () => {
  it("toma el día UTC del instante, no el del huso local", () => {
    expect(isoDay(new Date("2026-03-01T23:30:00-02:00"))).toBe("2026-03-02");
    expect(isoDay(new Date(Date.UTC(2024, 1, 29)))).toBe("2024-02-29");
  });
});

describe("addDays", () => {
  it("suma y resta días cruzando fin de mes y de año", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2026-03-10", 0)).toBe("2026-03-10");
  });

  it("respeta los bisiestos", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2025-02-28", 1)).toBe("2025-03-01");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
  });

  it("no se ve afectado por el cambio de hora (en UTC no existe)", () => {
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
  });
});

describe("daysBetween", () => {
  it("cuenta días de calendario, con signo", () => {
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
    expect(daysBetween("2025-02-28", "2025-03-01")).toBe(1);
    expect(daysBetween("2026-01-01", "2025-12-31")).toBe(-1);
    expect(daysBetween("2026-05-05", "2026-05-05")).toBe(0);
    expect(daysBetween("2025-01-01", "2026-01-01")).toBe(365);
  });

  it("es coherente con MS_PER_DAY", () => {
    expect(MS_PER_DAY).toBe(24 * 60 * 60 * 1000);
  });
});

describe("addMonths", () => {
  it("cuenta de fecha a fecha", () => {
    expect(addMonths("2025-07-16", 2)).toBe("2025-09-16");
    expect(addMonths("2025-07-16", -2)).toBe("2025-05-16");
  });

  it("cruza años", () => {
    expect(addMonths("2025-11-30", 2)).toBe("2026-01-30");
    expect(addMonths("2025-01-15", -2)).toBe("2024-11-15");
  });

  it("toma el último día del mes cuando el destino no tiene ese día", () => {
    expect(addMonths("2025-12-31", 2)).toBe("2026-02-28");
    expect(addMonths("2023-12-31", 2)).toBe("2024-02-29");
    expect(addMonths("2025-10-31", -2)).toBe("2025-08-31");
    expect(addMonths("2025-04-30", -2)).toBe("2025-02-28");
  });
});
