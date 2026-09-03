import { describe, expect, it } from "vitest";

import {
  buildPortfolioCsv,
  CSV_COLUMNS,
  UTF8_BOM,
  type PortfolioCsvHeaders,
  type PortfolioCsvInput,
} from "./portfolio-csv";

type CsvPosition = PortfolioCsvInput["positions"][number];

/** Cabeceras de prueba: en producción llegan traducidas desde el componente. */
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

/** EUR y USD convertibles; GBP deliberadamente ausente para probar la exclusión. */
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

/** Divide el CSV en filas sin la línea final vacía. */
function rows(csv: string): string[] {
  return csv.split("\r\n").filter((line) => line !== "");
}

describe("buildPortfolioCsv", () => {
  it("usa punto y coma y coma decimal en español (dialecto de Excel en España)", () => {
    const csv = buildPortfolioCsv({
      ...BASE,
      locale: "es",
      positions: [
        position({ ticker: "VWCE", name: "Vanguard All-World", quantity: 12.5, avgPrice: 98.75 }),
      ],
      prices: { VWCE: { close: 110.4, currency: "EUR", date: "2026-09-02" } },
    });

    expect(rows(csv)).toEqual([
      "Símbolo;Nombre;Cantidad;Precio medio;Divisa;Bróker;Último precio;Divisa del precio;Fecha del precio;Valoración (EUR)",
      "VWCE;Vanguard All-World;12,5;98,75;EUR;;110,4;EUR;2026-09-02;1380",
    ]);
  });

  it("usa coma y punto decimal en inglés", () => {
    const csv = buildPortfolioCsv({
      ...BASE,
      locale: "en",
      positions: [position({ ticker: "VWCE", quantity: 12.5, avgPrice: 98.75 })],
      prices: { VWCE: { close: 110.4, currency: "EUR", date: "2026-09-02" } },
    });

    expect(rows(csv)[1]).toBe("VWCE,,12.5,98.75,EUR,,110.4,EUR,2026-09-02,1380");
  });

  it("termina siempre en salto de línea y no emite la línea sep=", () => {
    const csv = buildPortfolioCsv({
      ...BASE,
      locale: "es",
      positions: [position({ ticker: "VWCE" })],
      prices: {},
    });

    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.startsWith("sep=")).toBe(false);
  });

  it("cartera vacía: solo la fila de cabeceras", () => {
    const csv = buildPortfolioCsv({ ...BASE, locale: "es", positions: [], prices: {} });

    expect(rows(csv)).toHaveLength(1);
    expect(rows(csv)[0].split(";")).toHaveLength(CSV_COLUMNS.length);
  });

  it("entrecomilla el texto que lleva el separador o comillas", () => {
    const csv = buildPortfolioCsv({
      ...BASE,
      locale: "es",
      positions: [
        position({ ticker: "SXR8", name: 'iShares "Core"; MSCI', broker: "MyInvestor; SA" }),
      ],
      prices: {},
    });

    expect(rows(csv)[1]).toContain('"iShares ""Core""; MSCI"');
    expect(rows(csv)[1]).toContain('"MyInvestor; SA"');
  });

  it("neutraliza las fórmulas del texto libre (inyección en CSV)", () => {
    const csv = buildPortfolioCsv({
      ...BASE,
      locale: "es",
      positions: [position({ ticker: "SXR8", name: "=1+1", broker: "@SUM(A1)" })],
      prices: {},
    });

    expect(rows(csv)[1]).toContain(";'=1+1;");
    expect(rows(csv)[1]).toContain(";'@SUM(A1);");
  });

  it("deja vacías las celdas de precio cuando no hay cotización", () => {
    const csv = buildPortfolioCsv({
      ...BASE,
      locale: "es",
      positions: [position({ ticker: "SINPRECIO", quantity: 3, avgPrice: 10 })],
      prices: {},
    });

    expect(rows(csv)[1]).toBe("SINPRECIO;;3;10;EUR;;;;;");
  });

  it("exporta el precio pero no la valoración si la divisa no es convertible", () => {
    const csv = buildPortfolioCsv({
      ...BASE,
      locale: "es",
      positions: [position({ ticker: "VOD", currency: "GBP", quantity: 100, avgPrice: 0.7 })],
      prices: { VOD: { close: 0.8, currency: "GBP", date: "2026-09-02" } },
    });

    // El último precio se conserva en su divisa nativa; la valoración en EUR queda vacía
    // (nunca 0) porque falta la tasa GBP.
    expect(rows(csv)[1]).toBe("VOD;;100;0,7;GBP;;0,8;GBP;2026-09-02;");
  });

  it("convierte la valoración a la divisa elegida", () => {
    const csv = buildPortfolioCsv({
      ...BASE,
      display: "EUR",
      locale: "es",
      positions: [position({ ticker: "AAPL", currency: "USD", quantity: 10, avgPrice: 200 })],
      prices: { AAPL: { close: 220, currency: "USD", date: "2026-09-02" } },
    });

    // 10 × 220 USD → EUR con USD = 1 y EUR = 1,1 → 2000 EUR.
    expect(rows(csv)[1].split(";").at(-1)).toBe("2000");
  });

  it("no escribe notación científica para cantidades muy pequeñas", () => {
    const csv = buildPortfolioCsv({
      ...BASE,
      locale: "es",
      positions: [position({ ticker: "BTC", quantity: 0.00000012, avgPrice: 50000 })],
      prices: {},
    });

    expect(rows(csv)[1]).toContain("0,00000012");
    expect(rows(csv)[1]).not.toContain("e-");
  });

  it("el BOM es la marca UTF-8 esperada por Excel", () => {
    expect(UTF8_BOM).toBe("﻿");
  });
});
