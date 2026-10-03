import { describe, expect, it } from "vitest";

import { taxBoxesFor } from "./tax-boxes.js";

describe("taxBoxesFor", () => {
  it("returns the 2025 boxes (casillas) read from the form in Orden HAC/277/2026", () => {
    expect(taxBoxesFor(2025)).toMatchObject({
      interest: "0027",
      dividends: "0029",
      custodyFees: "0037",
      capitalWithholding: "0597",
      shares: { transferValue: "0328", acquisitionValue: "0331" },
      doubleTaxation: "0588",
    });
  });

  it("a tax year without a verified table has no boxes", () => {
    expect(taxBoxesFor(2024)).toBeNull();
    expect(taxBoxesFor(2026)).toBeNull();
  });
});
