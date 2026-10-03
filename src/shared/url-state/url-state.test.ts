import { describe, expect, it } from "vitest";

import {
  completeValues,
  decodeCalculatorInputs,
  decodeCalculatorState,
  decodeFieldValue,
  encodeCalculatorState,
  encodeFieldValue,
  type FieldSpecs,
} from "./url-state";

/** A representative field set: numbers and a closed list of options. */
const SPECS: FieldSpecs = {
  amount: { kind: "number", defaultValue: 1000 },
  rate: { kind: "number", defaultValue: 5 },
  frequency: { kind: "option", defaultValue: "monthly", allowed: ["monthly", "yearly"] },
};

describe("decodeFieldValue", () => {
  it("accepts integers, decimals and negatives", () => {
    const spec = { kind: "number", defaultValue: 0 } as const;
    expect(decodeFieldValue(spec, "1000")).toBe(1000);
    expect(decodeFieldValue(spec, "3.5")).toBe(3.5);
    expect(decodeFieldValue(spec, "-2.25")).toBe(-2.25);
    expect(decodeFieldValue(spec, "0")).toBe(0);
  });

  it("rejects anything that is not a number in positional notation", () => {
    const spec = { kind: "number", defaultValue: 0 } as const;
    for (const raw of [
      "",
      "abc",
      "NaN",
      "Infinity",
      "1e400", // scientific notation: it would also overflow to Infinity
      "1e3",
      "3,5", // the comma belongs to the mobile keyboard, not to the URL
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

  it("accepts only the listed options", () => {
    const spec = { kind: "option", defaultValue: "monthly", allowed: ["monthly", "yearly"] } as const;
    expect(decodeFieldValue(spec, "yearly")).toBe("yearly");
    expect(decodeFieldValue(spec, "MONTHLY")).toBeNull();
    expect(decodeFieldValue(spec, "weekly")).toBeNull();
    expect(decodeFieldValue(spec, "__proto__")).toBeNull();
  });
});

describe("encodeFieldValue", () => {
  it("writes numbers with a point and without scientific notation", () => {
    expect(encodeFieldValue(1234.5)).toBe("1234.5");
    expect(encodeFieldValue(-0.25)).toBe("-0.25");
    expect(encodeFieldValue(0)).toBe("0");
    expect(encodeFieldValue(1e21)).toBe("1000000000000000000000");
  });

  it("preserves the value on a round trip", () => {
    const spec = { kind: "number", defaultValue: 0 } as const;
    for (const value of [0, 1, -1, 0.1, 1234.56, 1e21, 1e-7]) {
      expect(decodeFieldValue(spec, encodeFieldValue(value)), String(value)).toBe(value);
    }
  });
});

describe("decodeCalculatorState", () => {
  it("reads the known fields from the query string", () => {
    expect(decodeCalculatorState("?amount=2500&rate=3.5&frequency=yearly", SPECS)).toEqual({
      amount: 2500,
      rate: 3.5,
      frequency: "yearly",
    });
  });

  it("omits missing fields (the caller applies the default)", () => {
    expect(decodeCalculatorState("?rate=7", SPECS)).toEqual({ rate: 7 });
    expect(decodeCalculatorState("", SPECS)).toEqual({});
  });

  it("omits garbage values without touching the valid ones next to them", () => {
    expect(decodeCalculatorState("?amount=abc&rate=7", SPECS)).toEqual({ rate: 7 });
    expect(decodeCalculatorState("?frequency=weekly&amount=200", SPECS)).toEqual({ amount: 200 });
    expect(decodeCalculatorState("?amount=<script>x</script>", SPECS)).toEqual({});
  });

  it("ignores parameters that are not calculator fields", () => {
    expect(decodeCalculatorState("?utm_source=x&amount=200", SPECS)).toEqual({ amount: 200 });
  });

  it("is not vulnerable to prototype pollution", () => {
    const values = decodeCalculatorState("?__proto__=polluted&constructor=x&amount=1", SPECS);
    expect(values).toEqual({ amount: 1 });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("keeps the first value of a repeated key", () => {
    expect(decodeCalculatorState("?amount=1&amount=2", SPECS)).toEqual({ amount: 1 });
  });
});

describe("decodeCalculatorInputs", () => {
  it("accepts the already typed numbers of a saved scenario", () => {
    expect(decodeCalculatorInputs({ amount: 2500, frequency: "yearly" }, SPECS)).toEqual({
      amount: 2500,
      frequency: "yearly",
    });
  });

  it("also accepts numbers written as text", () => {
    expect(decodeCalculatorInputs({ amount: "2500" }, SPECS)).toEqual({ amount: 2500 });
  });

  it("discards values that do not fit the field (stale or tampered scenario)", () => {
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

  it("rejects a number where an option goes, and an option not in the list", () => {
    expect(decodeCalculatorInputs({ frequency: 3 }, SPECS)).toEqual({});
    expect(decodeCalculatorInputs({ amount: "monthly" }, SPECS)).toEqual({});
  });

  it("tolerates anything in place of an object", () => {
    for (const inputs of [null, undefined, 42, "x", [1, 2], true]) {
      expect(decodeCalculatorInputs(inputs, SPECS)).toEqual({});
    }
  });
});

describe("encodeCalculatorState", () => {
  it("writes only the fields that differ from the default", () => {
    expect(encodeCalculatorState("", { amount: 2500, rate: 5 }, SPECS)).toBe("?amount=2500");
  });

  it("leaves the URL clean for an untouched calculator", () => {
    expect(encodeCalculatorState("", {}, SPECS)).toBe("");
    expect(encodeCalculatorState("", { amount: 1000, frequency: "monthly" }, SPECS)).toBe("");
  });

  it("removes the parameter when the field returns to its default", () => {
    expect(encodeCalculatorState("?amount=2500", { amount: 1000 }, SPECS)).toBe("");
  });

  it("keeps parameters unrelated to the calculator", () => {
    expect(encodeCalculatorState("?utm_source=news", { amount: 2500 }, SPECS)).toBe("?utm_source=news&amount=2500");
  });

  it("removes a known parameter with an invalid value from the URL", () => {
    // The calculator is ignoring it: leaving it in the URL would be misleading.
    expect(encodeCalculatorState("?amount=abc", {}, SPECS)).toBe("");
  });

  it("produces a stable query string for the same state", () => {
    const values = { amount: 2500, frequency: "yearly" };
    const once = encodeCalculatorState("", values, SPECS);
    expect(encodeCalculatorState(once, values, SPECS)).toBe(once);
  });

  it("encodes values that need escaping", () => {
    const specs: FieldSpecs = {
      region: { kind: "option", defaultValue: "es", allowed: ["es", "castilla y leon"] },
    };
    const query = encodeCalculatorState("", { region: "castilla y leon" }, specs);
    expect(decodeCalculatorState(query, specs)).toEqual({ region: "castilla y leon" });
  });
});

describe("completeValues", () => {
  it("fills missing fields with their defaults", () => {
    expect(completeValues({ amount: 2500 }, SPECS)).toEqual({
      amount: 2500,
      rate: 5,
      frequency: "monthly",
    });
  });

  it("invents nothing without registered fields", () => {
    expect(completeValues({ amount: 2500 }, {})).toEqual({});
  });
});
