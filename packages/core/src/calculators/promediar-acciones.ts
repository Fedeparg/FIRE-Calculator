// Share price averaging (DCA): weighted average price with commissions and optional valuation at the current
// price. Pure core.

export interface SharePurchase {
  price: number;
  shares: number;
  commission?: number;
}

export interface AveragePriceInput {
  purchases: SharePurchase[];
  currentPrice?: number;
}

export interface AveragePriceResult {
  totalShares: number;
  grossCost: number;
  totalCommission: number;
  totalCost: number;
  averagePrice: number;
  /** Break-even price per share (commissions included): above it you are in profit. */
  breakEvenPrice: number;
  marketValue: number | null;
  unrealizedGain: number | null;
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
