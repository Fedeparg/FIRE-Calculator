import { describe, expect, it } from "vitest";

import {
  addStep,
  clampNumber,
  formatDecimalInput,
  parseDecimalInput,
  sanitizeDecimalInput,
  stripLeadingZeros,
} from "./number-input";

describe("sanitizeDecimalInput", () => {
  it("conserva el separador que escribe el usuario", () => {
    expect(sanitizeDecimalInput("3,5")).toBe("3,5");
    expect(sanitizeDecimalInput("3.5")).toBe("3.5");
  });

  it("descarta caracteres que no forman parte de un decimal", () => {
    expect(sanitizeDecimalInput("3a5")).toBe("35");
    expect(sanitizeDecimalInput("12 €")).toBe("12");
    expect(sanitizeDecimalInput("abc")).toBe("");
  });

  it("con varios separadores manda el último; los previos son de miles", () => {
    expect(sanitizeDecimalInput("3,5,7")).toBe("35,7");
    expect(sanitizeDecimalInput("1.2.3")).toBe("12.3");
    expect(sanitizeDecimalInput("1,2.3")).toBe("12.3");
  });

  it("interpreta un importe pegado en formato español o inglés", () => {
    expect(sanitizeDecimalInput("1.234,56")).toBe("1234,56");
    expect(sanitizeDecimalInput("1,234.56")).toBe("1234.56");
    expect(parseDecimalInput("1.234,56")).toBe(1234.56);
    expect(parseDecimalInput("1,234.56")).toBe(1234.56);
  });

  it("mantiene el signo solo al principio", () => {
    expect(sanitizeDecimalInput("-3,5")).toBe("-3,5");
    expect(sanitizeDecimalInput("3-5")).toBe("35");
    expect(sanitizeDecimalInput("--3")).toBe("-3");
  });

  it("tolera los estados intermedios de la escritura", () => {
    expect(sanitizeDecimalInput("")).toBe("");
    expect(sanitizeDecimalInput("-")).toBe("-");
    expect(sanitizeDecimalInput(",")).toBe(",");
    expect(sanitizeDecimalInput("3,")).toBe("3,");
  });
});

describe("parseDecimalInput", () => {
  it("parsea la coma igual que el punto", () => {
    expect(parseDecimalInput("3,5")).toBe(3.5);
    expect(parseDecimalInput("3.5")).toBe(3.5);
    expect(parseDecimalInput("0,5")).toBe(0.5);
  });

  it("acepta un separador final o inicial", () => {
    expect(parseDecimalInput("3,")).toBe(3);
    expect(parseDecimalInput(",5")).toBe(0.5);
    expect(parseDecimalInput("-,5")).toBe(-0.5);
  });

  it("devuelve null mientras no haya ninguna cifra", () => {
    expect(parseDecimalInput("")).toBeNull();
    expect(parseDecimalInput("-")).toBeNull();
    expect(parseDecimalInput(",")).toBeNull();
    expect(parseDecimalInput(".")).toBeNull();
    expect(parseDecimalInput("abc")).toBeNull();
  });

  it("parsea negativos y ceros", () => {
    expect(parseDecimalInput("-3,5")).toBe(-3.5);
    expect(parseDecimalInput("0")).toBe(0);
    expect(parseDecimalInput("0,0")).toBe(0);
  });
});

describe("formatDecimalInput", () => {
  it("escribe el número con el separador del idioma", () => {
    expect(formatDecimalInput(4.25, ",")).toBe("4,25");
    expect(formatDecimalInput(4.25, ".")).toBe("4.25");
  });

  it("deja los enteros intactos", () => {
    expect(formatDecimalInput(7, ",")).toBe("7");
    expect(formatDecimalInput(0, ",")).toBe("0");
  });

  it("no mete separador de miles, que estorbaría al seguir tecleando", () => {
    expect(formatDecimalInput(1234.5, ",")).toBe("1234,5");
  });

  it("es la inversa de parseDecimalInput", () => {
    expect(parseDecimalInput(formatDecimalInput(-3.5, ","))).toBe(-3.5);
    expect(parseDecimalInput(formatDecimalInput(0.25, ","))).toBe(0.25);
  });

  it("nunca usa notación científica, que al re-sanearse corrompería el número", () => {
    // String(1e-7) === "1e-7" y sanitizarlo daría "17".
    expect(formatDecimalInput(1e-7, ",")).toBe("0,0000001");
    expect(formatDecimalInput(1e21, ",")).toBe("1000000000000000000000");
    expect(sanitizeDecimalInput(formatDecimalInput(1e-7, ","))).toBe("0,0000001");
    expect(parseDecimalInput(formatDecimalInput(1e-7, ","))).toBe(1e-7);
  });

  it("no propaga valores no finitos ni el cero negativo", () => {
    expect(formatDecimalInput(Number.NaN, ",")).toBe("");
    expect(formatDecimalInput(Number.POSITIVE_INFINITY, ",")).toBe("");
    expect(formatDecimalInput(-0, ",")).toBe("0");
  });
});

describe("stripLeadingZeros", () => {
  it("quita los ceros a la izquierda", () => {
    expect(stripLeadingZeros("0300")).toBe("300");
    expect(stripLeadingZeros("007")).toBe("7");
  });

  it("conserva el cero solo y el de los decimales", () => {
    expect(stripLeadingZeros("0")).toBe("0");
    expect(stripLeadingZeros("0,5")).toBe("0,5");
    expect(stripLeadingZeros("0.5")).toBe("0.5");
    expect(stripLeadingZeros("00,5")).toBe("0,5");
  });

  it("respeta el signo negativo", () => {
    expect(stripLeadingZeros("-007")).toBe("-7");
    expect(stripLeadingZeros("-0,5")).toBe("-0,5");
  });
});

describe("clampNumber", () => {
  it("acota a los extremos definidos", () => {
    expect(clampNumber(150, 0, 100)).toBe(100);
    expect(clampNumber(-5, 0, 100)).toBe(0);
    expect(clampNumber(50, 0, 100)).toBe(50);
  });

  it("ignora los extremos no definidos", () => {
    expect(clampNumber(-5)).toBe(-5);
    expect(clampNumber(1e9, 0)).toBe(1e9);
    expect(clampNumber(-5, undefined, 100)).toBe(-5);
  });
});

describe("addStep", () => {
  it("no arrastra el ruido binario de los flotantes", () => {
    expect(addStep(0.1, 0.2)).toBe(0.3);
    expect(addStep(2.9, 0.1)).toBe(3);
    expect(addStep(0.3, -0.1)).toBe(0.2);
  });

  it("suma enteros", () => {
    expect(addStep(1000, 1000)).toBe(2000);
    expect(addStep(5, -1)).toBe(4);
  });
});
