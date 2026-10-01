import { describe, expect, it } from "vitest";

import type { TradeLot } from "@sextante/core/fiscal/plusvalias";
import { buildRealisedGainsReport } from "@sextante/core/fiscal/realised-gains";
import { buildRealisedGainsCsv, REALISED_GAINS_CSV_COLUMNS, type RealisedGainsCsvHeaders } from "./realised-gains-csv";

const HEADERS = Object.fromEntries(REALISED_GAINS_CSV_COLUMNS.map((c) => [c, c])) as RealisedGainsCsvHeaders;

const lots: TradeLot[] = [
  { id: "1", kind: "buy", quantity: 3, price: 10, fees: 1, tradedAt: "2024-01-01" },
  { id: "2", kind: "sell", quantity: 2, price: 12.5, fees: 0.5, tradedAt: "2024-05-02" },
];

const year = buildRealisedGainsReport([{ id: "p", ticker: "VWCE", name: "=cmd|' /C calc'!A0", currency: "EUR", lots }])
  .years[0];

describe("buildRealisedGainsCsv", () => {
  it("una fila por venta, con el dialecto español", () => {
    const csv = buildRealisedGainsCsv(year, HEADERS, "es");
    const lines = csv.trimEnd().split("\r\n");

    expect(lines[0]).toBe(REALISED_GAINS_CSV_COLUMNS.join(";"));
    // Transmisión 25 − 0,5 = 24,5; adquisición 2 × (10 + 1/3) = 20,67; ganancia 3,83.
    expect(lines[1]).toBe("2024-05-02;VWCE;'=cmd|' /C calc'!A0;EUR;2;12,5;0,5;24,5;20,67;3,83");
    expect(lines).toHaveLength(2);
  });

  it("con el dialecto inglés usa coma y punto", () => {
    const csv = buildRealisedGainsCsv(year, HEADERS, "en");
    expect(csv.split("\r\n")[1]).toBe("2024-05-02,VWCE,'=cmd|' /C calc'!A0,EUR,2,12.5,0.5,24.5,20.67,3.83");
  });
});
