import "server-only";

import { serverApiFetch } from "@/shared/api/api.server";
import type { ReferenceRates } from "@sextante/core/fiscal/fx-reference";
import type { IncomeEvent } from "@sextante/core/fiscal/income";
import type { RealisedGainsPosition } from "@sextante/core/fiscal/realised-gains";
import { referenceRatesRequest, toRealisedGainsPositions } from "@sextante/core/fiscal/report-inputs";
import type { PendingNegative } from "@sextante/core/fiscal/savings-base";
import type { AssetClass, Position, PositionLot } from "@sextante/core/portfolio/types";

/** Positions for the initial SSR; `[]` on any failure (the page is already protected). */
export async function fetchPositions(): Promise<Position[]> {
  return (await serverApiFetch<Position[]>("/api/positions")) ?? [];
}

/** What the tax report needs: sales and income. */
export type RealisedGainsData = {
  positions: RealisedGainsPosition[];
  income: IncomeEvent[];
  /** Pending negative balances from years Sextante does not compute. */
  pendingBalances: PendingNegative[];
  /** Asset class of each position: decides which tax-return block its sales go to. */
  assetClasses: Record<string, AssetClass | null>;
  /** ECB reference rates for the currencies with sales or income (empty if everything is in euros). */
  rates: ReferenceRates;
  /** `false` if rates were needed and could not be loaded: foreign-currency sales stay unconverted. */
  ratesLoaded: boolean;
};

/**
 * Positions with all their trades, the income and the ECB rates they need, for the tax report;
 * `null` if reading the portfolio fails. It is not disguised as an empty list: "you have no
 * sales" because of an error would be a false tax statement. Without rates the report still
 * renders and flags what it could not convert.
 */
export async function fetchRealisedGainsData(): Promise<RealisedGainsData | null> {
  const [positions, lots, income, pendingBalances] = await Promise.all([
    serverApiFetch<Position[]>("/api/positions"),
    serverApiFetch<PositionLot[]>("/api/positions/lots"),
    serverApiFetch<IncomeEvent[]>("/api/income"),
    serverApiFetch<PendingNegative[]>("/api/tax-return/pending-balances"),
  ]);
  if (!positions || !lots || !income || !pendingBalances) return null;

  const input = toRealisedGainsPositions(positions, lots);
  const assetClasses = Object.fromEntries(positions.map((p) => [p.id, p.assetClass]));
  const needed = referenceRatesRequest(input, income);
  if (!needed) return { positions: input, income, pendingBalances, assetClasses, rates: {}, ratesLoaded: true };

  const query = new URLSearchParams({ currencies: needed.currencies.join(","), from: needed.from });
  const rates = await serverApiFetch<ReferenceRates>(`/api/fx/reference-rates?${query.toString()}`);
  return { positions: input, income, pendingBalances, assetClasses, rates: rates ?? {}, ratesLoaded: rates !== null };
}
