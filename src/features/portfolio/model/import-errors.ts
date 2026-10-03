// Traducción de los fallos de los endpoints de importación (Trade Republic) a una clave de
// mensaje bajo `portfolio.import.*`. Core puro (sin React), testeable.

import { createApiErrorMapper } from "@/shared/api/client";

/**
 * Mensaje de error según el fallo: el código de la API manda sobre el status. Un 400 sin código
 * propio no es "revisa el formulario": aquí no hay formulario, solo un fichero.
 */
export const importErrorKey = createApiErrorMapper({
  codes: {
    NOT_TRADE_REPUBLIC: "errorNotTradeRepublic",
    EMPTY_FILE: "errorEmpty",
    MALFORMED_CSV: "errorMalformed",
    TOO_MANY_ROWS: "errorTooManyRows",
  },
  statuses: { 413: "errorTooLarge", 429: "errorRateLimit" },
  invalidFallback: "errorGeneric",
});

export type ImportErrorKey = ReturnType<typeof importErrorKey>;
