"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

/** El traductor del namespace de una feature, con lo único que se usa aquí. */
type FeatureTranslator = {
  (key: string): string;
  has: (key: string) => boolean;
};

/**
 * Claves comunes de `apiErrorKey` y su mensaje en `common.apiError`: red, servidor y sesión dicen
 * lo mismo en toda la app, así que viven UNA vez en vez de copiarse en cada namespace.
 */
const COMMON_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  errorNetwork: "apiError.network",
  errorServer: "apiError.server",
  errorSession: "apiError.session",
};

/**
 * Traduce la clave de error de una llamada a la API (`apiErrorKey`/`createApiErrorMapper`): los
 * errores comunes salen de `common.apiError`; los propios de la feature (`code` de dominio,
 * `errorInvalid`, un `errorGeneric` con contexto como "no se pudo procesar el fichero") de su
 * namespace. Un `errorGeneric` que la feature no redefine cae al genérico común.
 *
 * Requiere `common` entre los namespaces de la ruta (`route-namespaces.ts`).
 */
export function useApiErrorText(t: FeatureTranslator): (key: string) => string {
  const tCommon = useTranslations("common");
  return useCallback(
    (key: string) => {
      const common = Object.hasOwn(COMMON_ERROR_MESSAGES, key) ? COMMON_ERROR_MESSAGES[key] : undefined;
      if (common !== undefined) return tCommon(common);
      if (key === "errorGeneric" && !t.has(key)) return tCommon("apiError.generic");
      return t(key);
    },
    [t, tCommon],
  );
}
