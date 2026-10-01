// Traducción de los fallos de los endpoints de importación (Trade Republic) a una clave de
// mensaje bajo `portfolio.import.*`. Core puro (sin React), testeable.

import { ApiError, apiErrorKey } from "@/shared/api/client";

/** Códigos de error de la API de importación que tienen mensaje propio (todos son 400). */
const IMPORT_ERROR_CODES = {
  NOT_TRADE_REPUBLIC: "errorNotTradeRepublic",
  EMPTY_FILE: "errorEmpty",
  MALFORMED_CSV: "errorMalformed",
  TOO_MANY_ROWS: "errorTooManyRows",
} as const;

export type ImportErrorKey =
  | "errorTooLarge"
  | "errorSession"
  | "errorRateLimit"
  | "errorNetwork"
  | "errorServer"
  | "errorGeneric"
  | (typeof IMPORT_ERROR_CODES)[keyof typeof IMPORT_ERROR_CODES];

function isImportErrorCode(code: string | undefined): code is keyof typeof IMPORT_ERROR_CODES {
  return code !== undefined && Object.hasOwn(IMPORT_ERROR_CODES, code);
}

/** Mensaje de error según el fallo: el código de la API manda sobre el status. */
export function importErrorKey(error: unknown): ImportErrorKey {
  if (error instanceof ApiError) {
    if (error.status === 400) return isImportErrorCode(error.code) ? IMPORT_ERROR_CODES[error.code] : "errorGeneric";
    if (error.status === 413) return "errorTooLarge";
    if (error.status === 429) return "errorRateLimit";
  }
  const common = apiErrorKey(error);
  // Un 400 sin código propio no es "revisa el formulario": aquí no hay formulario, solo un fichero.
  return common === "errorInvalid" ? "errorGeneric" : common;
}
