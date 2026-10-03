import { describe, expect, it } from "vitest";

import { taxBoxesFor } from "./tax-boxes.js";

describe("taxBoxesFor", () => {
  it("da las casillas de 2025 leídas del modelo de la Orden HAC/277/2026", () => {
    expect(taxBoxesFor(2025)).toMatchObject({
      interest: "0027",
      dividends: "0029",
      custodyFees: "0037",
      capitalWithholding: "0597",
      shares: { transferValue: "0328", acquisitionValue: "0331" },
      doubleTaxation: "0588",
    });
  });

  it("un ejercicio sin tabla verificada no tiene casillas", () => {
    expect(taxBoxesFor(2024)).toBeNull();
    expect(taxBoxesFor(2026)).toBeNull();
  });
});
