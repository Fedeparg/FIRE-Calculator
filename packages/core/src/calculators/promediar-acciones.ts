// Promediar acciones (DCA): precio medio ponderado de varias compras, con
// comisiones de compra y, opcionalmente, valoración a precio actual de mercado
// (plusvalía/minusvalía latente y precio de equilibrio). Core puro.

export interface SharePurchase {
  /** Precio por acción de la compra. */
  price: number;
  /** Número de acciones (admite decimales/fracciones). */
  shares: number;
  /** Comisión de la compra (corretaje). Opcional. */
  commission?: number;
}

export interface AveragePriceInput {
  /** Compras realizadas. */
  purchases: SharePurchase[];
  /** Precio actual de mercado por acción (opcional, para valorar la posición). */
  currentPrice?: number;
}

export interface AveragePriceResult {
  /** Total de acciones acumuladas. */
  totalShares: number;
  /** Total invertido en acciones (sin comisiones). */
  grossCost: number;
  /** Comisiones totales pagadas. */
  totalCommission: number;
  /** Coste total (acciones + comisiones). */
  totalCost: number;
  /** Precio medio ponderado por acción (sin comisiones). */
  averagePrice: number;
  /** Precio de equilibrio por acción (incluye comisiones): a partir de aquí ganas. */
  breakEvenPrice: number;
  /** Valor de mercado de la posición al precio actual, o null sin precio. */
  marketValue: number | null;
  /** Plusvalía/minusvalía latente (valor de mercado − coste total), o null. */
  unrealizedGain: number | null;
  /** Rentabilidad latente sobre el coste total (%), o null. */
  returnPct: number | null;
}

export function computeAveragePrice(input: AveragePriceInput): AveragePriceResult {
  let totalShares = 0;
  let grossCost = 0;
  let totalCommission = 0;

  for (const p of input.purchases) {
    const shares = Math.max(0, p.shares || 0);
    const price = Math.max(0, p.price || 0);
    const commission = Math.max(0, p.commission || 0);
    totalShares += shares;
    grossCost += shares * price;
    totalCommission += commission;
  }

  const totalCost = grossCost + totalCommission;
  const averagePrice = totalShares > 0 ? grossCost / totalShares : 0;
  const breakEvenPrice = totalShares > 0 ? totalCost / totalShares : 0;

  const currentPrice = input.currentPrice;
  const hasPrice = currentPrice !== undefined && currentPrice > 0 && totalShares > 0;
  const marketValue = hasPrice ? currentPrice * totalShares : null;
  const unrealizedGain = marketValue !== null ? marketValue - totalCost : null;
  const returnPct = unrealizedGain !== null && totalCost > 0 ? (unrealizedGain / totalCost) * 100 : null;

  return {
    totalShares,
    grossCost,
    totalCommission,
    totalCost,
    averagePrice,
    breakEvenPrice,
    marketValue,
    unrealizedGain,
    returnPct,
  };
}
