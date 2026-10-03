import { describe, expect, it } from 'vitest';

import { fireTargetFromInputs, newMilestone, reachedMilestone } from './fire-milestones.js';

describe('fireTargetFromInputs', () => {
  it('in amount mode the goal is the stored figure, with its currency', () => {
    expect(
      fireTargetFromInputs({ goalMode: 'amount', targetAmount: 150_000, annualExpenses: 24000, goalCurrency: 'USD' }),
    ).toEqual({ target: 150_000, currency: 'USD' });
    expect(fireTargetFromInputs({ goalMode: 'amount', targetAmount: 0 })).toBeNull();
    expect(fireTargetFromInputs({ goalMode: 'amount' })).toBeNull();
  });

  it('goal = spending / withdrawal rate, like the FIRE calculator', () => {
    expect(fireTargetFromInputs({ annualExpenses: 24000, withdrawalRate: 4 })).toEqual({
      target: 600000,
      currency: 'EUR',
    });
    expect(fireTargetFromInputs({ annualExpenses: 30000, withdrawalRate: 3, goalCurrency: 'USD' })).toEqual({
      target: 1_000_000,
      currency: 'USD',
    });
  });

  it('uses 4 % when the rate is missing or not positive', () => {
    expect(fireTargetFromInputs({ annualExpenses: 20000, withdrawalRate: 0 })?.target).toBe(500000);
    expect(fireTargetFromInputs({ annualExpenses: 20000 })?.target).toBe(500000);
  });

  it('returns no goal without positive spending', () => {
    expect(fireTargetFromInputs({ annualExpenses: 0 })).toBeNull();
    expect(fireTargetFromInputs({ annualExpenses: '24000' })).toBeNull();
    expect(fireTargetFromInputs({})).toBeNull();
  });

  it('falls back to euros when the currency does not look like an ISO code', () => {
    expect(fireTargetFromInputs({ annualExpenses: 1, goalCurrency: 'eur<script>' })?.currency).toBe('EUR');
  });
});

describe('milestones', () => {
  it('reachedMilestone returns the highest milestone reached', () => {
    expect(reachedMilestone(0)).toBe(0);
    expect(reachedMilestone(24.99)).toBe(0);
    expect(reachedMilestone(25)).toBe(25);
    expect(reachedMilestone(74)).toBe(50);
    expect(reachedMilestone(250)).toBe(100);
    expect(reachedMilestone(Number.NaN)).toBe(0);
  });

  it('newMilestone only reports new milestones, and the highest when several are crossed', () => {
    expect(newMilestone(30, 0)).toBe(25);
    expect(newMilestone(30, 25)).toBeNull();
    expect(newMilestone(80, 25)).toBe(75);
    expect(newMilestone(20, 50)).toBeNull();
    expect(newMilestone(10, 0)).toBeNull();
  });
});
