import { describe, expect, it } from "vitest";

import { lotErrorKey } from "./portfolio-lots";

describe("lotErrorKey", () => {
  it("traduce los códigos de dominio de la agregación", () => {
    expect(lotErrorKey(400, "NEGATIVE_QUANTITY")).toBe("errorNegative");
    expect(lotErrorKey(400, "OVERFLOW")).toBe("errorOverflow");
    expect(lotErrorKey(400, "INVALID_DECIMAL")).toBe("errorInvalid");
  });

  it("un 400 del ValidationPipe (sin code) se explica como datos no válidos", () => {
    expect(lotErrorKey(400)).toBe("errorInvalid");
    expect(lotErrorKey(400, "SOMETHING_NEW")).toBe("errorInvalid");
  });

  it("distingue sesión caducada, recurso ajeno y error de servidor", () => {
    expect(lotErrorKey(401)).toBe("errorSession");
    expect(lotErrorKey(403)).toBe("errorNotFound");
    expect(lotErrorKey(404)).toBe("errorNotFound");
    expect(lotErrorKey(500)).toBe("errorServer");
    expect(lotErrorKey(503)).toBe("errorServer");
  });

  it("cualquier otro estado cae en el mensaje genérico", () => {
    expect(lotErrorKey(429)).toBe("errorGeneric");
    expect(lotErrorKey(418)).toBe("errorGeneric");
  });
});
