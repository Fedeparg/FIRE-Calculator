import { describe, expect, it } from "vitest";
import { itemAt } from "@sextante/core/arrays";

import { UTF8_BOM } from "@/shared/format/csv";

import { buildPortfolioCsv, CSV_COLUMNS, type PortfolioCsvHeaders, type PortfolioCsvInput } from "./portfolio-csv";

type CsvPosition = PortfolioCsvInput["positions"][number];

/** Test headers: in production they arrive already translated from the component. */
const HEADERS: PortfolioCsvHeaders = {
  ticker: "Símbolo",
  name: "Nombre",
  quantity: "Cantidad",
  avgPrice: "Precio medio",
  currency: "Divisa",
  broker: "Bróker",
  lastPrice: "Último precio",
  priceCurrency: "Divisa del precio",
  priceDate: "Fecha del precio",
  marketValue: "Valoración (EUR)",
};

/** EUR and USD are convertible; GBP is deliberately missing to test the exclusion. */
const RATES = { USD: 1, EUR: 1.1 };

function position(overrides: Partial<CsvPosition> & Pick<CsvPosition, "ticker">): CsvPosition {
  return {
    name: null,
    quantity: 1,
    avgPrice: 100,
    broker: null,
    currency: "EUR",
    ...overrides,
  };
}

const BASE = { rates: RATES, display: "EUR", headers: HEADERS } as const;

/** Splits the CSV into rows without the trailing empty line. */
function rows(csv: string): string[] {
  return csv.split("\r\n").filter((line) => line !== "");
}

describe("buildPortfolioCsv", () => {
  it("uses semicolons and a decimal comma in Spanish (Excel's dialect in Spain)", () => {
    const csv = buildPortfolioCsv({
      ...BASE,
      locale: "es",
      positions: [position({ ticker: "VWCE", name: "Vanguard All-World", quantity: 12.5, avgPrice: 98.75 })],
      prices: { VWCE: { close: 110.4, currency: "EUR", date: "2026-09-02" } },
    });

    expect(rows(csv)).toEqual([
      "Símbolo;Nombre;Cantidad;Precio medio;Divisa;Bróker;Último precio;Divisa del precio;Fecha del precio;Valoración (EUR)",
      "VWCE;Vanguard All-World;12,5;98,75;EUR;;110,4;EUR;2026-09-02;1380",
    ]);
  });

  it("uses commas and a decimal point in English", () => {
    const csv = buildPortfolioCsv({
      ...BASE,
      locale: "en",
      positions: [position({ ticker: "VWCE", quantity: 12.5, avgPrice: 98.75 })],
      prices: { VWCE: { close: 110.4, currency: "EUR", date: "2026-09-02" } },
    });

    expect(rows(csv)[1]).toBe("VWCE,,12.5,98.75,EUR,,110.4,EUR,2026-09-02,1380");
  });

  it("always ends with a line break and does not emit the sep= line", () => {
    const csv = buildPortfolioCsv({
      ...BASE,
      locale: "es",
      positions: [position({ ticker: "VWCE" })],
      prices: {},
    });

    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.startsWith("sep=")).toBe(false);
  });

  it("empty portfolio: only the header row", () => {
    const csv = buildPortfolioCsv({ ...BASE, locale: "es", positions: [], prices: {} });

    expect(rows(csv)).toHaveLength(1);
    expect(itemAt(rows(csv), 0).split(";")).toHaveLength(CSV_COLUMNS.length);
  });

  it("quotes text containing the separator or quotes", () => {
    const csv = buildPortfolioCsv({
      ...BASE,
      locale: "es",
      positions: [position({ ticker: "SXR8", name: 'iShares "Core"; MSCI', broker: "MyInvestor; SA" })],
      prices: {},
    });

    expect(rows(csv)[1]).toContain('"iShares ""Core""; MSCI"');
    expect(rows(csv)[1]).toContain('"MyInvestor; SA"');
  });

  it("neutralizes formulas in free text (CSV injection)", () => {
    const csv = buildPortfolioCsv({
      ...BASE,
      locale: "es",
      positions: [position({ ticker: "SXR8", name: "=1+1", broker: "@SUM(A1)" })],
      prices: {},
    });

    expect(rows(csv)[1]).toContain(";'=1+1;");
    expect(rows(csv)[1]).toContain(";'@SUM(A1);");
  });

  it("leaves the price cells empty when there is no quote", () => {
    const csv = buildPortfolioCsv({
      ...BASE,
      locale: "es",
      positions: [position({ ticker: "SINPRECIO", quantity: 3, avgPrice: 10 })],
      prices: {},
    });

    expect(rows(csv)[1]).toBe("SINPRECIO;;3;10;EUR;;;;;");
  });

  it("exports the price but not the valuation if the currency is not convertible", () => {
    const csv = buildPortfolioCsv({
      ...BASE,
      locale: "es",
      positions: [position({ ticker: "VOD", currency: "GBP", quantity: 100, avgPrice: 0.7 })],
      prices: { VOD: { close: 0.8, currency: "GBP", date: "2026-09-02" } },
    });

    // The last price is kept in its native currency; the EUR valuation is left empty
    // (never 0) because the GBP rate is missing.
    expect(rows(csv)[1]).toBe("VOD;;100;0,7;GBP;;0,8;GBP;2026-09-02;");
  });

  it("converts the valuation into the chosen currency", () => {
    const csv = buildPortfolioCsv({
      ...BASE,
      display: "EUR",
      locale: "es",
      positions: [position({ ticker: "AAPL", currency: "USD", quantity: 10, avgPrice: 200 })],
      prices: { AAPL: { close: 220, currency: "USD", date: "2026-09-02" } },
    });

    // 10 × 220 USD → EUR with USD = 1 and EUR = 1.1 → 2000 EUR.
    expect(itemAt(rows(csv), 1).split(";").at(-1)).toBe("2000");
  });

  it("does not write scientific notation for very small quantities", () => {
    const csv = buildPortfolioCsv({
      ...BASE,
      locale: "es",
      positions: [position({ ticker: "BTC", quantity: 0.00000012, avgPrice: 50000 })],
      prices: {},
    });

    expect(rows(csv)[1]).toContain("0,00000012");
    expect(rows(csv)[1]).not.toContain("e-");
  });

  it("the BOM is the UTF-8 mark Excel expects", () => {
    expect(UTF8_BOM).toBe("﻿");
  });
});
