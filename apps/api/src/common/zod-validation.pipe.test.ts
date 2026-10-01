import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { portfolioHistoryQuerySchema } from '../portfolio/dto/portfolio-history-query.dto.js';
import { createPositionSchema } from '../positions/dto/create-position.dto.js';
import { createPositionLotSchema } from '../positions/dto/create-position-lot.dto.js';
import { savedScenariosQuerySchema } from '../scenarios/dto/saved-scenarios-query.dto.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

/** Mensajes del 400 que produce el pipe, o `null` si la entrada es válida. */
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

  it('devuelve el valor transformado: recorta los textos', () => {
    expect(pipe.transform({ ...position, ticker: '  IWDA ', broker: ' DEGIRO ' })).toEqual({
      ...position,
      broker: 'DEGIRO',
    });
  });

  it('rechaza con 400 y un mensaje por campo inválido', () => {
    const messages = rejection(pipe, { ticker: '   ', quantity: -1, avgPrice: 80 });
    expect(messages).toHaveLength(2);
    expect(messages?.join('|')).toMatch(/ticker/);
    expect(messages?.join('|')).toMatch(/quantity/);
  });

  it('rechaza claves desconocidas en vez de ignorarlas', () => {
    expect(rejection(pipe, { ...position, userId: 'otro' })).not.toBeNull();
  });

  it('acota los decimales a 6 y el tope de numeric(18,6)', () => {
    expect(rejection(pipe, { ...position, quantity: 1.1234567 })).not.toBeNull();
    expect(rejection(pipe, { ...position, quantity: 1.123456 })).toBeNull();
    expect(rejection(pipe, { ...position, avgPrice: 1_000_000_000_000 })).not.toBeNull();
  });

  it('no coacciona textos a número en el cuerpo', () => {
    expect(rejection(pipe, { ...position, quantity: '10' })).not.toBeNull();
  });
});

describe('esquemas de lotes', () => {
  const pipe = new ZodValidationPipe(createPositionLotSchema);
  const lot = { kind: 'buy', quantity: 1, price: 10, tradedAt: '2026-03-15' };

  it('exige una fecha real con formato YYYY-MM-DD', () => {
    expect(rejection(pipe, lot)).toBeNull();
    expect(rejection(pipe, { ...lot, tradedAt: '2026-02-30' })).not.toBeNull();
    expect(rejection(pipe, { ...lot, tradedAt: '2026-03-15T10:00:00Z' })).not.toBeNull();
  });
});

describe('esquemas de query', () => {
  it('coacciona `days` de texto a entero y rechaza lo no numérico o desconocido', () => {
    const pipe = new ZodValidationPipe(portfolioHistoryQuerySchema);
    expect(pipe.transform({ days: '30', display: 'USD' })).toEqual({ days: 30, display: 'USD' });
    expect(pipe.transform({})).toEqual({});
    expect(rejection(pipe, { days: 'abc' })).not.toBeNull();
    expect(rejection(pipe, { days: '1.5' })).not.toBeNull();
    expect(rejection(pipe, { days: '0' })).not.toBeNull();
    expect(rejection(pipe, { other: '1' })).not.toBeNull();
  });

  it('el filtro de escenarios solo admite `slug` con formato de identificador', () => {
    const pipe = new ZodValidationPipe(savedScenariosQuerySchema);
    expect(pipe.transform({ slug: ' fire-basico ' })).toEqual({ slug: 'fire-basico' });
    expect(rejection(pipe, { slug: 'No Valido' })).not.toBeNull();
    expect(rejection(pipe, { nombre: 'x' })).not.toBeNull();
  });
});
