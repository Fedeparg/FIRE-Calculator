import { describe, expect, it } from "vitest";

import { safeReturnTo } from "./safe-return-to";

const ORIGIN = "https://sextante.example";

describe("safeReturnTo", () => {
  it("conserva una ruta propia con su query y su hash", () => {
    expect(safeReturnTo("/authorize?client_id=a&state=b#x", ORIGIN)).toBe("/authorize?client_id=a&state=b#x");
    expect(safeReturnTo("/portfolio", ORIGIN)).toBe("/portfolio");
  });

  it("rechaza URLs absolutas y relativas al protocolo", () => {
    expect(safeReturnTo("https://evil.example", ORIGIN)).toBeNull();
    expect(safeReturnTo("//evil.example", ORIGIN)).toBeNull();
    expect(safeReturnTo("javascript:alert(1)", ORIGIN)).toBeNull();
  });

  it("rechaza la barra invertida, que el navegador convierte en //", () => {
    expect(safeReturnTo("/\\evil.example", ORIGIN)).toBeNull();
    expect(safeReturnTo("/\\/evil.example", ORIGIN)).toBeNull();
  });

  it("rechaza tabuladores, saltos de línea y otros caracteres de control", () => {
    expect(safeReturnTo("/\t/evil.example", ORIGIN)).toBeNull();
    expect(safeReturnTo("/\n/evil.example", ORIGIN)).toBeNull();
    expect(safeReturnTo("/\u0000x", ORIGIN)).toBeNull();
  });

  it("deja %5C codificado como parte de la ruta, sin salir del origen", () => {
    expect(safeReturnTo("/%5Cevil.example", ORIGIN)).toBe("/%5Cevil.example");
  });

  it("rechaza lo que no empieza por /", () => {
    expect(safeReturnTo("", ORIGIN)).toBeNull();
    expect(safeReturnTo("portfolio", ORIGIN)).toBeNull();
  });
});
