// Maps failures of the import endpoints (Trade Republic) to a message key under
// `portfolio.import.*`. Pure core (no React), testable.

import { createApiErrorMapper } from "@/shared/api/client";

/**
 * Error message for the failure: the API code takes precedence over the status. A 400 without
 * its own code is not "check the form": there is no form here, only a file.
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
