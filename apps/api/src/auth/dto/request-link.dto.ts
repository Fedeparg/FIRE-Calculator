import { z } from 'zod';

/** Cuerpo de POST /api/auth/request. */
export const requestLinkSchema = z.strictObject({
  email: z.email({ error: 'Email no válido' }).max(254),
});

export type RequestLinkDto = z.infer<typeof requestLinkSchema>;
