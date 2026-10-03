// Política de entradas numéricas de las calculadoras (ver `../inputs.ts`), verificada
// en tabla sobre TODAS ellas: con cada campo numérico a 0, −1, −100 (un −100 % anula los factores
// de crecimiento), NaN, ±Infinity, y con todos a la vez, ninguna lanza; y con entradas finitas
// (0 / negativas) todas las cifras de salida son finitas.

import { describe, expect, it } from "vitest";
import { computeEarlyRepayment } from "./amortizacion-anticipada.js";
import { computeRetirement } from "./ahorro-jubilacion.js";
import { computePensionRelief } from "./desgravacion-plan-pensiones.js";
import { computeDeposit } from "./deposito.js";
import { computeDividends } from "./dividendos.js";
import { simulateFire } from "./fire-montecarlo.js";
import { computeFire } from "./fire.js";
import { computeAffordability } from "./hipoteca-asequible.js";
import { computeBuyVsRent } from "./hipoteca-vs-alquiler.js";
import { computeMortgage } from "./hipoteca.js";
import { computeGiftTax } from "./impuesto-donaciones.js";
import { computeWealthTax } from "./impuesto-patrimonio.js";
import { computeInflation } from "./inflacion.js";
import { computeCompound } from "./interes-compuesto.js";
import { computeSimpleInterest } from "./interes-simple.js";
import { computeSelfEmployedTax } from "./irpf-autonomos.js";
import { computePayrollWithholding } from "./irpf-nomina.js";
import { computeBudget } from "./presupuesto.js";
import { computeAveragePrice } from "./promediar-acciones.js";
import { computeHolidayRental } from "./rentabilidad-alquiler-vacacional.js";
import { computeRentalYield } from "./rentabilidad-alquiler.js";
import { computeRoi } from "./roi.js";
import { computeFinancialHealth } from "./salud-financiera.js";
import { computeStaking } from "./staking.js";
import { computeCreditCard } from "./tarjeta-credito.js";

interface Case {
  name: string;
  /** Entrada válida con TODOS los campos numéricos opcionales rellenos, para poder variar cada uno. */
  baseline: unknown;
  run: (input: never) => unknown;
  /** Rutas de salida no finitas a propósito (la deuda que nunca se paga, una tasa sin casos). */
  allowInfinity?: readonly string[];
}

const CASES: readonly Case[] = [
  {
    name: "ahorro-jubilacion",
    run: computeRetirement,
    baseline: {
      currentAge: 30,
      retirementAge: 65,
      currentSavings: 10000,
      monthlySavings: 500,
      annualReturn: 6,
      inflationRate: 2,
      annualFee: 0.3,
      contributionGrowth: 2,
    },
  },
  {
    name: "amortizacion-anticipada",
    run: computeEarlyRepayment,
    baseline: {
      pendingPrincipal: 150000,
      annualRate: 3,
      remainingYears: 20,
      extraPayment: 20000,
      compensationRate: 0.5,
    },
  },
  {
    name: "deposito",
    run: computeDeposit,
    baseline: { principal: 10000, apr: 3, years: 2, withholdingRate: 19, inflationRate: 2 },
  },
  {
    name: "desgravacion-plan-pensiones",
    run: computePensionRelief,
    baseline: { grossAnnual: 40000, contribution: 1500, employerContribution: 500 },
  },
  {
    name: "dividendos",
    run: computeDividends,
    baseline: { shares: 100, dividendPerShare: 1.2, sharePrice: 40, withholdingRate: 19, annualGrowth: 5, years: 10 },
  },
  {
    name: "fire-montecarlo",
    run: (input: Parameters<typeof simulateFire>[0]) => simulateFire(input, { paths: 50, seed: 7 }),
    baseline: {
      annualExpenses: 24000,
      currentSavings: 50000,
      monthlySavings: 1000,
      annualReturn: 6,
      volatility: 15,
      withdrawalRate: 4,
      retirementYears: 30,
    },
    // Si ninguna vida llega a FIRE (p. ej. rentabilidad −100 %), la supervivencia no tiene respuesta:
    // es `NaN` a propósito y la web la pinta «—» (ver `fire-montecarlo.test.ts`).
    allowInfinity: ["survivalRate"],
  },
  {
    name: "fire",
    run: computeFire,
    baseline: {
      annualExpenses: 24000,
      currentSavings: 50000,
      savings: 1000,
      annualReturn: 6,
      withdrawalRate: 4,
      savingsGrowth: 2,
    },
    // Con un objetivo imposible de alcanzar el resultado es `null`, no un número no finito.
  },
  {
    name: "hipoteca-asequible",
    run: computeAffordability,
    baseline: {
      netMonthlyIncome: 3000,
      monthlyDebts: 200,
      downPayment: 40000,
      annualRate: 3,
      termYears: 30,
      effortRatio: 35,
      maxLtv: 80,
      purchaseCostsRate: 12,
    },
  },
  {
    name: "hipoteca-vs-alquiler",
    run: computeBuyVsRent,
    baseline: {
      purchasePrice: 250000,
      purchaseCosts: 25000,
      downPayment: 50000,
      mortgageRate: 3,
      mortgageTerm: 30,
      annualCostRate: 1,
      appreciationRate: 2,
      monthlyRent: 900,
      rentGrowthRate: 2,
      investmentReturn: 5,
      horizonYears: 15,
      sellingCostsRate: 3,
    },
  },
  {
    name: "hipoteca",
    run: computeMortgage,
    baseline: { principal: 200000, annualRate: 3, years: 25, openingFeeRate: 1, annualInsurance: 300 },
  },
  {
    name: "impuesto-donaciones",
    run: computeGiftTax,
    baseline: { amount: 100000, reduction: 15956.87, preexistingWealth: 500000, regionalRebate: 50 },
  },
  {
    name: "impuesto-patrimonio",
    run: computeWealthTax,
    baseline: { totalWealth: 900000, primaryResidenceValue: 300000, exemptMinimum: 700000, regionalRebate: 0 },
  },
  {
    name: "inflacion",
    run: computeInflation,
    baseline: { amount: 1000, annualRate: 3, years: 10, nominalReturn: 5 },
  },
  {
    name: "interes-compuesto",
    run: computeCompound,
    baseline: {
      initial: 1000,
      contribution: 100,
      annualRate: 7,
      years: 20,
      annualFee: 0.2,
      contributionGrowth: 2,
      inflationRate: 2,
    },
  },
  {
    name: "interes-simple",
    run: computeSimpleInterest,
    baseline: { principal: 10000, annualRate: 3, years: 5, withholdingRate: 19 },
  },
  {
    name: "irpf-autonomos",
    run: computeSelfEmployedTax,
    baseline: { income: 60000, expenses: 10000, socialSecurity: 3500, pensionContribution: 1000, age: 40, children: 1 },
  },
  {
    name: "irpf-nomina",
    run: computePayrollWithholding,
    baseline: { grossAnnual: 40000, payments: 14, pensionContribution: 500, age: 40, children: 1 },
  },
  {
    name: "presupuesto",
    run: computeBudget,
    baseline: { income: 2500, needs: 1200, wants: 600 },
  },
  {
    name: "promediar-acciones",
    run: computeAveragePrice,
    baseline: {
      purchases: [
        { price: 10, shares: 5, commission: 1 },
        { price: 12, shares: 8, commission: 1 },
      ],
      currentPrice: 11,
    },
  },
  {
    name: "rentabilidad-alquiler-vacacional",
    run: computeHolidayRental,
    baseline: {
      purchasePrice: 200000,
      purchaseCosts: 20000,
      nightlyRate: 100,
      occupiedNights: 180,
      managementRate: 20,
      cleaningFee: 40,
      avgStayNights: 3,
      annualExpenses: 3000,
    },
  },
  {
    name: "rentabilidad-alquiler",
    run: computeRentalYield,
    baseline: {
      purchasePrice: 180000,
      purchaseCosts: 18000,
      monthlyRent: 800,
      vacancyRate: 5,
      ibiAnnual: 400,
      communityMonthly: 40,
      insuranceAnnual: 150,
      maintenanceAnnual: 500,
    },
  },
  {
    name: "roi",
    run: computeRoi,
    baseline: { initial: 1000, final: 1500, years: 3, costs: 20, income: 50, taxRate: 19 },
  },
  {
    name: "salud-financiera",
    run: computeFinancialHealth,
    baseline: [0.5, 1, 0, 0.34, 0.67, 1, 0, 0.5],
  },
  {
    name: "staking",
    run: computeStaking,
    baseline: { principal: 5000, apy: 8, years: 3, withholdingRate: 19 },
  },
  {
    name: "tarjeta-credito (cuota fija)",
    run: computeCreditCard,
    baseline: { balance: 3000, annualRate: 22, paymentMode: "fixed", monthlyPayment: 150, minPercent: 3, minFloor: 25 },
    // Deuda que no se amortiza nunca: la semántica documentada es `monthsToPayoff: null` e intereses infinitos.
    allowInfinity: ["totalInterest", "totalPaid"],
  },
];

type Path = (string | number)[];

/** Rutas de todas las hojas numéricas (incluidas las de arrays y objetos anidados). */
function numericPaths(value: unknown, prefix: Path = []): Path[] {
  if (typeof value === "number") return [prefix];
  if (Array.isArray(value)) return value.flatMap((v, i) => numericPaths(v, [...prefix, i]));
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => numericPaths(v, [...prefix, k]));
  }
  return [];
}

function withValue(value: unknown, paths: readonly Path[], replacement: number): unknown {
  const copy = structuredClone(value);
  for (const path of paths) {
    let target = copy as Record<string | number, unknown>;
    for (const key of path.slice(0, -1)) target = target[key] as Record<string | number, unknown>;
    target[path[path.length - 1]] = replacement;
  }
  return copy;
}

/** Rutas de todos los números no finitos de una salida (vacío = todo finito). */
function nonFinitePaths(value: unknown, prefix = ""): string[] {
  if (typeof value === "number") return Number.isFinite(value) ? [] : [`${prefix}=${value}`];
  if (Array.isArray(value)) return value.flatMap((v, i) => nonFinitePaths(v, `${prefix}[${i}]`));
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => nonFinitePaths(v, prefix ? `${prefix}.${k}` : k));
  }
  return [];
}

const FINITE_EDGES = [0, -1, -100] as const;
const NON_FINITE_EDGES = [Number.NaN, Infinity, -Infinity] as const;

describe("detector de no finitos", () => {
  it("encuentra cualquier número no finito en profundidad y respeta null", () => {
    expect(nonFinitePaths({ a: 1, b: null, c: [{ d: Infinity }, { e: Number.NaN }] })).toEqual([
      "c[0].d=Infinity",
      "c[1].e=NaN",
    ]);
    expect(nonFinitePaths({ a: 1, b: null, c: [0, -2] })).toEqual([]);
  });
});

describe.each(CASES)("bordes numéricos: $name", ({ baseline, run, allowInfinity = [] }) => {
  const call = run as (input: unknown) => unknown;
  const paths = numericPaths(baseline);

  it("la entrada base devuelve cifras finitas", () => {
    expect(nonFinitePaths(call(baseline))).toEqual([]);
  });

  it.each(FINITE_EDGES)("con un campo a %s: no lanza y todo es finito", (edge) => {
    for (const path of paths) {
      const bad = nonFinitePaths(call(withValue(baseline, [path], edge))).filter(
        (p) => !allowInfinity.some((allowed) => p.startsWith(`${allowed}=`)),
      );
      expect({ field: path.join("."), edge, bad }).toEqual({ field: path.join("."), edge, bad: [] });
    }
    const all = nonFinitePaths(call(withValue(baseline, paths, edge))).filter(
      (p) => !allowInfinity.some((allowed) => p.startsWith(`${allowed}=`)),
    );
    expect({ field: "todos", edge, all }).toEqual({ field: "todos", edge, all: [] });
  });

  it.each(NON_FINITE_EDGES)("con un campo a %s: no lanza", (edge) => {
    for (const path of paths) expect(() => call(withValue(baseline, [path], edge))).not.toThrow();
    expect(() => call(withValue(baseline, paths, edge))).not.toThrow();
  });
});

describe("bordes numéricos: tarjeta-credito (cuota como % del saldo)", () => {
  const baseline = { balance: 3000, annualRate: 22, paymentMode: "percent", minPercent: 3, minFloor: 25 };
  const allowed = ["totalInterest", "totalPaid"];

  it.each([...FINITE_EDGES, ...NON_FINITE_EDGES])("con un campo a %s no lanza", (edge) => {
    for (const path of numericPaths(baseline)) {
      expect(() => computeCreditCard(withValue(baseline, [path], edge) as never)).not.toThrow();
    }
  });

  it.each(FINITE_EDGES)("con un campo a %s solo es infinito el coste de una deuda sin fin", (edge) => {
    for (const path of numericPaths(baseline)) {
      const bad = nonFinitePaths(computeCreditCard(withValue(baseline, [path], edge) as never)).filter(
        (p) => !allowed.some((a) => p.startsWith(`${a}=`)),
      );
      expect({ field: path.join("."), bad }).toEqual({ field: path.join("."), bad: [] });
    }
  });
});
