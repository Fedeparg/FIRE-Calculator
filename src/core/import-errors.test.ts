import { describe, expect, it } from "vitest";

import { ApiError } from "@/shared/api/client";
import { importErrorKey } from "./import-errors";

describe("importErrorKey", () => {
  it("el código de la API manda sobre el status", () => {
    expect(importErrorKey(new ApiError(400, "NOT_TRADE_REPUBLIC"))).toBe("errorNotTradeRepublic");
    expect(importErrorKey(new ApiError(400, "EMPTY_FILE"))).toBe("errorEmpty");
    expect(importErrorKey(new ApiError(400, "MALFORMED_CSV"))).toBe("errorMalformed");
    expect(importErrorKey(new ApiError(400, "TOO_MANY_ROWS"))).toBe("errorTooManyRows");
  });

  it("un 400 sin código conocido es genérico", () => {
    expect(importErrorKey(new ApiError(400))).toBe("errorGeneric");
    expect(importErrorKey(new ApiError(400, "SOMETHING_NEW"))).toBe("errorGeneric");
    expect(importErrorKey(new ApiError(400, "toString"))).toBe("errorGeneric");
  });

  it("distingue tamaño, límite de uso, sesión, servidor y red", () => {
    expect(importErrorKey(new ApiError(413))).toBe("errorTooLarge");
    expect(importErrorKey(new ApiError(429))).toBe("errorRateLimit");
    expect(importErrorKey(new ApiError(401))).toBe("errorSession");
    expect(importErrorKey(new ApiError(502))).toBe("errorServer");
    expect(importErrorKey(new ApiError(0))).toBe("errorNetwork");
  });

  it("cualquier otro fallo es genérico", () => {
    expect(importErrorKey(new ApiError(404))).toBe("errorGeneric");
    expect(importErrorKey(new Error("boom"))).toBe("errorGeneric");
  });
});
