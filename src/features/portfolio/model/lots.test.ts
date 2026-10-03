import { describe, expect, it } from "vitest";

import { ApiError } from "@/shared/api/client";
import type { PositionLot } from "@sextante/core/portfolio/types";
import { lotErrorKey, positionHasSales } from "./lots";

describe("lotErrorKey", () => {
  it("translates the aggregate's domain codes", () => {
    expect(lotErrorKey(new ApiError(400, "NEGATIVE_QUANTITY"))).toBe("errorNegative");
    expect(lotErrorKey(new ApiError(400, "OVERFLOW"))).toBe("errorOverflow");
    expect(lotErrorKey(new ApiError(400, "INVALID_DECIMAL"))).toBe("errorInvalid");
  });

  it("a ValidationPipe 400 (no code) is explained as invalid data", () => {
    expect(lotErrorKey(new ApiError(400))).toBe("errorInvalid");
    expect(lotErrorKey(new ApiError(400, "SOMETHING_NEW"))).toBe("errorInvalid");
  });

  it("tells apart expired session, someone else's resource and server error", () => {
    expect(lotErrorKey(new ApiError(401))).toBe("errorSession");
    expect(lotErrorKey(new ApiError(404))).toBe("errorNotFound");
    expect(lotErrorKey(new ApiError(500))).toBe("errorServer");
    expect(lotErrorKey(new ApiError(503))).toBe("errorServer");
  });

  it("a network failure or one outside the API is explained without a status", () => {
    expect(lotErrorKey(new ApiError(0))).toBe("errorNetwork");
    expect(lotErrorKey(new Error("boom"))).toBe("errorGeneric");
  });

  it("any other status falls back to the generic message", () => {
    expect(lotErrorKey(new ApiError(429))).toBe("errorGeneric");
    expect(lotErrorKey(new ApiError(418))).toBe("errorGeneric");
  });
});

describe("positionHasSales", () => {
  const lot = (kind: PositionLot["kind"]): PositionLot => ({
    id: kind,
    positionId: "p",
    kind,
    quantity: 1,
    price: 1,
    fees: 0,
    tradedAt: "2025-01-01",
    note: null,
    createdAt: "2025-01-01T00:00:00.000Z",
  });

  it("with the lots loaded, tells whether there is any sale", () => {
    expect(positionHasSales("ready", [lot("buy"), lot("sell")])).toBe(true);
    expect(positionHasSales("ready", [lot("buy")])).toBe(false);
  });

  it("while loading or on failure it does not know (null): the strong warning must not be lost", () => {
    expect(positionHasSales("loading", [])).toBeNull();
    expect(positionHasSales("error", [])).toBeNull();
  });
});
