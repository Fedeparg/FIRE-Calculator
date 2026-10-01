import { z } from 'zod';

/** Cuerpo de POST /api/auth/verify. */
export const verifySchema = z.strictObject({
  token: z.string().min(10).max(512),
});

export type VerifyDto = z.infer<typeof verifySchema>;
