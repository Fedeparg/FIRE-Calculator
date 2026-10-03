import { describe, expect, it } from "vitest";

import { ApiError } from "@/shared/api/client";
import type { PositionLot } from "@sextante/core/portfolio/types";
import { lotErrorKey, positionHasSales } from "./lots";

describe("lotErrorKey", () => {
  it("traduce los códigos de dominio de la agregación", () => {
    expect(lotErrorKey(new ApiError(400, "NEGATIVE_QUANTITY"))).toBe("errorNegative");
    expect(lotErrorKey(new ApiError(400, "OVERFLOW"))).toBe("errorOverflow");
    expect(lotErrorKey(new ApiError(400, "INVALID_DECIMAL"))).toBe("errorInvalid");
  });

  it("un 400 del ValidationPipe (sin code) se explica como datos no válidos", () => {
    expect(lotErrorKey(new ApiError(400))).toBe("errorInvalid");
    expect(lotErrorKey(new ApiError(400, "SOMETHING_NEW"))).toBe("errorInvalid");
  });

  it("distingue sesión caducada, recurso ajeno y error de servidor", () => {
    expect(lotErrorKey(new ApiError(401))).toBe("errorSession");
    expect(lotErrorKey(new ApiError(404))).toBe("errorNotFound");
    expect(lotErrorKey(new ApiError(500))).toBe("errorServer");
    expect(lotErrorKey(new ApiError(503))).toBe("errorServer");
  });

  it("un fallo de red o ajeno a la API se explica sin status", () => {
    expect(lotErrorKey(new ApiError(0))).toBe("errorNetwork");
    expect(lotErrorKey(new Error("boom"))).toBe("errorGeneric");
  });

  it("cualquier otro estado cae en el mensaje genérico", () => {
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

  it("con los lotes cargados, dice si hay alguna venta", () => {
    expect(positionHasSales("ready", [lot("buy"), lot("sell")])).toBe(true);
    expect(positionHasSales("ready", [lot("buy")])).toBe(false);
  });

  it("mientras cargan o si fallan, no lo sabe (null): el aviso fuerte no puede perderse", () => {
    expect(positionHasSales("loading", [])).toBeNull();
    expect(positionHasSales("error", [])).toBeNull();
  });
});
