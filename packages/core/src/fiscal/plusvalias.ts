// Ganancias y pérdidas patrimoniales por transmisión de valores homogéneos: emparejamiento
// FIFO de lotes. Core puro. La cuota del ahorro vive en `savings-tax.ts`.
// Lo usan la simulación de venta y el informe `realised-gains.ts`, con las mismas reglas.
// Alcance fiscal (qué modela y qué no): ver ./README.md. Resultado solo orientativo.

import { finiteOr, QUANTITY_EPSILON } from "../inputs.js";
import type { PositionLot } from "../portfolio/types.js";
import { compareStrings } from "../compare.js";

/**
 * Operación del histórico de una posición, como la sirve `GET /api/positions/:id/lots`, en la
 * divisa de la posición: un `PositionLot` sin lo que el FIFO no usa. `createdAt` es opcional
 * porque una simulación o un test pueden no tenerlo.
 */
export type TradeLot = Pick<PositionLot, "id" | "kind" | "quantity" | "price" | "fees" | "tradedAt"> &
  Partial<Pick<PositionLot, "createdAt">>;

/** Lote de compra con la parte aún sin vender. */
export interface OpenLot {
  lotId: string;
  tradedAt: string;
  /** Participaciones vivas del lote. */
  quantity: number;
  /** Precio unitario de compra. */
  price: number;
  /** Comisiones de compra por participación (prorrateo coherente si el lote se vende en varias veces). */
  feesPerUnit: number;
}

/** Trozo de un lote consumido por una venta, con su ganancia. */
export interface MatchedLot {
  lotId: string;
  tradedAt: string;
  /** Participaciones de este lote que absorbe la venta. */
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
  /** `true` si se piden más participaciones de las que hay; los importes usan solo lo disponible y la UI debe avisar. */
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

/**
 * Orden canónico `(tradedAt, createdAt, id)`, el mismo que el backend (`lot-aggregate.ts`).
 * `tradedAt` no lleva hora: sin desempate el FIFO del mismo día no sería determinista.
 */
export function compareTradeLots(a: TradeLot, b: TradeLot): number {
  if (a.tradedAt !== b.tradedAt) return compareStrings(a.tradedAt, b.tradedAt);
  const ca = a.createdAt ?? "";
  const cb = b.createdAt ?? "";
  if (ca !== cb) return compareStrings(ca, cb);
  return compareStrings(a.id, b.id);
}

/** Venta registrada, emparejada por FIFO contra las compras anteriores. */
export interface RealisedSale {
  /** Id del lote de venta. */
  lotId: string;
  /** Fecha de la venta (`YYYY-MM-DD`). */
  tradedAt: string;
  /** Participaciones emparejadas (las de la venta, salvo exceso sobre lo disponible). */
  quantity: number;
  /** Precio unitario de venta. */
  price: number;
  grossProceeds: number;
  sellFees: number;
  transferValue: number;
  acquisitionValue: number;
  gain: number;
  matched: MatchedLot[];
}

/** Resultado de recorrer el histórico: lo que queda vivo y las ventas ya realizadas. */
export interface LotWalk {
  /** Lotes de compra con la parte todavía sin vender, en orden cronológico. */
  open: OpenLot[];
  /** Ventas registradas, en orden cronológico, con su ganancia o pérdida. */
  sales: RealisedSale[];
  /**
   * Ids de las compras que se trataron como ampliación liberada y se repartieron entre los
   * lotes vivos (no son lote propio ni compra a efectos de la regla de los dos meses).
   */
  bonusIssueIds: string[];
  /**
   * Solo con `trackOpenLots`: lotes vivos justo después de cada venta (clave: id de la venta),
   * en las participaciones de ese momento. No forma parte del resultado serializable.
   */
  openAfterSale?: ReadonlyMap<string, readonly { lotId: string; quantity: number }[]>;
}

/** Opciones de `walkLots`. */
export interface WalkLotsOptions {
  /** Guarda en `openAfterSale` los lotes vivos tras cada venta (lo necesita `wash-sale.ts`). */
  trackOpenLots?: boolean;
}

/** Importes de una venta emparejada contra `open` (que se consume en el proceso). */
type SaleMatch = Omit<RealisedSale, "lotId" | "tradedAt" | "price">;

/**
 * Empareja una venta contra los lotes vivos por FIFO, consumiéndolos (muta `open`). Es la
 * única implementación: simulación y ventas registradas dan la misma cifra. El valor de
 * transmisión se reparte proporcional a las participaciones, así que las ganancias por lote
 * suman exactamente la total. Si la venta excede lo disponible, empareja solo lo que hay.
 */
function matchSale(open: OpenLot[], quantity: number, price: number, sellFees: number): SaleMatch {
  const available = open.reduce((sum, lot) => sum + lot.quantity, 0);
  const quantitySold = Math.min(quantity, available);
  const grossProceeds = quantitySold * price;
  // Comisión de venta entera (es de la operación); sin existencias no hay transmisión a la que imputarla.
  const fees = quantitySold > 0 ? sellFees : 0;
  const transferValue = grossProceeds - fees;

  const matched: MatchedLot[] = [];
  let pending = quantitySold;
  let acquisitionValue = 0;

  while (pending > QUANTITY_EPSILON && open.length > 0) {
    const lot = open[0];
    const taken = Math.min(lot.quantity, pending);
    const lotAcquisition = taken * (lot.price + lot.feesPerUnit);
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
    // Con tolerancia: restar decimales deja restos de 1e-16 que ensuciarían el desglose.
    if (lot.quantity <= QUANTITY_EPSILON) open.shift();
  }

  return {
    quantity: quantitySold,
    grossProceeds,
    sellFees: fees,
    transferValue,
    acquisitionValue,
    gain: transferValue - acquisitionValue,
    matched,
  };
}

/** Comisiones saneadas: no finitas o negativas cuentan como 0. */
const cleanFees = (fees: number) => (Number.isFinite(fees) && fees > 0 ? fees : 0);

/**
 * Ampliación liberada (art. 37.1.a LIRPF): las acciones nuevas reparten el coste de las
 * antiguas y heredan su antigüedad. Reparte `quantity` entre los lotes vivos en proporción a
 * sus participaciones: cada lote gana títulos, conserva su coste total (precio y comisiones por
 * participación bajan en la misma proporción) y su fecha, y por tanto su orden FIFO.
 */
function applyBonusIssue(open: OpenLot[], quantity: number): void {
  const total = open.reduce((sum, lot) => sum + lot.quantity, 0);
  const factor = (total + quantity) / total;
  for (const lot of open) {
    lot.quantity *= factor;
    lot.price /= factor;
    lot.feesPerUnit /= factor;
  }
}

/**
 * Recorre el histórico en orden canónico aplicando las ventas por FIFO; devuelve los lotes
 * vivos y las ventas con su ganancia. Una venta que exceda lo disponible (el backend la
 * rechaza) agota existencias y el exceso se ignora, para no dejar cantidades negativas.
 *
 * **Ampliaciones liberadas.** Una compra a precio 0 y sin comisiones se interpreta como acciones
 * totalmente liberadas (el importador convierte así las `BONUS_ISSUE`) y se reparte entre los
 * lotes vivos (`applyBonusIssue`), con la antigüedad de las antiguas. Las parcialmente liberadas
 * (se paga algo) no se distinguen de una compra normal y siguen como compra. Sin lotes vivos, es
 * una compra a precio 0. Afecta también a `simulateSale` y `buildOpenLots`.
 */
export function walkLots(lots: readonly TradeLot[], options: WalkLotsOptions = {}): LotWalk {
  const ordered = [...lots].sort(compareTradeLots);
  const open: OpenLot[] = [];
  const sales: RealisedSale[] = [];
  const bonusIssueIds: string[] = [];
  const openAfterSale = options.trackOpenLots ? new Map<string, { lotId: string; quantity: number }[]>() : undefined;

  for (const lot of ordered) {
    if (!Number.isFinite(lot.quantity) || lot.quantity <= 0) continue;
    const price = finiteOr(lot.price, 0);

    if (lot.kind === "buy") {
      // Ampliación liberada: precio 0 DE VERDAD (no un precio no numérico saneado a 0), sin
      // comisiones y con lotes vivos. Ver README, "Ampliaciones liberadas".
      const isBonusIssue =
        lot.price === 0 && cleanFees(lot.fees) === 0 && open.some((l) => l.quantity > QUANTITY_EPSILON);
      if (isBonusIssue) {
        applyBonusIssue(open, lot.quantity);
        bonusIssueIds.push(lot.id);
        continue;
      }
      open.push({
        lotId: lot.id,
        tradedAt: lot.tradedAt,
        quantity: lot.quantity,
        price,
        feesPerUnit: cleanFees(lot.fees) / lot.quantity,
      });
      continue;
    }

    const match = matchSale(open, lot.quantity, price, cleanFees(lot.fees));
    sales.push({ lotId: lot.id, tradedAt: lot.tradedAt, price, ...match });
    openAfterSale?.set(
      lot.id,
      open.map((l) => ({ lotId: l.lotId, quantity: l.quantity })),
    );
  }

  return { open, sales, bonusIssueIds, ...(openAfterSale ? { openAfterSale } : {}) };
}

/** Lotes de compra vivos tras aplicar las ventas registradas (ver `walkLots`). */
export function buildOpenLots(lots: readonly TradeLot[]): OpenLot[] {
  return walkLots(lots).open;
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
 * Simula una venta contra el histórico por FIFO. Devuelve `null` si la entrada no permite
 * calcular (cantidad o precio no finitos, cantidad ≤ 0, precio negativo): mejor sin
 * resultado que un número inventado.
 */
export function simulateSale({ lots, quantity, price, fees = 0 }: SaleSimulationInput): SaleSimulation | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (!Number.isFinite(price) || price < 0) return null;
  const sellFees = cleanFees(fees);

  const open = buildOpenLots(lots);
  const availableQuantity = open.reduce((sum, lot) => sum + lot.quantity, 0);
  const insufficient = quantity > availableQuantity + QUANTITY_EPSILON;
  const sale = matchSale(open, quantity, price, sellFees);

  // `open` ya está consumido: es la posición posterior a la venta.
  const remainingQuantity = open.reduce((sum, lot) => sum + lot.quantity, 0);
  const remainingCost = open.reduce((sum, lot) => sum + lot.quantity * lot.price, 0);

  return {
    availableQuantity,
    insufficient,
    quantitySold: sale.quantity,
    grossProceeds: sale.grossProceeds,
    sellFees: sale.sellFees,
    transferValue: sale.transferValue,
    acquisitionValue: sale.acquisitionValue,
    gain: sale.gain,
    matched: sale.matched,
    remainingQuantity,
    remainingAvgPrice: remainingQuantity > 0 ? remainingCost / remainingQuantity : 0,
  };
}
