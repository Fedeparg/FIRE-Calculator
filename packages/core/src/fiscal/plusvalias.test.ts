import { describe, expect, it } from "vitest";

import { buildOpenLots, simulateSale, walkLots, type TradeLot } from "./plusvalias.js";
import { estimateSavingsTax } from "./savings-tax.js";
import { firstItem, itemAt } from "../arrays.js";
import { defined } from "../assert.js";

/** Constructor breve de lotes: los tests solo fijan lo que les importa. */
function lot(overrides: Partial<TradeLot> & Pick<TradeLot, "id">): TradeLot {
  return {
    kind: "buy",
    quantity: 1,
    price: 100,
    fees: 0,
    tradedAt: "2024-01-01",
    ...overrides,
  };
}

describe("buildOpenLots", () => {
  it("devuelve las compras intactas cuando no hay ventas", () => {
    const open = buildOpenLots([
      lot({ id: "a", quantity: 10, price: 50, tradedAt: "2024-01-10" }),
      lot({ id: "b", quantity: 5, price: 80, tradedAt: "2024-03-01" }),
    ]);

    expect(open.map((o) => [o.lotId, o.quantity])).toEqual([
      ["a", 10],
      ["b", 5],
    ]);
  });

  it("ordena cronológicamente aunque lleguen desordenados", () => {
    const open = buildOpenLots([lot({ id: "b", tradedAt: "2024-03-01" }), lot({ id: "a", tradedAt: "2024-01-10" })]);

    expect(open.map((o) => o.lotId)).toEqual(["a", "b"]);
  });

  it("desempata dos operaciones del mismo día por createdAt y luego por id", () => {
    const open = buildOpenLots([
      lot({ id: "z", tradedAt: "2024-01-10", createdAt: "2024-01-10T10:00:00.000Z" }),
      lot({ id: "a", tradedAt: "2024-01-10", createdAt: "2024-01-10T09:00:00.000Z" }),
    ]);

    expect(open.map((o) => o.lotId)).toEqual(["a", "z"]);
  });

  it("una venta previa consume los lotes más antiguos primero (FIFO)", () => {
    const open = buildOpenLots([
      lot({ id: "a", quantity: 10, price: 50, tradedAt: "2024-01-10" }),
      lot({ id: "b", quantity: 10, price: 80, tradedAt: "2024-02-10" }),
      lot({ id: "s", kind: "sell", quantity: 12, price: 90, tradedAt: "2024-03-10" }),
    ]);

    // "a" se agota entero y de "b" quedan 8.
    expect(open.map((o) => [o.lotId, o.quantity])).toEqual([["b", 8]]);
  });

  it("prorratea las comisiones de compra por participación", () => {
    const open = firstItem(buildOpenLots([lot({ id: "a", quantity: 4, price: 25, fees: 10 })]));
    expect(open.feesPerUnit).toBe(2.5);
  });

  it("ignora lotes con cantidad no válida en vez de envenenar el cálculo", () => {
    const open = buildOpenLots([
      lot({ id: "bad", quantity: 0 }),
      lot({ id: "nan", quantity: Number.NaN }),
      lot({ id: "ok", quantity: 3 }),
    ]);

    expect(open.map((o) => o.lotId)).toEqual(["ok"]);
  });

  it("una venta que excede lo disponible agota existencias sin dejar cantidades negativas", () => {
    const open = buildOpenLots([
      lot({ id: "a", quantity: 5 }),
      lot({ id: "s", kind: "sell", quantity: 50, tradedAt: "2024-06-01" }),
    ]);

    expect(open).toEqual([]);
  });
});

describe("simulateSale", () => {
  it("venta parcial de un único lote", () => {
    const sim = simulateSale({
      lots: [lot({ id: "a", quantity: 10, price: 100 })],
      quantity: 4,
      price: 150,
    });

    expect(sim).not.toBeNull();
    expect(sim?.quantitySold).toBe(4);
    expect(sim?.grossProceeds).toBe(600);
    expect(sim?.acquisitionValue).toBe(400);
    expect(sim?.gain).toBe(200);
    expect(sim?.remainingQuantity).toBe(6);
    expect(sim?.remainingAvgPrice).toBe(100);
    expect(sim?.insufficient).toBe(false);
  });

  it("venta total deja la posición a cero", () => {
    const sim = defined(
      simulateSale({
        lots: [lot({ id: "a", quantity: 10, price: 100 })],
        quantity: 10,
        price: 120,
      }),
    );

    expect(sim.quantitySold).toBe(10);
    expect(sim.gain).toBe(200);
    expect(sim.remainingQuantity).toBe(0);
    expect(sim.remainingAvgPrice).toBe(0);
  });

  it("consume varios lotes por FIFO y recalcula el precio medio de lo que queda", () => {
    const sim = defined(
      simulateSale({
        lots: [
          lot({ id: "a", quantity: 10, price: 100, tradedAt: "2024-01-01" }),
          lot({ id: "b", quantity: 10, price: 200, tradedAt: "2024-02-01" }),
        ],
        quantity: 15,
        price: 250,
      }),
    );

    // FIFO: 10 de "a" a 100 + 5 de "b" a 200 = 2.000 de coste.
    expect(sim.acquisitionValue).toBe(2000);
    expect(sim.grossProceeds).toBe(3750);
    expect(sim.gain).toBe(1750);
    expect(sim.matched.map((m) => [m.lotId, m.quantity])).toEqual([
      ["a", 10],
      ["b", 5],
    ]);
    // Solo quedan 5 participaciones del lote caro.
    expect(sim.remainingQuantity).toBe(5);
    expect(sim.remainingAvgPrice).toBe(200);
  });

  it("el desglose por lote suma exactamente la ganancia total", () => {
    const sim = defined(
      simulateSale({
        lots: [
          lot({ id: "a", quantity: 3, price: 33.33, tradedAt: "2024-01-01" }),
          lot({ id: "b", quantity: 4, price: 41.17, tradedAt: "2024-02-01" }),
        ],
        quantity: 6,
        price: 77.77,
        fees: 3.21,
      }),
    );

    const sum = sim.matched.reduce((acc, m) => acc + m.gain, 0);
    expect(sum).toBeCloseTo(sim.gain, 10);
  });

  it("una venta por debajo del precio de compra da pérdida", () => {
    const sim = defined(
      simulateSale({
        lots: [lot({ id: "a", quantity: 10, price: 100 })],
        quantity: 10,
        price: 60,
      }),
    );

    expect(sim.gain).toBe(-400);
    expect(estimateSavingsTax(sim.gain).tax).toBe(0);
  });

  it("las comisiones de compra suben el coste y las de venta bajan el ingreso", () => {
    const sim = defined(
      simulateSale({
        lots: [lot({ id: "a", quantity: 10, price: 100, fees: 20 })],
        quantity: 10,
        price: 150,
        fees: 30,
      }),
    );

    // Adquisición 1.000 + 20; transmisión 1.500 − 30 → ganancia 450 (no 500).
    expect(sim.acquisitionValue).toBe(1020);
    expect(sim.transferValue).toBe(1470);
    expect(sim.gain).toBe(450);
  });

  it("prorratea las comisiones de compra en una venta parcial", () => {
    const sim = defined(
      simulateSale({
        lots: [lot({ id: "a", quantity: 10, price: 100, fees: 20 })],
        quantity: 4,
        price: 100,
      }),
    );

    // Solo 4/10 de la comisión de compra entra en el coste → pérdida de 8.
    expect(sim.acquisitionValue).toBeCloseTo(408, 10);
    expect(sim.gain).toBeCloseTo(-8, 10);
  });

  it("admite cantidades fraccionarias (cripto, fondos)", () => {
    const sim = defined(
      simulateSale({
        lots: [lot({ id: "a", quantity: 0.5, price: 20000 })],
        quantity: 0.125,
        price: 40000,
      }),
    );

    expect(sim.grossProceeds).toBeCloseTo(5000, 10);
    expect(sim.acquisitionValue).toBeCloseTo(2500, 10);
    expect(sim.gain).toBeCloseTo(2500, 10);
    expect(sim.remainingQuantity).toBeCloseTo(0.375, 10);
  });

  it("tiene en cuenta las ventas ya registradas en el histórico", () => {
    const sim = defined(
      simulateSale({
        lots: [
          lot({ id: "a", quantity: 10, price: 100, tradedAt: "2024-01-01" }),
          lot({ id: "b", quantity: 10, price: 200, tradedAt: "2024-02-01" }),
          lot({ id: "s", kind: "sell", quantity: 10, price: 150, tradedAt: "2024-03-01" }),
        ],
        quantity: 5,
        price: 300,
      }),
    );

    // La venta previa se comió el lote "a": lo que se vende ahora sale de "b" a 200.
    expect(sim.availableQuantity).toBe(10);
    expect(sim.acquisitionValue).toBe(1000);
    expect(sim.gain).toBe(500);
    expect(sim.matched.map((m) => m.lotId)).toEqual(["b"]);
  });

  it("marca insufficient si se piden vender más participaciones de las que hay", () => {
    const sim = defined(
      simulateSale({
        lots: [lot({ id: "a", quantity: 3, price: 100 })],
        quantity: 10,
        price: 120,
      }),
    );

    expect(sim.insufficient).toBe(true);
    expect(sim.availableQuantity).toBe(3);
    expect(sim.quantitySold).toBe(3);
  });

  it("sin lotes vivos no hay nada que vender", () => {
    const sim = defined(simulateSale({ lots: [], quantity: 1, price: 100 }));

    expect(sim.availableQuantity).toBe(0);
    expect(sim.quantitySold).toBe(0);
    expect(sim.insufficient).toBe(true);
    expect(sim.matched).toEqual([]);
    expect(sim.gain).toBe(0);
  });

  it("una venta a precio cero es válida y da una pérdida igual al coste", () => {
    const sim = defined(
      simulateSale({
        lots: [lot({ id: "a", quantity: 2, price: 50 })],
        quantity: 2,
        price: 0,
      }),
    );

    expect(sim.gain).toBe(-100);
  });

  it("devuelve null cuando la entrada no permite calcular nada", () => {
    const lots = [lot({ id: "a", quantity: 10, price: 100 })];
    expect(simulateSale({ lots, quantity: 0, price: 100 })).toBeNull();
    expect(simulateSale({ lots, quantity: -1, price: 100 })).toBeNull();
    expect(simulateSale({ lots, quantity: Number.NaN, price: 100 })).toBeNull();
    expect(simulateSale({ lots, quantity: 1, price: -5 })).toBeNull();
    expect(simulateSale({ lots, quantity: 1, price: Number.POSITIVE_INFINITY })).toBeNull();
  });
});

describe("walkLots", () => {
  it("sin ventas no hay ganancias realizadas", () => {
    const { sales, open } = walkLots([lot({ id: "a", quantity: 10 })]);
    expect(sales).toEqual([]);
    expect(open).toHaveLength(1);
  });

  it("realiza la ganancia de una venta parcial por FIFO, con comisiones de compra y venta", () => {
    const { sales, open } = walkLots([
      lot({ id: "a", quantity: 10, price: 50, fees: 10, tradedAt: "2024-01-10" }),
      lot({ id: "b", quantity: 10, price: 80, tradedAt: "2024-02-10" }),
      lot({ id: "s", kind: "sell", quantity: 4, price: 100, fees: 4, tradedAt: "2024-06-01" }),
    ]);

    expect(sales).toHaveLength(1);
    const sale = firstItem(sales);
    expect(sale.lotId).toBe("s");
    expect(sale.tradedAt).toBe("2024-06-01");
    expect(sale.quantity).toBe(4);
    // Transmisión 400 − 4; adquisición 4 × (50 + 1 de comisión prorrateada).
    expect(sale.transferValue).toBe(396);
    expect(sale.acquisitionValue).toBeCloseTo(204, 10);
    expect(sale.gain).toBeCloseTo(192, 10);
    expect(open.map((o) => [o.lotId, o.quantity])).toEqual([
      ["a", 6],
      ["b", 10],
    ]);
  });

  it("una venta que cruza lotes desglosa cada uno y cuadra con el total", () => {
    const { sales } = walkLots([
      lot({ id: "a", quantity: 3, price: 10, tradedAt: "2024-01-01" }),
      lot({ id: "b", quantity: 3, price: 20, tradedAt: "2024-01-02" }),
      lot({ id: "s", kind: "sell", quantity: 5, price: 15, tradedAt: "2024-03-01" }),
    ]);

    const sale = firstItem(sales);
    expect(sale.matched.map((m) => [m.lotId, m.quantity])).toEqual([
      ["a", 3],
      ["b", 2],
    ]);
    const sum = sale.matched.reduce((acc, m) => acc + m.gain, 0);
    expect(sum).toBeCloseTo(sale.gain, 10);
    expect(sale.gain).toBeCloseTo(75 - 30 - 40, 10);
  });

  it("encadena varias ventas: la segunda empareja lo que dejó la primera", () => {
    const { sales } = walkLots([
      lot({ id: "a", quantity: 5, price: 10, tradedAt: "2023-01-01" }),
      lot({ id: "b", quantity: 5, price: 30, tradedAt: "2023-06-01" }),
      lot({ id: "s1", kind: "sell", quantity: 5, price: 20, tradedAt: "2023-12-01" }),
      lot({ id: "s2", kind: "sell", quantity: 5, price: 20, tradedAt: "2024-02-01" }),
    ]);

    expect(sales.map((s) => [s.lotId, s.gain])).toEqual([
      ["s1", 50],
      ["s2", -50],
    ]);
  });

  it("en el mismo día desempata por fecha de alta, como el backend", () => {
    const { sales } = walkLots([
      lot({
        id: "s",
        kind: "sell",
        quantity: 1,
        price: 150,
        tradedAt: "2024-05-05",
        createdAt: "2024-05-05T10:00:00Z",
      }),
      lot({ id: "a", quantity: 1, price: 100, tradedAt: "2024-05-05", createdAt: "2024-05-05T09:00:00Z" }),
    ]);

    expect(sales).toHaveLength(1);
    expect(itemAt(sales, 0).gain).toBe(50);
  });

  it("una venta que excede lo disponible solo empareja lo que hay", () => {
    const { sales, open } = walkLots([
      lot({ id: "a", quantity: 2, price: 10 }),
      lot({ id: "s", kind: "sell", quantity: 5, price: 20, tradedAt: "2024-02-01" }),
    ]);

    expect(itemAt(sales, 0).quantity).toBe(2);
    expect(itemAt(sales, 0).gain).toBe(20);
    expect(open).toEqual([]);
  });

  it("coincide con simular la misma venta sobre el histórico anterior", () => {
    const history = [
      lot({ id: "a", quantity: 7, price: 12, fees: 3, tradedAt: "2024-01-01" }),
      lot({ id: "b", quantity: 4, price: 18, fees: 1, tradedAt: "2024-02-01" }),
    ];
    const simulated = simulateSale({ lots: history, quantity: 9, price: 25, fees: 2 });
    const { sales } = walkLots([
      ...history,
      lot({ id: "s", kind: "sell", quantity: 9, price: 25, fees: 2, tradedAt: "2024-03-01" }),
    ]);

    expect(itemAt(sales, 0).gain).toBe(simulated?.gain);
    expect(itemAt(sales, 0).matched).toEqual(simulated?.matched);
  });

  it("una venta sin existencias no imputa sus comisiones como pérdida", () => {
    // Contraejemplo encontrado por el test de propiedades: sin compras que emparejar, la
    // comisión no corresponde a ninguna participación vendida.
    const { sales } = walkLots([lot({ id: "s", kind: "sell", quantity: 1, price: 10, fees: 2 })]);
    expect(sales[0]).toMatchObject({ quantity: 0, sellFees: 0, transferValue: 0, gain: 0 });
  });
});

describe("ampliaciones liberadas (art. 37.1.a LIRPF)", () => {
  // Ejemplo del Manual práctico de Renta 2025 (Parte 1, págs. 885-887).
  const manualHistory: TradeLot[] = [
    lot({ id: "buy-2001", quantity: 900, price: 10, tradedAt: "2001-03-05" }),
    lot({ id: "bonus-2007", quantity: 600, price: 0, tradedAt: "2007-05-11" }),
    // Parcialmente liberadas: se pagan 5 €/acción, así que cuentan como compra normal.
    lot({ id: "buy-2011", quantity: 500, price: 5, tradedAt: "2011-09-14" }),
  ];

  it("reproduce el ejemplo del Manual de Renta 2025: 6.000 + 500 = 6.500 €", () => {
    const sim = simulateSale({ lots: manualHistory, quantity: 1600, price: 10 });

    expect(sim?.gain).toBeCloseTo(6500, 6);
    expect(sim?.matched.map((m) => [m.lotId, m.tradedAt, Math.round(m.quantity), Math.round(m.gain)])).toEqual([
      ["buy-2001", "2001-03-05", 1500, 6000],
      ["buy-2011", "2011-09-14", 100, 500],
    ]);
    expect(sim?.matched[0]?.price).toBeCloseTo(6, 9);
  });

  it("la ampliación no crea lote propio: conserva el coste total y la fecha", () => {
    const walk = walkLots(manualHistory);

    expect(walk.bonusIssueIds).toEqual(["bonus-2007"]);
    expect(walk.open.map((o) => o.lotId)).toEqual(["buy-2001", "buy-2011"]);
    expect(itemAt(walk.open, 0).quantity).toBeCloseTo(1500, 9);
    expect(itemAt(walk.open, 0).quantity * itemAt(walk.open, 0).price).toBeCloseTo(9000, 6);
  });

  it("reparte proporcionalmente entre varios lotes vivos y respeta lo ya vendido", () => {
    const open = buildOpenLots([
      lot({ id: "a", quantity: 100, price: 10, fees: 10, tradedAt: "2020-01-01" }),
      lot({ id: "b", quantity: 100, price: 20, tradedAt: "2020-02-01" }),
      lot({ id: "s", kind: "sell", quantity: 50, price: 15, tradedAt: "2020-03-01" }),
      lot({ id: "bonus", quantity: 75, price: 0, tradedAt: "2020-04-01" }),
    ]);

    // Vivos antes: a=50, b=100 (total 150) → factor 1,5.
    expect(open.map((o) => [o.lotId, o.quantity])).toEqual([
      ["a", 75],
      ["b", 150],
    ]);
    expect(itemAt(open, 0).quantity * (itemAt(open, 0).price + itemAt(open, 0).feesPerUnit)).toBeCloseTo(
      50 * (10 + 0.1),
      6,
    );
    expect(itemAt(open, 1).quantity * itemAt(open, 1).price).toBeCloseTo(2000, 6);
  });

  it("una compra a precio 0 con comisiones, o sin lotes vivos, sigue siendo compra normal", () => {
    expect(buildOpenLots([lot({ id: "a", price: 10 }), lot({ id: "x", price: 0, fees: 1 })])).toHaveLength(2);
    expect(buildOpenLots([lot({ id: "x", quantity: 5, price: 0 })])).toHaveLength(1);
  });

  it("un precio no numérico no es una ampliación: queda como compra propia (a coste 0) y no reparte", () => {
    for (const price of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const walk = walkLots([lot({ id: "a", quantity: 10, price: 10 }), lot({ id: "x", quantity: 5, price })]);

      expect(walk.bonusIssueIds).toEqual([]);
      expect(walk.open.map((o) => [o.lotId, o.quantity, o.price])).toEqual([
        ["a", 10, 10],
        ["x", 5, 0],
      ]);
    }
  });
});
