import { z } from "zod";

import { FINANCIAL_HEALTH_OPTIONS, FINANCIAL_HEALTH_QUESTIONS } from "./salud-financiera.js";

/**
 * Una respuesta opcional (opción de 0 a `FINANCIAL_HEALTH_OPTIONS - 1`) por pregunta. El esquema se
 * deriva de la lista de preguntas del core, así que añadir una pregunta lo actualiza solo; por eso
 * no hay un tipo de entrada con el que enlazarlo.
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
