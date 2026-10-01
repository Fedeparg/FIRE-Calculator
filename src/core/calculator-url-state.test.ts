import { describe, expect, it } from "vitest";

import {
  completeValues,
  decodeCalculatorInputs,
  decodeCalculatorState,
  decodeFieldValue,
  encodeCalculatorState,
  encodeFieldValue,
  type FieldSpecs,
} from "./calculator-url-state";

/** Un juego de campos representativo: números y una lista cerrada de opciones. */
const SPECS: FieldSpecs = {
  amount: { kind: "number", defaultValue: 1000 },
  rate: { kind: "number", defaultValue: 5 },
  frequency: { kind: "option", defaultValue: "monthly", allowed: ["monthly", "yearly"] },
};

describe("decodeFieldValue", () => {
  it("acepta enteros, decimales y negativos", () => {
    const spec = { kind: "number", defaultValue: 0 } as const;
    expect(decodeFieldValue(spec, "1000")).toBe(1000);
    expect(decodeFieldValue(spec, "3.5")).toBe(3.5);
    expect(decodeFieldValue(spec, "-2.25")).toBe(-2.25);
    expect(decodeFieldValue(spec, "0")).toBe(0);
  });

  it("rechaza lo que no es un número en notación posicional", () => {
    const spec = { kind: "number", defaultValue: 0 } as const;
    for (const raw of [
      "",
      "abc",
      "NaN",
      "Infinity",
      "1e400", // notación científica: además desbordaría a Infinity
      "1e3",
      "3,5", // la coma es del teclado del móvil, no de la URL
      "1.234,56",
      ".5",
      "5.",
      " 5",
      "5px",
      "0x10",
      "<script>alert(1)</script>",
    ]) {
      expect(decodeFieldValue(spec, raw), raw).toBeNull();
    }
  });

  it("acepta solo las opciones de la lista", () => {
    const spec = { kind: "option", defaultValue: "monthly", allowed: ["monthly", "yearly"] } as const;
    expect(decodeFieldValue(spec, "yearly")).toBe("yearly");
    expect(decodeFieldValue(spec, "MONTHLY")).toBeNull();
    expect(decodeFieldValue(spec, "weekly")).toBeNull();
    expect(decodeFieldValue(spec, "__proto__")).toBeNull();
  });
});

describe("encodeFieldValue", () => {
  it("escribe los números con punto y sin notación científica", () => {
    expect(encodeFieldValue(1234.5)).toBe("1234.5");
    expect(encodeFieldValue(-0.25)).toBe("-0.25");
    expect(encodeFieldValue(0)).toBe("0");
    expect(encodeFieldValue(1e21)).toBe("1000000000000000000000");
  });

  it("mantiene el valor en el viaje de ida y vuelta", () => {
    const spec = { kind: "number", defaultValue: 0 } as const;
    for (const value of [0, 1, -1, 0.1, 1234.56, 1e21, 1e-7]) {
      expect(decodeFieldValue(spec, encodeFieldValue(value)), String(value)).toBe(value);
    }
  });
});

describe("decodeCalculatorState", () => {
  it("lee los campos conocidos de la query string", () => {
    expect(decodeCalculatorState("?amount=2500&rate=3.5&frequency=yearly", SPECS)).toEqual({
      amount: 2500,
      rate: 3.5,
      frequency: "yearly",
    });
  });

  it("omite los ausentes (quien llama pone el valor por defecto)", () => {
    expect(decodeCalculatorState("?rate=7", SPECS)).toEqual({ rate: 7 });
    expect(decodeCalculatorState("", SPECS)).toEqual({});
  });

  it("omite los valores basura sin tocar a los válidos que van al lado", () => {
    expect(decodeCalculatorState("?amount=abc&rate=7", SPECS)).toEqual({ rate: 7 });
    expect(decodeCalculatorState("?frequency=weekly&amount=200", SPECS)).toEqual({ amount: 200 });
    expect(decodeCalculatorState("?amount=<script>x</script>", SPECS)).toEqual({});
  });

  it("ignora los parámetros que no son campos de la calculadora", () => {
    expect(decodeCalculatorState("?utm_source=x&amount=200", SPECS)).toEqual({ amount: 200 });
  });

  it("no se deja envenenar el prototipo", () => {
    const values = decodeCalculatorState("?__proto__=polluted&constructor=x&amount=1", SPECS);
    expect(values).toEqual({ amount: 1 });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("con una clave repetida se queda con la primera", () => {
    expect(decodeCalculatorState("?amount=1&amount=2", SPECS)).toEqual({ amount: 1 });
  });
});

describe("decodeCalculatorInputs", () => {
  it("acepta los números ya tipados de un escenario guardado", () => {
    expect(decodeCalculatorInputs({ amount: 2500, frequency: "yearly" }, SPECS)).toEqual({
      amount: 2500,
      frequency: "yearly",
    });
  });

  it("acepta también números escritos como texto", () => {
    expect(decodeCalculatorInputs({ amount: "2500" }, SPECS)).toEqual({ amount: 2500 });
  });

  it("descarta lo que no encaja con el campo (escenario obsoleto o manipulado)", () => {
    expect(
      decodeCalculatorInputs(
        {
          amount: Number.NaN,
          rate: { nested: 1 },
          frequency: "weekly",
          unknown: 42,
        },
        SPECS,
      ),
    ).toEqual({});
  });

  it("no acepta un número donde va una opción, ni al revés si no está en la lista", () => {
    expect(decodeCalculatorInputs({ frequency: 3 }, SPECS)).toEqual({});
    expect(decodeCalculatorInputs({ amount: "monthly" }, SPECS)).toEqual({});
  });

  it("tolera cualquier cosa en lugar de un objeto", () => {
    for (const inputs of [null, undefined, 42, "x", [1, 2], true]) {
      expect(decodeCalculatorInputs(inputs, SPECS)).toEqual({});
    }
  });
});

describe("encodeCalculatorState", () => {
  it("escribe solo los campos que difieren del valor por defecto", () => {
    expect(encodeCalculatorState("", { amount: 2500, rate: 5 }, SPECS)).toBe("?amount=2500");
  });

  it("una calculadora sin tocar deja la URL limpia", () => {
    expect(encodeCalculatorState("", {}, SPECS)).toBe("");
    expect(encodeCalculatorState("", { amount: 1000, frequency: "monthly" }, SPECS)).toBe("");
  });

  it("quita el parámetro cuando el campo vuelve a su valor por defecto", () => {
    expect(encodeCalculatorState("?amount=2500", { amount: 1000 }, SPECS)).toBe("");
  });

  it("conserva los parámetros ajenos a la calculadora", () => {
    expect(encodeCalculatorState("?utm_source=news", { amount: 2500 }, SPECS)).toBe("?utm_source=news&amount=2500");
  });

  it("borra de la URL un parámetro conocido con valor inválido", () => {
    // La calculadora lo está ignorando: dejarlo en la URL sería engañoso.
    expect(encodeCalculatorState("?amount=abc", {}, SPECS)).toBe("");
  });

  it("produce una query string estable para el mismo estado", () => {
    const values = { amount: 2500, frequency: "yearly" };
    const once = encodeCalculatorState("", values, SPECS);
    expect(encodeCalculatorState(once, values, SPECS)).toBe(once);
  });

  it("codifica los valores que necesitan escape", () => {
    const specs: FieldSpecs = {
      region: { kind: "option", defaultValue: "es", allowed: ["es", "castilla y leon"] },
    };
    const query = encodeCalculatorState("", { region: "castilla y leon" }, specs);
    expect(decodeCalculatorState(query, specs)).toEqual({ region: "castilla y leon" });
  });
});

describe("completeValues", () => {
  it("rellena con los valores por defecto los campos que faltan", () => {
    expect(completeValues({ amount: 2500 }, SPECS)).toEqual({
      amount: 2500,
      rate: 5,
      frequency: "monthly",
    });
  });

  it("sin campos registrados no inventa nada", () => {
    expect(completeValues({ amount: 2500 }, {})).toEqual({});
  });
});
