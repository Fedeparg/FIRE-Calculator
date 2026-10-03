"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

/** A feature namespace's translator, narrowed to what is used here. */
type FeatureTranslator = {
  (key: string): string;
  has: (key: string) => boolean;
};

/**
 * Common `apiErrorKey` keys and their message in `common.apiError`: network, server and session
 * errors read the same across the app, so they live ONCE instead of being copied into every
 * namespace.
 */
const COMMON_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  errorNetwork: "apiError.network",
  errorServer: "apiError.server",
  errorSession: "apiError.session",
};

/**
 * Translates the error key of an API call (`apiErrorKey`/`createApiErrorMapper`): common errors
 * come from `common.apiError`; feature-specific ones (domain `code`, `errorInvalid`, an
 * `errorGeneric` with context such as "the file could not be processed") from the feature's
 * namespace. An `errorGeneric` the feature does not override falls back to the common one.
 *
 * Requires `common` among the route's namespaces (`route-namespaces.ts`).
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
