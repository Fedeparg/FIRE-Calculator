import { z } from 'zod';

/**
 * Rango de ejercicios fiscales que acepta la API (REST y MCP). Desde 1990 cubre de sobra cualquier
 * dato real de un inversor particular; el tope solo descarta basura.
 */
export const MIN_FISCAL_YEAR = 1990;
export const MAX_FISCAL_YEAR = 2100;

/** Ejercicio fiscal (año entero dentro del rango). */
export const fiscalYearSchema = z.number().int().min(MIN_FISCAL_YEAR).max(MAX_FISCAL_YEAR);

/** Ejercicio fiscal que llega como texto (ruta o query) y se convierte a número. */
export const fiscalYearParamSchema = z.coerce.number().pipe(fiscalYearSchema);
