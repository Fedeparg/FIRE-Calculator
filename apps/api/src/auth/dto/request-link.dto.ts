import { z } from 'zod';

/** Cuerpo de POST /api/auth/request. */
export const requestLinkSchema = z.strictObject({
  email: z.email({ error: 'Email no válido' }).max(254),
  // Idioma de la web desde la que se pide: el del email y el de la página del enlace. Opcional
  // (castellano por defecto) para no romper a un cliente que no lo envíe.
  locale: z.enum(['es', 'en']).optional(),
});

export type RequestLinkDto = z.infer<typeof requestLinkSchema>;
