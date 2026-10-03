import { z } from 'zod';

import {
  amountSchema,
  assetClassSchema,
  currencySchema,
  quantitySchema,
  trimmedText,
} from '../../common/dto/primitives.js';

/** Body of POST /api/positions (the `userId` comes from the JWT). */
export const createPositionSchema = z.strictObject({
  ticker: trimmedText(20).min(1).describe('Symbol (e.g. "IWDA", "AAPL").'),
  name: trimmedText(100).optional().describe('Human-readable name (optional).'),
  quantity: quantitySchema.describe('Number of units/shares.'),
  avgPrice: amountSchema.describe('Average purchase price.'),
  // Optional here: "required if the symbol already exists" depends on the data and the service enforces it.
  broker: trimmedText(100).optional().describe('Broker (optional).'),
  currency: currencySchema.optional().describe('Currency (default EUR).'),
  assetClass: assetClassSchema.optional().describe('Asset class: stock, fund (fund or ETF), derivative or other.'),
});

export type CreatePositionDto = z.infer<typeof createPositionSchema>;
