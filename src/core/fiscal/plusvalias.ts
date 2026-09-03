// Ganancias y pérdidas patrimoniales por transmisión de valores homogéneos: emparejamiento
// FIFO de los lotes y estimación de la cuota en la escala del ahorro del IRPF.
//
// Core puro (sin React, sin fetch), testeable. Lo consume la simulación "¿qué pasaría si
// vendo?" de la cartera.
//
// ⚠️ ALCANCE FISCAL (lo que SÍ modela y lo que NO). Sí modela:
//   - **FIFO obligatorio** para valores homogéneos: se transmiten siempre los adquiridos en
//     primer lugar (art. 37.2 de la Ley 35/2006 del IRPF para valores cotizados, y art. 37.1.b
//     para las participaciones en IIC). No hay opción de elegir lote ni de usar coste medio.
//   - **Valor de adquisición** = importe satisfecho + gastos y comisiones de compra
//     (art. 35.1); las comisiones del lote se prorratean entre las participaciones que
//     quedan vivas en él.
//   - **Valor de transmisión** = importe recibido − gastos y comisiones de venta (art. 35.2).
//   - **Escala del ahorro** vigente (`IRPF_AHORRO`) aplicada de forma progresiva por tramos.
//
// NO modela (y por eso el resultado es solo orientativo):
//   - La **regla de los dos meses** (art. 33.5.f): si se recompra el mismo valor en los dos
//     meses anteriores o posteriores, la pérdida NO se puede computar en ese ejercicio.
//   - La **compensación** con otras ganancias y pérdidas del ejercicio ni con los saldos
//     negativos de los cuatro anteriores: aquí la venta se mira aislada, así que una pérdida
//     da cuota 0 en vez del ahorro fiscal que en realidad produciría.
//   - El **resto de la base del ahorro** (dividendos, intereses, otras ventas), que se suma a
//     esta ganancia y puede empujarla a un tramo superior.
//   - Retenciones, coeficientes de abatimiento (D.T. 9.ª), fiscalidad no residente, traspasos
//     de fondos con diferimiento (art. 94), ni las especialidades forales.

import { applyProgressiveBrackets, effectiveRate, IRPF_AHORRO, marginalRate } from "./brackets";

/**
 * Una operación del histórico de una posición, tal y como la sirve la API
 * (`GET /api/positions/:id/lots`). Los importes van en la divisa de la posición.
 */
export interface TradeLot {
  id: string;
  kind: "buy" | "sell";
  /** Participaciones de la operación. Siempre > 0 (el signo lo da `kind`). */
  quantity: number;
  /** Precio unitario de la operación. */
  price: number;
  /** Comisiones y gastos de la operación. */
  fees: number;
  /** Fecha de la operación (`YYYY-MM-DD`). */
  tradedAt: string;
  /** Instante de alta en la BD (ISO). Desempata dos operaciones del MISMO día. */
  createdAt?: string;
}

/** Un lote de compra con la parte todavía NO vendida, listo para emparejar en una venta. */
export interface OpenLot {
  lotId: string;
  tradedAt: string;
  /** Participaciones vivas del lote. */
  quantity: number;
  /** Precio unitario de compra. */
  price: number;
  /**
   * Comisiones de compra por participación. Prorratear es la única forma coherente de
   * repartir una comisión fija cuando el lote se vende en varias veces.
   */
  feesPerUnit: number;
}

/** Trozo de un lote consumido por la venta simulada, con su ganancia individual. */
export interface MatchedLot {
  lotId: string;
  tradedAt: string;
  /** Participaciones de ESTE lote que absorbe la venta. */
  quantity: number;
  price: number;
  /** Valor de adquisición de esa parte (coste + comisiones de compra prorrateadas). */
  acquisitionValue: number;
  /** Valor de transmisión imputado a esa parte (proporcional a las participaciones). */
  transferValue: number;
  /** Ganancia (+) o pérdida (−) de esa parte. */
  gain: number;
}

/** Resultado de simular una venta contra el histórico de lotes. */
export interface SaleSimulation {
  /** Participaciones vivas antes de la venta simulada. */
  availableQuantity: number;
  /**
   * `true` si se piden vender más participaciones de las que hay. En ese caso el resto de
   * importes se calcula solo con lo disponible: la UI debe avisar en vez de darlos por buenos
   * (el backend, además, rechazaría la venta con un 400).
   */
  insufficient: boolean;
  /** Participaciones realmente emparejadas (= `quantity` pedida, salvo si `insufficient`). */
  quantitySold: number;
  /** Importe bruto de la venta (participaciones × precio), antes de comisiones. */
  grossProceeds: number;
  /** Comisiones de la venta. */
  sellFees: number;
  /** Valor de transmisión = bruto − comisiones de venta. */
  transferValue: number;
  /** Valor de adquisición de lo vendido, comisiones de compra incluidas. */
  acquisitionValue: number;
  /** Ganancia (+) o pérdida (−) patrimonial: transmisión − adquisición. */
  gain: number;
  /** Desglose por lote consumido, del más antiguo al más reciente. */
  matched: MatchedLot[];
  /** Participaciones que quedarían tras la venta. */
  remainingQuantity: number;
  /** Precio medio de coste de lo que quedaría (comisiones aparte), o 0 si no queda nada. */
  remainingAvgPrice: number;
}

/** Estimación de la cuota del ahorro de una ganancia patrimonial aislada. */
export interface SavingsTaxEstimate {
  /** Base del ahorro considerada: la ganancia, o 0 si la operación da pérdida. */
  base: number;
  /** Cuota estimada aplicando `IRPF_AHORRO` por tramos. */
  tax: number;
  /** Ganancia después de impuestos (`gain − tax`). Con pérdida, la propia pérdida. */
  net: number;
  /** Tipo efectivo en %, o `null` si no hay base positiva sobre la que calcularlo. */
  effectiveRate: number | null;
  /** Tipo marginal en % del último euro de la base. */
  marginal: number;
}

/**
 * Tolerancia para dar por agotado un lote. Las cantidades se guardan con 6 decimales, así que
 * cualquier resto por debajo de 1e-9 es residuo de la aritmética binaria, no una posición.
 */
const QUANTITY_EPSILON = 1e-9;

/**
 * Orden canónico del histórico: `(tradedAt, createdAt, id)`. Es EL MISMO criterio que usa el
 * backend en `lot-aggregate.ts`, y hace falta porque `tradedAt` no lleva hora: sin desempate,
 * dos operaciones del mismo día se emparejarían en un orden dependiente del servidor y el
 * FIFO dejaría de ser determinista.
 */
export function compareTradeLots(a: TradeLot, b: TradeLot): number {
  if (a.tradedAt !== b.tradedAt) return a.tradedAt < b.tradedAt ? -1 : 1;
  const ca = a.createdAt ?? "";
  const cb = b.createdAt ?? "";
  if (ca !== cb) return ca < cb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Reconstruye los lotes de compra VIVOS aplicando las ventas ya registradas por FIFO.
 *
 * Devuelve los lotes en orden cronológico, con la cantidad que queda sin vender de cada uno.
 * Una venta que excediera lo disponible (imposible vía API: el backend la rechaza) se
 * consume hasta agotar existencias y el exceso se ignora, en vez de dejar cantidades
 * negativas que envenenarían el resto del cálculo.
 */
export function buildOpenLots(lots: readonly TradeLot[]): OpenLot[] {
  const ordered = [...lots].sort(compareTradeLots);
  const open: OpenLot[] = [];

  for (const lot of ordered) {
    if (!Number.isFinite(lot.quantity) || lot.quantity <= 0) continue;

    if (lot.kind === "buy") {
      const fees = Number.isFinite(lot.fees) ? lot.fees : 0;
      open.push({
        lotId: lot.id,
        tradedAt: lot.tradedAt,
        quantity: lot.quantity,
        price: Number.isFinite(lot.price) ? lot.price : 0,
        feesPerUnit: fees / lot.quantity,
      });
      continue;
    }

    // Venta: consume los lotes más antiguos primero (FIFO).
    let pending = lot.quantity;
    while (pending > 0 && open.length > 0) {
      const first = open[0];
      const taken = Math.min(first.quantity, pending);
      first.quantity -= taken;
      pending -= taken;
      // Comparación con tolerancia: el binario deja restos de 1e-16 al restar decimales, y
      // un lote "agotado" con 1e-16 participaciones ensuciaría el desglose de la simulación.
      if (first.quantity <= QUANTITY_EPSILON) open.shift();
    }
  }

  return open;
}

/** Entrada de la simulación: el histórico de la posición y la venta hipotética. */
export interface SaleSimulationInput {
  /** Histórico completo de la posición (compras y ventas), en cualquier orden. */
  lots: readonly TradeLot[];
  /** Participaciones que se quieren vender. */
  quantity: number;
  /** Precio unitario de venta. */
  price: number;
  /** Comisiones de la venta. Por defecto 0. */
  fees?: number;
}

/**
 * Simula una venta contra el histórico de lotes por el criterio FIFO.
 *
 * Devuelve `null` si la entrada no permite calcular nada (cantidad o precio no finitos,
 * cantidad ≤ 0, precio negativo): preferimos que la UI no muestre resultado a mostrar un
 * número inventado, que es el criterio del resto de la aplicación.
 *
 * El valor de transmisión se reparte entre los lotes consumidos de forma proporcional a las
 * participaciones, de modo que la suma de las ganancias por lote es EXACTAMENTE la ganancia
 * total (no hay descuadre por redondeo del desglose).
 */
export function simulateSale({
  lots,
  quantity,
  price,
  fees = 0,
}: SaleSimulationInput): SaleSimulation | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (!Number.isFinite(price) || price < 0) return null;
  const sellFees = Number.isFinite(fees) && fees > 0 ? fees : 0;

  const open = buildOpenLots(lots);
  const availableQuantity = open.reduce((sum, lot) => sum + lot.quantity, 0);
  const quantitySold = Math.min(quantity, availableQuantity);
  const insufficient = quantity > availableQuantity + QUANTITY_EPSILON;

  const grossProceeds = quantitySold * price;
  // Las comisiones de venta se restan enteras: son de la operación, no de cada participación.
  const transferValue = grossProceeds - sellFees;

  const matched: MatchedLot[] = [];
  let pending = quantitySold;
  let acquisitionValue = 0;

  for (const lot of open) {
    if (pending <= QUANTITY_EPSILON) break;
    const taken = Math.min(lot.quantity, pending);
    const lotAcquisition = taken * (lot.price + lot.feesPerUnit);
    // Reparto proporcional del valor de transmisión (incluida la comisión de venta).
    const lotTransfer = quantitySold > 0 ? (transferValue * taken) / quantitySold : 0;

    matched.push({
      lotId: lot.lotId,
      tradedAt: lot.tradedAt,
      quantity: taken,
      price: lot.price,
      acquisitionValue: lotAcquisition,
      transferValue: lotTransfer,
      gain: lotTransfer - lotAcquisition,
    });

    acquisitionValue += lotAcquisition;
    pending -= taken;
    lot.quantity -= taken;
  }

  // `open` ya está mutado: lo que queda con cantidad viva es la posición posterior a la venta.
  const rest = open.filter((lot) => lot.quantity > QUANTITY_EPSILON);
  const remainingQuantity = rest.reduce((sum, lot) => sum + lot.quantity, 0);
  const remainingCost = rest.reduce((sum, lot) => sum + lot.quantity * lot.price, 0);

  return {
    availableQuantity,
    insufficient,
    quantitySold,
    grossProceeds,
    sellFees,
    transferValue,
    acquisitionValue,
    gain: transferValue - acquisitionValue,
    matched,
    remainingQuantity,
    remainingAvgPrice: remainingQuantity > 0 ? remainingCost / remainingQuantity : 0,
  };
}

/**
 * Estima la cuota del IRPF del ahorro de una ganancia patrimonial AISLADA, en euros.
 *
 * Una pérdida da cuota 0: aquí no se compensa con nada (ver el alcance del encabezado), así
 * que el ahorro fiscal real de una minusvalía no aparece en este número.
 */
export function estimateSavingsTax(gain: number): SavingsTaxEstimate {
  if (!Number.isFinite(gain)) {
    return { base: NaN, tax: NaN, net: NaN, effectiveRate: null, marginal: NaN };
  }
  const base = Math.max(0, gain);
  const tax = applyProgressiveBrackets(base, IRPF_AHORRO);
  return {
    base,
    tax,
    net: gain - tax,
    effectiveRate: base > 0 ? effectiveRate(base, IRPF_AHORRO) : null,
    marginal: marginalRate(base, IRPF_AHORRO),
  };
}
