import { z } from "zod";

import { FINANCIAL_HEALTH_OPTIONS, FINANCIAL_HEALTH_QUESTIONS } from "./salud-financiera.js";

/**
 * One optional answer (an option from 0 to `FINANCIAL_HEALTH_OPTIONS - 1`) per question. The schema
 * is derived from the core's question list, so adding a question updates it automatically; that is
 * why there is no input type to tie it to.
 */
export const financialHealthSchema = z.strictObject(
  Object.fromEntries(
    FINANCIAL_HEALTH_QUESTIONS.map((q) => [
      q.id,
      z
        .number()
        .int()
        .min(0)
        .max(FINANCIAL_HEALTH_OPTIONS - 1)
        .optional()
        .describe(`Respuesta a ${q.id} (0–${FINANCIAL_HEALTH_OPTIONS - 1}).`),
    ]),
  ),
);
