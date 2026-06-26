import { describe, expect, it } from "vitest";
import {
  FINANCIAL_HEALTH_QUESTIONS,
  categoryForScore,
  computeFinancialHealth,
} from "./salud-financiera";

describe("salud-financiera", () => {
  it("los pesos de las preguntas suman 1", () => {
    const total = FINANCIAL_HEALTH_QUESTIONS.reduce((s, q) => s + q.weight, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("todo al máximo → 100 y categoría fuerte", () => {
    const answers = FINANCIAL_HEALTH_QUESTIONS.map(() => 1);
    const r = computeFinancialHealth(answers);
    expect(r.score).toBe(100);
    expect(r.category).toBe("strong");
  });

  it("todo al mínimo → 0 y categoría crítica", () => {
    const answers = FINANCIAL_HEALTH_QUESTIONS.map(() => 0);
    const r = computeFinancialHealth(answers);
    expect(r.score).toBe(0);
    expect(r.category).toBe("critical");
  });

  it("respuestas que faltan cuentan como 0", () => {
    const r = computeFinancialHealth([1]);
    expect(r.score).toBe(Math.round(FINANCIAL_HEALTH_QUESTIONS[0].weight * 100));
  });

  it("umbrales de categoría", () => {
    expect(categoryForScore(80)).toBe("strong");
    expect(categoryForScore(60)).toBe("stable");
    expect(categoryForScore(35)).toBe("fragile");
    expect(categoryForScore(34)).toBe("critical");
  });
});
