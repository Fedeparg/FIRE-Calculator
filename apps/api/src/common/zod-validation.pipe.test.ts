import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { portfolioHistoryQuerySchema } from '../portfolio/dto/portfolio-history-query.dto.js';
import { createPositionSchema } from '../positions/dto/create-position.dto.js';
import { createPositionLotSchema } from '../positions/dto/create-position-lot.dto.js';
import { savedScenariosQuerySchema } from '../scenarios/dto/saved-scenarios-query.dto.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

/** Messages of the 400 the pipe produces, or `null` if the input is valid. */
function rejection(pipe: PipeTransform, input: unknown): string[] | null {
  try {
    pipe.transform(input, { type: 'body' });
    return null;
  } catch (error) {
    if (!(error instanceof BadRequestException)) throw error;
    return (error.getResponse() as { message: string[] }).message;
  }
}

const position = { ticker: 'IWDA', quantity: 10, avgPrice: 80 };

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(createPositionSchema);

  it('returns the transformed value: trims text fields', () => {
    expect(pipe.transform({ ...position, ticker: '  IWDA ', broker: ' DEGIRO ' })).toEqual({
      ...position,
      broker: 'DEGIRO',
    });
  });

  it('rejects with 400 and one message per invalid field', () => {
    const messages = rejection(pipe, { ticker: '   ', quantity: -1, avgPrice: 80 });
    expect(messages).toHaveLength(2);
    expect(messages?.join('|')).toMatch(/ticker/);
    expect(messages?.join('|')).toMatch(/quantity/);
  });

  it('rejects unknown keys instead of ignoring them', () => {
    expect(rejection(pipe, { ...position, userId: 'other' })).not.toBeNull();
  });

  it('caps decimals at 6 and values at the numeric(18,6) limit', () => {
    expect(rejection(pipe, { ...position, quantity: 1.1234567 })).not.toBeNull();
    expect(rejection(pipe, { ...position, quantity: 1.123456 })).toBeNull();
    expect(rejection(pipe, { ...position, avgPrice: 1_000_000_000_000 })).not.toBeNull();
  });

  it('does not coerce text to numbers in the body', () => {
    expect(rejection(pipe, { ...position, quantity: '10' })).not.toBeNull();
  });
});

describe('lot schemas', () => {
  const pipe = new ZodValidationPipe(createPositionLotSchema);
  const lot = { kind: 'buy', quantity: 1, price: 10, tradedAt: '2026-03-15' };

  it('requires a real date in YYYY-MM-DD format', () => {
    expect(rejection(pipe, lot)).toBeNull();
    expect(rejection(pipe, { ...lot, tradedAt: '2026-02-30' })).not.toBeNull();
    expect(rejection(pipe, { ...lot, tradedAt: '2026-03-15T10:00:00Z' })).not.toBeNull();
  });
});

describe('query schemas', () => {
  it('coerces `days` from text to an integer and rejects non-numeric or unknown input', () => {
    const pipe = new ZodValidationPipe(portfolioHistoryQuerySchema);
    expect(pipe.transform({ days: '30', display: 'USD' })).toEqual({ days: 30, display: 'USD' });
    expect(pipe.transform({})).toEqual({});
    expect(rejection(pipe, { days: 'abc' })).not.toBeNull();
    expect(rejection(pipe, { days: '1.5' })).not.toBeNull();
    expect(rejection(pipe, { days: '0' })).not.toBeNull();
    expect(rejection(pipe, { other: '1' })).not.toBeNull();
  });

  it('the scenarios filter only accepts a `slug` shaped like an identifier', () => {
    const pipe = new ZodValidationPipe(savedScenariosQuerySchema);
    expect(pipe.transform({ slug: ' fire-basico ' })).toEqual({ slug: 'fire-basico' });
    expect(rejection(pipe, { slug: 'Not Valid' })).not.toBeNull();
    expect(rejection(pipe, { unknown: 'x' })).not.toBeNull();
  });
});
