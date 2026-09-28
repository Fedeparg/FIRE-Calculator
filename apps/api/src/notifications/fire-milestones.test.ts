import { describe, expect, it } from 'vitest';

import { fireTargetFromInputs, newMilestone, reachedMilestone } from './fire-milestones.js';

describe('fireTargetFromInputs', () => {
  it('objetivo = gasto / tasa de retiro, como la calculadora FIRE', () => {
    expect(fireTargetFromInputs({ annualExpenses: 24000, withdrawalRate: 4 })).toEqual({ target: 600000, currency: 'EUR' });
    expect(fireTargetFromInputs({ annualExpenses: 30000, withdrawalRate: 3, goalCurrency: 'USD' })).toEqual({
      target: 1_000_000,
      currency: 'USD',
    });
  });

  it('una tasa no positiva o ausente usa el 4 %', () => {
    expect(fireTargetFromInputs({ annualExpenses: 20000, withdrawalRate: 0 })?.target).toBe(500000);
    expect(fireTargetFromInputs({ annualExpenses: 20000 })?.target).toBe(500000);
  });

  it('sin gasto positivo no hay objetivo', () => {
    expect(fireTargetFromInputs({ annualExpenses: 0 })).toBeNull();
    expect(fireTargetFromInputs({ annualExpenses: '24000' })).toBeNull();
    expect(fireTargetFromInputs({})).toBeNull();
  });

  it('una divisa que no parece un código ISO cae a euros', () => {
    expect(fireTargetFromInputs({ annualExpenses: 1, goalCurrency: 'eur<script>' })?.currency).toBe('EUR');
  });
});

describe('hitos', () => {
  it('reachedMilestone da el hito más alto alcanzado', () => {
    expect(reachedMilestone(0)).toBe(0);
    expect(reachedMilestone(24.99)).toBe(0);
    expect(reachedMilestone(25)).toBe(25);
    expect(reachedMilestone(74)).toBe(50);
    expect(reachedMilestone(250)).toBe(100);
    expect(reachedMilestone(Number.NaN)).toBe(0);
  });

  it('newMilestone solo avisa de lo nuevo y del mayor si se cruzan varios', () => {
    expect(newMilestone(30, 0)).toBe(25);
    expect(newMilestone(30, 25)).toBeNull();
    expect(newMilestone(80, 25)).toBe(75);
    expect(newMilestone(20, 50)).toBeNull();
    expect(newMilestone(10, 0)).toBeNull();
  });
});
