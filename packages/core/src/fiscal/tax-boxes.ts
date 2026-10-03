// Boxes (casillas) of form 100 (modelo 100, IRPF) per tax year, to show each figure with the box
// it is reported in. They change every year: a tax year without a table is shown without box
// numbers. Source and criterion: see ./README.md, section `tax-boxes.ts`.

/** Savings base (base del ahorro) boxes used by the report. */
export interface TaxBoxes {
  /** Regulation approving the tax year's form. */
  source: string;
  interest: string;
  dividends: string;
  /** Administration and custody expenses for transferable securities. */
  custodyFees: string;
  /** Withholdings and payments on account on capital income (capital mobiliario). */
  capitalWithholding: string;
  /** Shares admitted to trading, per issuing entity. */
  shares: { entity: string; transferValue: string; acquisitionValue: string; gains: string; losses: string };
  /** Funds and ETFs (IIC) not subject to withholding: typically foreign (art. 75.3.j RIRPF). */
  fundsWithoutWithholding: {
    name: string;
    transferValue: string;
    acquisitionValue: string;
    gains: string;
    losses: string;
  };
  /** Other assets: the block's range (derivatives go here, by exclusion). */
  otherAssets: string;
  /** Offsetting the negative capital income balance against gains (25%) and vice versa. */
  crossCompensation: { capitalIncomeWithGains: string; gainsWithCapitalIncome: string };
  /** Pending negative balances from the four previous tax years, from oldest to newest. */
  pendingGains: readonly string[];
  pendingCapitalIncome: readonly string[];
  doubleTaxation: string;
}

/**
 * Per tax year. 2025: Orden HAC/277/2026, de 25 de marzo (BOE-A-2026-7041), numbers read from the
 * form itself and cross-checked against the AEAT's Manual práctico de Renta 2025.
 */
const TAX_BOXES: Readonly<Record<number, TaxBoxes>> = {
  2025: {
    source: "Orden HAC/277/2026 (BOE-A-2026-7041)",
    interest: "0027",
    dividends: "0029",
    custodyFees: "0037",
    capitalWithholding: "0597",
    shares: { entity: "0327", transferValue: "0328", acquisitionValue: "0331", gains: "0332", losses: "0338" },
    fundsWithoutWithholding: {
      name: "2226",
      transferValue: "2227",
      acquisitionValue: "2229",
      gains: "2230",
      losses: "2233",
    },
    otherAssets: "1624-1654",
    crossCompensation: { capitalIncomeWithGains: "0436", gainsWithCapitalIncome: "0446" },
    pendingGains: ["0439", "0440", "0441", "0442"],
    pendingCapitalIncome: ["0449", "0450", "0451", "0452"],
    doubleTaxation: "0588",
  },
};

/** The tax year's boxes, or `null` if they are not verified for that year. */
export function taxBoxesFor(year: number): TaxBoxes | null {
  return TAX_BOXES[year] ?? null;
}
