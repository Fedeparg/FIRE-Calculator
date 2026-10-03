import fc from "fast-check";
import { describe, it } from "vitest";

import { PROPERTY_PARAMS } from "../test-support/property-config.js";
import { computeDoubleTaxationDeduction, TREATY_DIVIDEND_RATES } from "./double-taxation.js";
import { computeSavingsBase } from "./savings-base.js";

const YEAR = 2025;
const balance = fc.double({ min: -1e6, max: 1e6, noNaN: true });
const pendingItem = fc.record({
  originYear: fc.integer({ min: 2015, max: YEAR - 1 }),
  kind: fc.constantFrom("gains" as const, "capitalIncome" as const),
  amount: fc.double({ min: 0.01, max: 1e6, noNaN: true }),
});
const sum = (xs: readonly { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));

describe("computeSavingsBase — properties", () => {
  const inputs = fc.record({ gains: balance, capital: balance, pending: fc.array(pendingItem, { maxLength: 8 }) });

  it("the taxable base (base liquidable) is never negative", () => {
    fc.assert(
      fc.property(
        inputs,
        ({ gains, capital, pending }) =>
          computeSavingsBase({ year: YEAR, gainsBalance: gains, capitalIncomeBalance: capital, pending }).base >= 0,
      ),
      PROPERTY_PARAMS,
    );
  });

  it("offset + pending + expired = sum of the input negatives", () => {
    fc.assert(
      fc.property(inputs, ({ gains, capital, pending }) => {
        const r = computeSavingsBase({ year: YEAR, gainsBalance: gains, capitalIncomeBalance: capital, pending });
        const negatives = Math.max(0, -gains) + Math.max(0, -capital) + sum(pending);
        return close(sum(r.compensations) + sum(r.pending) + sum(r.expired), negatives);
      }),
      PROPERTY_PARAMS,
    );
  });

  it("the cross offset into a group never exceeds 25% of its positive balance", () => {
    fc.assert(
      fc.property(inputs, ({ gains, capital, pending }) => {
        const r = computeSavingsBase({ year: YEAR, gainsBalance: gains, capitalIncomeBalance: capital, pending });
        const cross = (target: "gains" | "capitalIncome", positive: number) =>
          sum(r.compensations.filter((c) => c.cross && c.target === target)) <= 0.25 * Math.max(0, positive) + 1e-6;
        return cross("gains", gains) && cross("capitalIncome", capital);
      }),
      PROPERTY_PARAMS,
    );
  });

  it("does not use expired pending items", () => {
    fc.assert(
      fc.property(inputs, ({ gains, capital, pending }) => {
        const r = computeSavingsBase({ year: YEAR, gainsBalance: gains, capitalIncomeBalance: capital, pending });
        return r.compensations.every((c) => c.source.originYear >= YEAR - 4);
      }),
      PROPERTY_PARAMS,
    );
  });
});

describe("computeDoubleTaxationDeduction — properties", () => {
  const countries = [...Object.keys(TREATY_DIVIDEND_RATES), "ZZ"];
  const incomes = fc.array(
    fc.record({
      country: fc.constantFrom(...countries),
      gross: fc.double({ min: 0, max: 1e6, noNaN: true }),
      withholdingOrigin: fc.option(fc.double({ min: 0, max: 1e6, noNaN: true }), { nil: null }),
    }),
    { maxLength: 10 },
  );

  it("the deduction exceeds neither the creditable amount nor the average-rate limit", () => {
    fc.assert(
      fc.property(incomes, fc.double({ min: 0, max: 30, noNaN: true }), (list, rate) => {
        const r = computeDoubleTaxationDeduction(list, rate);
        return r.deduction >= 0 && r.deduction <= r.creditableTotal && r.deduction <= r.limit;
      }),
      PROPERTY_PARAMS,
    );
  });

  it("creditable + excess ≤ known withholding, country by country", () => {
    fc.assert(
      fc.property(incomes, (list) =>
        computeDoubleTaxationDeduction(list, 19).countries.every(
          (c) => c.creditable + c.excessReclaimable <= c.withholdingOrigin + 1e-6,
        ),
      ),
      PROPERTY_PARAMS,
    );
  });
});
