// Annual report of realised capital gains and losses (ganancias y pérdidas patrimoniales):
// recorded sales, FIFO-matched (`walkLots`), converted to euros, grouped by tax year and offset
// within it. Pure core module. Scope, currency criterion and sources: see ./README.md.

import { firstItem } from "../arrays.js";
import { compareStrings } from "../compare.js";
import { referenceRateOn, TAX_CURRENCY, toEur, type AppliedRate, type ReferenceRates } from "./fx-reference.js";
import { walkLots, type RealisedSale, type TradeLot } from "./plusvalias.js";
import { estimateSavingsTax, type SavingsTaxEstimate } from "./savings-tax.js";
import { computeWashSales, type WashSaleIntegration } from "./wash-sale.js";

/** A position with its history, as the portfolio holds it. */
export interface RealisedGainsPosition {
  id: string;
  ticker: string;
  name: string | null;
  currency: string;
  lots: readonly TradeLot[];
  /**
   * Derivative. It only serves to avoid FIFO-matching it with a share of the same symbol: the
   * two-month rule does apply to it, because the ones in the portfolio are warrants and
   * certificates with an ISIN, which are transferable securities (DGT V1790-07); V2172-21 and
   * V3755-16 only exclude contracts such as options and futures. Defaults to `false`.
   */
  isDerivative?: boolean;
}

/**
 * A foreign-currency sale converted to euros with the DGT criterion: the gain is computed in the
 * currency and converted at the sale-date rate; the FX difference (diferencia de cambio) of the
 * invested currency is a separate gain or loss. In euros, `fxDifference` is 0 and the rate is 1.
 */
export interface SaleInEur {
  /** Sale-date rate, the one that converts the transfer and acquisition values. */
  sellRate: AppliedRate;
  transferValue: number;
  acquisitionValue: number;
  gain: number;
  /** Loss of this sale not computed under the two-month rule (≤ 0), in euros at this sale's rate. */
  deferredLoss: number;
  /**
   * Loss from earlier sales integrated into this one (≤ 0), in euros. Each part is converted at the
   * rate of the sale where the loss arose (if that sale has no rate, at this one's).
   */
  integratedLoss: number;
  /** Result this sale computes in its tax year: `gain − deferredLoss + integratedLoss`. */
  computableGain: number;
  /**
   * FX difference of the currency used to buy what was sold, assuming it was bought with euros
   * converted that day and that the proceeds are converted to euros on the sale date (what a
   * broker with a euro account does). `null` if the rate of some purchase is missing.
   */
  fxDifference: number | null;
  /** Rate on the date of each matched purchase, aligned with `matched`. */
  buyRates: (AppliedRate | null)[];
}

/** A report sale with its position; it is the CSV row. The `RealisedSale` amounts are in the position's currency. */
export interface RealisedGainsSale extends RealisedSale {
  positionId: string;
  ticker: string;
  name: string | null;
  currency: string;
  /** The sale in euros, or `null` if there is no reference rate for the sale date. */
  eur: SaleInEur | null;
  /** Loss of this sale deferred by the two-month rule (≤ 0), in the position's currency. */
  deferredLoss: number;
  /** Shares sold at a loss that are blocked by homogeneous purchases. */
  deferredQuantity: number;
  /** Loss from earlier sales integrated here (≤ 0), in the position's currency. */
  integratedLoss: number;
  /** Breakdown of `integratedLoss` by originating sale. */
  integratedFrom: WashSaleIntegration[];
}

/** A position's sales in a tax year, summed and in euros. */
export interface RealisedGainsRow {
  positionId: string;
  ticker: string;
  name: string | null;
  currency: string;
  /** Number of the position's sales in the tax year. */
  sales: number;
  quantity: number;
  transferValue: number;
  acquisitionValue: number;
  /** Computable result: already without the deferred losses and with the integrated ones (`computableGain`). */
  gain: number;
  /** Deferred losses of those sales (≤ 0), in euros. */
  deferredLoss: number;
  /** Losses from earlier years integrated into those sales (≤ 0), in euros. */
  integratedLoss: number;
  /** Sum of the known FX differences of those sales. */
  fxDifference: number;
}

/** Sales in a currency that could not be converted to euros, in that currency. */
export interface RealisedGainsUnconverted {
  currency: string;
  sales: number;
  /** Balance of those sales, in the currency. */
  gain: number;
}

export interface RealisedGainsYear {
  year: number;
  /** Positions with converted sales, by symbol. */
  rows: RealisedGainsRow[];
  /** All the tax year's sales, in chronological order (unconverted ones with `eur: null`). */
  sales: RealisedGainsSale[];
  /** Sum of the sales with a computable gain, in euros. */
  gains: number;
  /** Sum of the sales with a computable loss (≤ 0), in euros. */
  losses: number;
  /** Balance of the securities sales: `gains + losses`, without the deferred losses and with the integrated ones. */
  net: number;
  /** Losses of this tax year not computed under the two-month rule (≤ 0), in euros. */
  deferred: number;
  /** Deferred losses from earlier tax years integrated into this one (≤ 0), in euros. */
  integrated: number;
  /** Balance of the known FX differences. */
  fxDifference: number;
  /** Foreign-currency sales whose FX difference could not be computed (the rate of some purchase is missing). */
  fxIncomplete: number;
  /** Sales without a reference rate on the sale date, by currency: left out of the totals. */
  unconverted: RealisedGainsUnconverted[];
  /** Balance that goes into the savings base (base del ahorro): `net + fxDifference`. */
  total: number;
  /** Estimated tax on `total`; with a net loss, 0 (not carried forward). */
  tax: SavingsTaxEstimate;
}

export interface RealisedGainsReport {
  /** Tax years with at least one sale, from newest to oldest. */
  years: RealisedGainsYear[];
}

/** A sale's tax year: the calendar year of its `YYYY-MM-DD` date. */
function fiscalYear(tradedAt: string): number {
  return Number(tradedAt.slice(0, 4));
}

/**
 * Homogeneous-security key: symbol (case-insensitive) and currency, since amounts in different
 * currencies are not matched. A derivative with the same symbol as a share is not homogeneous
 * with it.
 */
function securityKey(position: RealisedGainsPosition): string {
  return `${position.ticker.trim().toUpperCase()}\u0000${position.currency}\u0000${position.isDerivative ? "d" : ""}`;
}

/** Reference rates the report needs: currencies and the date to request them from. */
export interface ReferenceRatesRequest {
  currencies: string[];
  /** Oldest transaction in those currencies (`YYYY-MM-DD`). */
  from: string;
}

/**
 * Which rates to request for `buildRealisedGainsReport`: the non-euro currencies of the
 * securities with at least one sale, from their oldest transaction. It looks at the whole
 * security, not the position: FIFO can match a sale at one broker with an old purchase at another.
 * `null` if none is needed.
 */
export function referenceRatesNeeded(positions: readonly RealisedGainsPosition[]): ReferenceRatesRequest | null {
  const bySecurity = new Map<string, RealisedGainsPosition[]>();
  for (const position of positions) {
    if (position.currency === TAX_CURRENCY) continue;
    const key = securityKey(position);
    const existing = bySecurity.get(key);
    if (existing) existing.push(position);
    else bySecurity.set(key, [position]);
  }

  const currencies = new Set<string>();
  let from: string | null = null;
  for (const group of bySecurity.values()) {
    const lots = group.flatMap((p) => p.lots);
    if (!lots.some((lot) => lot.kind === "sell")) continue;
    currencies.add(firstItem(group).currency);
    for (const lot of lots) if (from === null || lot.tradedAt < from) from = lot.tradedAt;
  }
  return from === null ? null : { currencies: [...currencies].sort(), from };
}

/** Converts a sale to euros with the DGT criterion, or `null` if the sale-date rate is missing. */
function convertSale(sale: RealisedSale, currency: string, rates: ReferenceRates): SaleInEur | null {
  const sellRate = referenceRateOn(rates, currency, sale.tradedAt);
  if (!sellRate) return null;

  const buyRates = sale.matched.map((m) => referenceRateOn(rates, currency, m.tradedAt));
  let fxDifference: number | null = 0;
  if (currency !== TAX_CURRENCY) {
    for (const [i, m] of sale.matched.entries()) {
      const buyRate = buyRates[i];
      if (!buyRate || fxDifference === null) {
        fxDifference = null;
        break;
      }
      // Currency invested in that lot: it cost `toEur(A, purchase)` and goes back to euros at `toEur(A, sale)`.
      fxDifference += toEur(m.acquisitionValue, sellRate) - toEur(m.acquisitionValue, buyRate);
    }
  }

  return {
    sellRate,
    transferValue: toEur(sale.transferValue, sellRate),
    acquisitionValue: toEur(sale.acquisitionValue, sellRate),
    gain: toEur(sale.gain, sellRate),
    // The two-month rule is applied later, with all the security's sales in view.
    deferredLoss: 0,
    integratedLoss: 0,
    computableGain: toEur(sale.gain, sellRate),
    fxDifference,
    buyRates,
  };
}

/**
 * Builds the report from the positions and their history; only those with sales appear.
 * `rates` are the ECB reference rates for the non-euro currencies.
 */
export function buildRealisedGainsReport(
  positions: readonly RealisedGainsPosition[],
  rates: ReferenceRates,
): RealisedGainsReport {
  const bySecurity = new Map<string, RealisedGainsPosition[]>();
  for (const position of positions) {
    const key = securityKey(position);
    const existing = bySecurity.get(key);
    if (existing) existing.push(position);
    else bySecurity.set(key, [position]);
  }

  const byYear = new Map<number, RealisedGainsSale[]>();

  for (const group of bySecurity.values()) {
    // FIFO over all of the security's transactions together.
    const owner = new Map<string, RealisedGainsPosition>();
    for (const position of group) for (const lot of position.lots) owner.set(lot.id, position);

    const groupLots = group.flatMap((p) => p.lots);
    const walk = walkLots(groupLots, { trackOpenLots: true });
    // Two-month rule (art. 33.5.f), also for warrants and certificates (see `isDerivative`).
    const wash = computeWashSales(groupLots, walk);

    const groupSales: RealisedGainsSale[] = [];
    for (const sale of walk.sales) {
      // A sale that matched nothing (inconsistent history) realises no gain.
      if (sale.quantity <= 0) continue;
      const year = fiscalYear(sale.tradedAt);
      const position = owner.get(sale.lotId);
      if (!Number.isInteger(year) || !position) continue;
      const effect = wash?.get(sale.lotId);
      groupSales.push({
        ...sale,
        positionId: position.id,
        ticker: position.ticker,
        name: position.name,
        currency: position.currency,
        eur: convertSale(sale, position.currency, rates),
        deferredLoss: effect?.deferredLoss ?? 0,
        deferredQuantity: effect?.deferredQuantity ?? 0,
        integratedLoss: effect?.integratedLoss ?? 0,
        integratedFrom: effect?.integratedFrom ?? [],
      });
    }
    applyWashSalesInEur(groupSales);

    for (const sale of groupSales) {
      const year = fiscalYear(sale.tradedAt);
      const existing = byYear.get(year);
      if (existing) existing.push(sale);
      else byYear.set(year, [sale]);
    }
  }

  const years = [...byYear.entries()].sort(([a], [b]) => b - a).map(([year, sales]) => buildYear(year, sales));

  return { years };
}

/**
 * Converts to euros the deferred and integrated losses of a security's sales (mutates `eur`). The
 * deferred loss is converted at the rate of the sale that caused it (the DGT one for that sale)
 * and later integrated for that same amount in euros, not at the rate of the later sale. If the
 * originating sale has no rate (it is left out of the totals), the integrating sale's rate is used.
 */
function applyWashSalesInEur(sales: readonly RealisedGainsSale[]): void {
  const byId = new Map(sales.map((sale) => [sale.lotId, sale]));
  for (const sale of sales) {
    const { eur } = sale;
    if (!eur) continue;
    eur.deferredLoss = toEur(sale.deferredLoss, eur.sellRate);
    eur.integratedLoss = sale.integratedFrom.reduce((sum, part) => {
      const rate = byId.get(part.fromSaleId)?.eur?.sellRate ?? eur.sellRate;
      return sum + toEur(part.loss, rate);
    }, 0);
    eur.computableGain = eur.gain - eur.deferredLoss + eur.integratedLoss;
  }
}

function buildYear(year: number, sales: RealisedGainsSale[]): RealisedGainsYear {
  const ordered = [...sales].sort((a, b) =>
    a.tradedAt !== b.tradedAt ? compareStrings(a.tradedAt, b.tradedAt) : a.ticker.localeCompare(b.ticker),
  );

  const rows = new Map<string, RealisedGainsRow>();
  const unconverted = new Map<string, RealisedGainsUnconverted>();
  let gains = 0;
  let losses = 0;
  let deferred = 0;
  let integrated = 0;
  let fxDifference = 0;
  let fxIncomplete = 0;

  for (const sale of ordered) {
    const { eur } = sale;
    if (!eur) {
      const entry = unconverted.get(sale.currency) ?? { currency: sale.currency, sales: 0, gain: 0 };
      entry.sales += 1;
      entry.gain += sale.gain;
      unconverted.set(sale.currency, entry);
      continue;
    }

    if (eur.computableGain >= 0) gains += eur.computableGain;
    else losses += eur.computableGain;
    deferred += eur.deferredLoss;
    integrated += eur.integratedLoss;
    if (eur.fxDifference === null) fxIncomplete += 1;
    else fxDifference += eur.fxDifference;

    const row = rows.get(sale.positionId) ?? {
      positionId: sale.positionId,
      ticker: sale.ticker,
      name: sale.name,
      currency: sale.currency,
      sales: 0,
      quantity: 0,
      transferValue: 0,
      acquisitionValue: 0,
      gain: 0,
      deferredLoss: 0,
      integratedLoss: 0,
      fxDifference: 0,
    };
    row.sales += 1;
    row.quantity += sale.quantity;
    row.transferValue += eur.transferValue;
    row.acquisitionValue += eur.acquisitionValue;
    row.gain += eur.computableGain;
    row.deferredLoss += eur.deferredLoss;
    row.integratedLoss += eur.integratedLoss;
    row.fxDifference += eur.fxDifference ?? 0;
    rows.set(sale.positionId, row);
  }

  const net = gains + losses;
  const total = net + fxDifference;
  return {
    year,
    rows: [...rows.values()].sort((a, b) => a.ticker.localeCompare(b.ticker)),
    sales: ordered,
    gains,
    losses,
    net,
    deferred,
    integrated,
    fxDifference,
    fxIncomplete,
    unconverted: [...unconverted.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
    total,
    // Tax on the offset balance; if it is negative, `estimateSavingsTax` gives 0.
    tax: estimateSavingsTax(total),
  };
}
