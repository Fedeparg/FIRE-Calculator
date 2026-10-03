import { z } from 'zod';

import { SCOPES_SUPPORTED } from '../oauth.constants.js';

/** Consent approval body: which client and with which scopes. */
export const consentSchema = z.strictObject({
  clientId: z.string(),
  scopes: z
    .array(z.string().refine((scope) => SCOPES_SUPPORTED.includes(scope), { error: 'scope no soportado' }))
    .min(1),
});

export type ConsentDto = z.infer<typeof consentSchema>;
