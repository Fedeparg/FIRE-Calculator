// Red de seguridad de la refactorización de amortization.ts: congela las salidas de las cuatro
// calculadoras que comparten la matemática de préstamos sobre una rejilla de entradas, incluidos
// los bordes (tipo 0, plazos mínimos, tipos enormes). La huella serializa los números con toda
// su precisión (en forma de huella SHA-256 para que el fichero ocupe poco), así que cualquier
// reordenación de operaciones en coma flotante lo rompe.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { computeEarlyRepayment } from "./amortizacion-anticipada.js";
import { computeAffordability } from "./hipoteca-asequible.js";
import { computeMortgage } from "./hipoteca.js";
import { computeCreditCard } from "./tarjeta-credito.js";

const RATES = [0, 0.01, 1.5, 3, 7.25, 25, 500, 1e6, -2];
const YEARS = [0, 0.4, 1, 2, 10, 30, 40];
const PRINCIPALS = [0, 1, 1000, 180000, 5e7];

/** Huella de la serialización completa; los no finitos se escriben como texto porque JSON los volvería `null`. */
function fingerprint(value: unknown): string {
  const json = JSON.stringify(value, (_key, v: unknown) =>
    typeof v === "number" && !Number.isFinite(v) ? String(v) : v,
  );
  return `${(JSON.parse(json) as unknown[]).length} casos, sha256 ${createHash("sha256").update(json).digest("hex")}`;
}

describe("characterization: matemática de préstamos", () => {
  it("computeMortgage", () => {
    const out: unknown[] = [];
    for (const annualRate of RATES)
      for (const years of YEARS)
        for (const principal of PRINCIPALS)
          out.push(computeMortgage({ principal, annualRate, years, openingFeeRate: 1, annualInsurance: 300 }));
    expect(fingerprint(out)).toMatchSnapshot();
  });

  it("computeEarlyRepayment", () => {
    const out: unknown[] = [];
    for (const annualRate of RATES)
      for (const remainingYears of YEARS)
        for (const pendingPrincipal of PRINCIPALS)
          for (const extraPayment of [0, 500, 20000, 1e9])
            out.push(
              computeEarlyRepayment({
                pendingPrincipal,
                annualRate,
                remainingYears,
                extraPayment,
                compensationRate: 2,
              }),
            );
    expect(fingerprint(out)).toMatchSnapshot();
  });

  it("computeAffordability", () => {
    const out: unknown[] = [];
    for (const annualRate of RATES)
      for (const termYears of YEARS)
        for (const netMonthlyIncome of [0, 1800, 6000])
          for (const downPayment of [0, 20000, 400000])
            out.push(computeAffordability({ netMonthlyIncome, monthlyDebts: 200, downPayment, annualRate, termYears }));
    expect(fingerprint(out)).toMatchSnapshot();
  });

  it("computeCreditCard", () => {
    const out: unknown[] = [];
    for (const annualRate of RATES)
      for (const balance of [0, 1, 3000, 1e6])
        for (const monthlyPayment of [0, 50, 200, 1e7]) {
          out.push(computeCreditCard({ balance, annualRate, monthlyPayment }));
          out.push(
            computeCreditCard({
              balance,
              annualRate,
              monthlyPayment,
              paymentMode: "percent",
              minPercent: 3,
              minFloor: 25,
            }),
          );
        }
    expect(fingerprint(out)).toMatchSnapshot();
  });
});
