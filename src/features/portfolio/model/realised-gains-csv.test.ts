import { firstItem } from "@sextante/core/arrays";
import { describe, expect, it } from "vitest";

import type { TradeLot } from "@sextante/core/fiscal/plusvalias";
import { buildRealisedGainsReport } from "@sextante/core/fiscal/realised-gains";
import {
  buildRealisedGainsCsv,
  REALISED_GAINS_CSV_COLUMNS,
  realisedGainsCsvHeaders,
  type RealisedGainsCsvHeaders,
} from "./realised-gains-csv";

const HEADERS = Object.fromEntries(REALISED_GAINS_CSV_COLUMNS.map((c) => [c, c])) as RealisedGainsCsvHeaders;

const lots: TradeLot[] = [
  { id: "1", kind: "buy", quantity: 3, price: 10, fees: 1, tradedAt: "2024-01-01" },
  { id: "2", kind: "sell", quantity: 2, price: 12.5, fees: 0.5, tradedAt: "2024-05-02" },
];

const year = firstItem(
  buildRealisedGainsReport([{ id: "p", ticker: "VWCE", name: "=cmd|' /C calc'!A0", currency: "EUR", lots }], {}).years,
);

describe("buildRealisedGainsCsv", () => {
  it("una fila por venta, con el dialecto español", () => {
    const csv = buildRealisedGainsCsv(year, HEADERS, "es");
    const lines = csv.trimEnd().split("\r\n");

    expect(lines[0]).toBe(REALISED_GAINS_CSV_COLUMNS.join(";"));
    // Transmisión 25 − 0,5 = 24,5; adquisición 2 × (10 + 1/3) = 20,67; ganancia 3,83.
    // En euros el tipo es 1, los importes coinciden y no hay diferencia de cambio.
    expect(lines[1]).toBe(
      "2024-05-02;VWCE;'=cmd|' /C calc'!A0;EUR;2;12,5;0,5;24,5;20,67;3,83;1;24,5;20,67;3,83;0;0;0;3,83",
    );
    expect(lines).toHaveLength(2);
  });

  it("con el dialecto inglés usa coma y punto", () => {
    const csv = buildRealisedGainsCsv(year, HEADERS, "en");
    expect(csv.split("\r\n")[1]).toBe(
      "2024-05-02,VWCE,'=cmd|' /C calc'!A0,EUR,2,12.5,0.5,24.5,20.67,3.83,1,24.5,20.67,3.83,0,0,0,3.83",
    );
  });

  it("en divisa añade el tipo del BCE y los importes en euros; sin tipo, deja vacías esas columnas", () => {
    const usdLots: TradeLot[] = [
      { id: "1", kind: "buy", quantity: 1, price: 100, fees: 0, tradedAt: "2024-01-02" },
      { id: "2", kind: "sell", quantity: 1, price: 120, fees: 0, tradedAt: "2024-06-03" },
    ];
    const position = { id: "u", ticker: "AAPL", name: null, currency: "USD", lots: usdLots };
    const converted = firstItem(
      buildRealisedGainsReport([position], {
        USD: [
          { date: "2024-01-02", unitsPerEur: 1.1 },
          { date: "2024-06-03", unitsPerEur: 1.08 },
        ],
      }).years,
    );
    // 20 / 1,08 = 18,52; diferencia de cambio 100 / 1,08 − 100 / 1,1 = 1,68.
    expect(buildRealisedGainsCsv(converted, HEADERS, "en").split("\r\n")[1]).toBe(
      "2024-06-03,AAPL,,USD,1,120,0,120,100,20,1.08,111.11,92.59,18.52,1.68,0,0,18.52",
    );

    const missing = firstItem(buildRealisedGainsReport([position], {}).years);
    expect(buildRealisedGainsCsv(missing, HEADERS, "en").split("\r\n")[1]).toBe(
      "2024-06-03,AAPL,,USD,1,120,0,120,100,20,,,,,,,,",
    );
  });
});

describe("realisedGainsCsvHeaders", () => {
  it("traduce cada columna con su clave csv.<columna>, en orden", () => {
    const headers = realisedGainsCsvHeaders((key) => `[${key}]`);

    expect(Object.keys(headers)).toEqual([...REALISED_GAINS_CSV_COLUMNS]);
    expect(headers.gainEur).toBe("[csv.gainEur]");
  });
});
