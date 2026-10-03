// Shared types of the trade import. Generic on purpose: each broker parser produces
// `ImportedTrade` and everything else (plan in the API, preview in the UI) does not know which
// broker it came from.

import type { ValueSource } from "../fiscal/income.js";
import type { AssetClass } from "../portfolio/types.js";

/** Normalized asset class (the portfolio's own); `other` covers empty or unclassified values. */
export type ImportedAssetClass = AssetClass;

/**
 * Normalized buy or sell. Amounts travel as decimal `string`s so they never go through floating
 * point on their way to `numeric(18,6)`, already rounded to 6 decimals. `fees` is always positive.
 */
export type ImportedTrade = {
  /** Broker's id for the trade; the deduplication key on re-import. */
  externalId: string;
  isin: string;
  name: string;
  assetClass: ImportedAssetClass;
  kind: "buy" | "sell";
  /** Always positive; `kind` gives the direction. */
  quantity: string;
  price: string;
  fees: string;
  tradedAt: string;
  /** UTC instant with 6 decimal places of seconds, so that sorting as text is reliable. */
  executedAt: string;
};

/**
 * Normalized payout (interest, reward or dividend). Amounts as decimal `string`s, in euros, already
 * rounded to 6 decimals. `reportedToAeat`: the broker already reported it to the AEAT (Spanish
 * branch), so it may appear in the draft return (borrador).
 */
export type ImportedIncome = {
  externalId: string;
  kind: "dividend" | "interest" | "benefit";
  paidAt: string;
  isin: string | null;
  name: string | null;
  /** Source country (ISO 3166-1 alpha-2). */
  country: string | null;
  currency: "EUR";
  /** Gross; negative in a reversal. */
  gross: string;
  /** `null` if it cannot be known. */
  withholdingOrigin: string | null;
  withholdingSpain: string;
  reportedToAeat: boolean;
  /** Provenance of each figure (see `ValueSource` in `fiscal/income`). */
  grossSource: ValueSource;
  withholdingOriginSource: ValueSource | null;
  /** Shares entitled to the dividend, as reported by the broker. */
  quantity: string | null;
  /** Amount paid in the payment currency, if it was not the euro. */
  originalAmount: string | null;
  originalCurrency: string | null;
};

export type ImportSkipReason =
  /** Provisional dividend reversed by TR, together with its reversal. */
  | "dividend_reversed"
  | "ipo_subscription"
  | "cash_movement"
  | "migration_pair"
  | "migration_unbalanced"
  | "bonus_issue_cancelled"
  | "crypto"
  | "unsupported_currency"
  | "duplicate_row"
  | "invalid_row"
  | "unknown_type";

/** Skipped row: carries only the broker's type and the line, never the row's data. */
export type ImportSkippedRow = {
  line: number;
  type: string;
  reason: ImportSkipReason;
};

export type ImportWarning =
  /** Trades with tax on their row: it is not added to the cost. */
  | { code: "trade_tax_ignored"; count: number }
  /** Unpaired custody migration: history may be missing. */
  | { code: "unbalanced_migration"; isin: string; line: number };

export type ImportParseResult = {
  /** Sorted by `executedAt`, then by line on ties. */
  trades: ImportedTrade[];
  /** Payouts, in date and line order. */
  income: ImportedIncome[];
  skipped: ImportSkippedRow[];
  warnings: ImportWarning[];
};

export type ImportFailureCode = "NEGATIVE_QUANTITY" | "OVERFLOW" | "CONFLICT" | "UNEXPECTED";

/** Skipped rows by reason; counts only. */
export type SkippedSummary = { reason: ImportSkipReason; count: number };

export type ImportPlanPosition = {
  isin: string;
  name: string;
  assetClass: ImportedAssetClass;
  /** `create`: does not exist yet; `extend`: lots are added to the existing one. */
  action: "create" | "extend";
  newBuys: number;
  newSells: number;
  /** Trades in the file already imported (by `external_id`). */
  duplicates: number;
  currentQuantity: number;
  /** Quantity after importing; `null` if the sequence would be invalid. */
  resultingQuantity: number | null;
  /** Average cost price after importing, using the file's execution prices; `null` if closed or invalid. */
  resultingAvgPrice: number | null;
  /** Present if the position cannot be imported. */
  blockedBy: ImportFailureCode | null;
  /** Derivative: recorded, but its price is not tracked and it does not add to totals. Not blocking. */
  isDerivative: boolean;
};

/** Payouts in the file: new, already imported, and how many new ones the broker already reported to the AEAT. */
export type ImportIncomeSummary = { created: number; duplicates: number; reportedToAeat: number };

export type ImportPlan = {
  broker: string;
  positions: ImportPlanPosition[];
  totals: { newLots: number; duplicates: number };
  /** In the preview, `created` are the ones that would be created. */
  income: ImportIncomeSummary;
  skipped: SkippedSummary[];
  warnings: ImportWarning[];
};

export type ImportResultPosition = {
  isin: string;
  name: string;
  status: "created" | "extended" | "unchanged" | "failed";
  lotsCreated: number;
  duplicates: number;
  quantity: number | null;
  failure: ImportFailureCode | null;
};

export type ImportResult = {
  broker: string;
  positions: ImportResultPosition[];
  totals: { lotsCreated: number; duplicates: number; failedPositions: number };
  income: ImportIncomeSummary;
  skipped: SkippedSummary[];
  warnings: ImportWarning[];
};
