import { describe, expect, it } from "vitest";
import {
  FINANCIAL_HEALTH_QUESTIONS,
  categoryForScore,
  computeFinancialHealth,
  scoreFinancialHealthOptions,
} from "./salud-financiera.js";
import { itemAt } from "../arrays.js";

describe("salud-financiera", () => {
  it("question weights add up to 1", () => {
    const total = FINANCIAL_HEALTH_QUESTIONS.reduce((s, q) => s + q.weight, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("everything at the maximum → 100 and the strong category", () => {
    const answers = FINANCIAL_HEALTH_QUESTIONS.map(() => 1);
    const r = computeFinancialHealth(answers);
    expect(r.score).toBe(100);
    expect(r.category).toBe("strong");
  });

  it("everything at the minimum → 0 and the critical category", () => {
    const answers = FINANCIAL_HEALTH_QUESTIONS.map(() => 0);
    const r = computeFinancialHealth(answers);
    expect(r.score).toBe(0);
    expect(r.category).toBe("critical");
  });

  it("missing answers count as 0", () => {
    const r = computeFinancialHealth([1]);
    expect(r.score).toBe(Math.round(itemAt(FINANCIAL_HEALTH_QUESTIONS, 0).weight * 100));
  });

  it("category thresholds", () => {
    expect(categoryForScore(80)).toBe("strong");
    expect(categoryForScore(60)).toBe("stable");
    expect(categoryForScore(35)).toBe("fragile");
    expect(categoryForScore(34)).toBe("critical");
  });

  it("scores by option index: all best is 100 and all worst is 0", () => {
    const n = FINANCIAL_HEALTH_QUESTIONS.length;
    expect(scoreFinancialHealthOptions(Array(n).fill(3))).toEqual({ score: 100, category: "strong" });
    expect(scoreFinancialHealthOptions(Array(n).fill(0))).toEqual({ score: 0, category: "critical" });
  });

  it("an out-of-range or missing index scores 0", () => {
    expect(scoreFinancialHealthOptions([9, -1])).toEqual(scoreFinancialHealthOptions([]));
  });
});
