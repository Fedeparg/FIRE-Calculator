import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useInputs } from "./use-inputs";

describe("useInputs", () => {
  it("devuelve los valores de los campos con identidad estable mientras no cambian", () => {
    const set = () => undefined;
    const { result, rerender } = renderHook(
      ({ a, b }: { a: number; b: string }) => useInputs({ a: { value: a, set }, b: { value: b, set } }),
      { initialProps: { a: 1, b: "x" } },
    );
    const first = result.current;
    expect(first).toEqual({ a: 1, b: "x" });

    rerender({ a: 1, b: "x" });
    expect(result.current).toBe(first);

    rerender({ a: 2, b: "x" });
    expect(result.current).toEqual({ a: 2, b: "x" });
    expect(result.current).not.toBe(first);
  });
});
