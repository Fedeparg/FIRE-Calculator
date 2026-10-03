import fc from "fast-check";
import { describe, it } from "vitest";

import { PROPERTY_PARAMS } from "../test-support/property-config.js";
import { walkLots, type TradeLot } from "./plusvalias.js";
import { computeWashSales } from "./wash-sale.js";

/** Histórico arbitrario en un par de años, en cualquier orden (incluye ampliaciones liberadas por precio 0). */
const history = fc
  .array(
    fc.record({
      kind: fc.constantFrom("buy" as const, "sell" as const),
      quantity: fc.double({ min: 0.001, max: 1000, noNaN: true }),
      price: fc.double({ min: 0, max: 1000, noNaN: true }),
      fees: fc.double({ min: 0, max: 20, noNaN: true }),
      day: fc.integer({ min: 0, max: 2 * 365 }),
    }),
    { maxLength: 30 },
  )
  .map((rows) =>
    rows.map((row, i): TradeLot => ({
      id: `lot-${String(i).padStart(3, "0")}`,
      kind: row.kind,
      quantity: row.quantity,
      price: row.price,
      fees: row.fees,
      tradedAt: new Date(Date.UTC(2023, 0, 1) + row.day * 86_400_000).toISOString().slice(0, 10),
    })),
  );

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));

describe("computeWashSales — propiedades", () => {
  it("cada venta difiere entre 0 y su pérdida, y solo difiere pérdidas", () => {
    fc.assert(
      fc.property(history, (lots) => {
        const walk = walkLots(lots, { trackOpenLots: true });
        const result = computeWashSales(lots, walk);
        return walk.sales.every((sale) => {
          const entry = result.get(sale.lotId);
          const lossOfSale = sale.matched.reduce((s, m) => s + Math.min(0, m.gain), 0);
          const lossQuantity = sale.matched.reduce((s, m) => s + (m.gain < 0 ? m.quantity : 0), 0);
          return (
            entry !== undefined &&
            entry.deferredLoss <= 0 &&
            entry.deferredLoss >= lossOfSale - 1e-6 &&
            entry.deferredQuantity <= lossQuantity + 1e-6 &&
            entry.integratedLoss <= 0
          );
        });
      }),
      PROPERTY_PARAMS,
    );
  });

  it("nada se integra sin haberse diferido: lo integrado no supera a lo diferido", () => {
    fc.assert(
      fc.property(history, (lots) => {
        const entries = [...computeWashSales(lots).values()];
        const deferred = entries.reduce((s, e) => s + e.deferredLoss, 0);
        const integrated = entries.reduce((s, e) => s + e.integratedLoss, 0);
        // Ambos ≤ 0: integrado (en valor absoluto) ≤ diferido.
        return integrated >= deferred - 1e-6 * Math.max(1, Math.abs(deferred));
      }),
      PROPERTY_PARAMS,
    );
  });

  it("cada integración procede de una venta anterior y el desglose suma lo integrado", () => {
    fc.assert(
      fc.property(history, (lots) => {
        const result = computeWashSales(lots);
        const order = [...result.keys()];
        return order.every((id, index) => {
          const entry = result.get(id);
          if (!entry) return false;
          return (
            entry.integratedFrom.every((part) => order.indexOf(part.fromSaleId) < index) &&
            close(
              entry.integratedFrom.reduce((s, part) => s + part.loss, 0),
              entry.integratedLoss,
            )
          );
        });
      }),
      PROPERTY_PARAMS,
    );
  });

  it("no depende del orden en que lleguen las operaciones", () => {
    fc.assert(
      fc.property(history, (lots) => {
        const forward = [...computeWashSales(lots).values()];
        const backward = [...computeWashSales([...lots].reverse()).values()];
        return JSON.stringify(forward) === JSON.stringify(backward);
      }),
      PROPERTY_PARAMS,
    );
  });
});
