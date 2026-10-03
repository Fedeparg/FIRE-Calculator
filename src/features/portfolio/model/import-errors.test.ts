import { describe, expect, it } from "vitest";

import { ApiError } from "@/shared/api/client";
import { importErrorKey } from "./import-errors";

describe("importErrorKey", () => {
  it("the API code takes precedence over the status", () => {
    expect(importErrorKey(new ApiError(400, "NOT_TRADE_REPUBLIC"))).toBe("errorNotTradeRepublic");
    expect(importErrorKey(new ApiError(400, "EMPTY_FILE"))).toBe("errorEmpty");
    expect(importErrorKey(new ApiError(400, "MALFORMED_CSV"))).toBe("errorMalformed");
    expect(importErrorKey(new ApiError(400, "TOO_MANY_ROWS"))).toBe("errorTooManyRows");
  });

  it("a 400 without a known code is generic", () => {
    expect(importErrorKey(new ApiError(400))).toBe("errorGeneric");
    expect(importErrorKey(new ApiError(400, "SOMETHING_NEW"))).toBe("errorGeneric");
    expect(importErrorKey(new ApiError(400, "toString"))).toBe("errorGeneric");
  });

  it("tells apart size, usage limit, session, server and network", () => {
    expect(importErrorKey(new ApiError(413))).toBe("errorTooLarge");
    expect(importErrorKey(new ApiError(429))).toBe("errorRateLimit");
    expect(importErrorKey(new ApiError(401))).toBe("errorSession");
    expect(importErrorKey(new ApiError(502))).toBe("errorServer");
    expect(importErrorKey(new ApiError(0))).toBe("errorNetwork");
  });

  it("any other failure is generic", () => {
    expect(importErrorKey(new ApiError(404))).toBe("errorGeneric");
    expect(importErrorKey(new Error("boom"))).toBe("errorGeneric");
  });
});
