import fc from "fast-check";
import { describe, it } from "vitest";

import { PROPERTY_PARAMS } from "../test-support/property-config.js";
import type { ReferenceRates } from "./fx-reference.js";
import type { TradeLot } from "./plusvalias.js";
import { buildRealisedGainsReport } from "./realised-gains.js";

const DAYS = 3 * 365;
const dateOf = (day: number) => new Date(Date.UTC(2022, 0, 1) + day * 86_400_000).toISOString().slice(0, 10);

/** Histórico en USD de 2022-2024, en cualquier orden. */
const history = fc
  .array(
    fc.record({
      kind: fc.constantFrom("buy" as const, "sell" as const),
      quantity: fc.double({ min: 0.001, max: 1000, noNaN: true }),
      price: fc.double({ min: 0, max: 1000, noNaN: true }),
      fees: fc.double({ min: 0, max: 20, noNaN: true }),
      day: fc.integer({ min: 0, max: DAYS - 1 }),
    }),
    { maxLength: 25 },
  )
  .map((rows) =>
    rows.map((row, i): TradeLot => ({
      id: `lot-${String(i).padStart(3, "0")}`,
      kind: row.kind,
      quantity: row.quantity,
      price: row.price,
      fees: row.fees,
      tradedAt: dateOf(row.day),
    })),
  );

/** Un tipo USD por día (sin huecos): todas las operaciones se pueden convertir. */
const dailyRates = fc
  .array(fc.double({ min: 0.8, max: 1.4, noNaN: true }), { minLength: DAYS, maxLength: DAYS })
  .map((values): ReferenceRates => ({ USD: values.map((unitsPerEur, day) => ({ date: dateOf(day), unitsPerEur })) }));

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));

describe("buildRealisedGainsReport — propiedades", () => {
  it("ganancia de los valores + diferencia de cambio = convertir cada operación a su fecha, salvo lo diferido por la regla de los dos meses", () => {
    fc.assert(
      fc.property(history, dailyRates, (lots, rates) => {
        const report = buildRealisedGainsReport([{ id: "p", ticker: "X", name: null, currency: "USD", lots }], rates);
        const rateOn = (date: string) => rates.USD.find((p) => p.date === date)?.unitsPerEur ?? NaN;
        return report.years.every((year) => {
          const perOperation = year.sales.reduce(
            (sum, sale) =>
              sum +
              sale.transferValue / rateOn(sale.tradedAt) -
              sale.matched.reduce((acc, m) => acc + m.acquisitionValue / rateOn(m.tradedAt), 0),
            0,
          );
          return (
            year.fxIncomplete === 0 &&
            year.unconverted.length === 0 &&
            close(year.total, perOperation - year.deferred + year.integrated)
          );
        });
      }),
      PROPERTY_PARAMS,
    );
  });

  it("la regla de los dos meses nunca crea pérdidas: lo integrado no supera a lo diferido y cada venta difiere como mucho su pérdida", () => {
    fc.assert(
      fc.property(history, dailyRates, (lots, rates) => {
        const report = buildRealisedGainsReport([{ id: "p", ticker: "X", name: null, currency: "USD", lots }], rates);
        const deferred = report.years.reduce((s, y) => s + y.deferred, 0);
        const integrated = report.years.reduce((s, y) => s + y.integrated, 0);
        const eachSale = report.years.every((y) =>
          y.sales.every((sale) => {
            const lossOfSale = sale.matched.reduce((s, m) => s + Math.min(0, m.gain), 0);
            return sale.deferredLoss <= 0 && sale.deferredLoss >= lossOfSale - 1e-6 && sale.integratedLoss <= 0;
          }),
        );
        // Solo el signo: en euros lo integrado usa el tipo de la venta de origen y los totales no son comparables.
        return eachSale && deferred <= 0 && integrated <= 0;
      }),
      PROPERTY_PARAMS,
    );
  });

  it("la suma de las filas es el saldo del ejercicio", () => {
    fc.assert(
      fc.property(history, dailyRates, (lots, rates) => {
        const report = buildRealisedGainsReport([{ id: "p", ticker: "X", name: null, currency: "USD", lots }], rates);
        return report.years.every(
          (year) =>
            close(
              year.rows.reduce((s, r) => s + r.gain, 0),
              year.net,
            ) &&
            close(
              year.rows.reduce((s, r) => s + r.fxDifference, 0),
              year.fxDifference,
            ),
        );
      }),
      PROPERTY_PARAMS,
    );
  });

  it("no depende del orden en que llegan las operaciones", () => {
    fc.assert(
      fc.property(history, dailyRates, (lots, rates) => {
        const position = (l: TradeLot[]) => [{ id: "p", ticker: "X", name: null, currency: "USD", lots: l }];
        const a = buildRealisedGainsReport(position(lots), rates);
        const b = buildRealisedGainsReport(position([...lots].reverse()), rates);
        return (
          a.years.length === b.years.length &&
          a.years.every((year, i) => close(year.total, b.years[i].total) && close(year.net, b.years[i].net))
        );
      }),
      PROPERTY_PARAMS,
    );
  });
});
