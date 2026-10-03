import { z } from 'zod';

import {
  amountSchema,
  assetClassSchema,
  currencySchema,
  quantitySchema,
  trimmedText,
} from '../../common/dto/primitives.js';

/** Cuerpo de POST /api/positions (el `userId` sale del JWT). */
export const createPositionSchema = z.strictObject({
  ticker: trimmedText(20).min(1).describe('Símbolo (p. ej. "IWDA", "AAPL").'),
  name: trimmedText(100).optional().describe('Nombre legible (opcional).'),
  quantity: quantitySchema.describe('Número de participaciones/acciones.'),
  avgPrice: amountSchema.describe('Precio medio de compra.'),
  // Opcional aquí: "obligatorio si el símbolo ya existe" depende de los datos y lo aplica el servicio.
  broker: trimmedText(100).optional().describe('Bróker (opcional).'),
  currency: currencySchema.optional().describe('Divisa (por defecto EUR).'),
  assetClass: assetClassSchema
    .optional()
    .describe('Clase de activo: stock (acción), fund (fondo o ETF), derivative u other.'),
});

export type CreatePositionDto = z.infer<typeof createPositionSchema>;
