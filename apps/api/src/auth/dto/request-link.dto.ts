import { z } from 'zod';

/** Body of POST /api/auth/request. */
export const requestLinkSchema = z.strictObject({
  email: z.email({ error: 'Email no válido' }).max(254),
  // Language of the site the request comes from: used for the email and for the linked page.
  // Optional (Spanish by default) so a client that does not send it keeps working.
  locale: z.enum(['es', 'en']).optional(),
});

export type RequestLinkDto = z.infer<typeof requestLinkSchema>;
