import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useRangeSelection } from "./use-range-selection";

describe("useRangeSelection", () => {
  it("sigue el arrastre con ratón y se borra al soltar", () => {
    const { result } = renderHook(() => useRangeSelection(true));

    act(() => result.current.handlers.onMouseDown({ activeLabel: 5 }));
    act(() => result.current.handlers.onMouseMove({ activeLabel: 12 }));
    expect(result.current.selection).toEqual({ start: 5, end: 12 });

    act(() => result.current.handlers.onMouseUp());
    expect(result.current.selection).toBeNull();
  });

  it("funciona igual con el dedo, y la etiqueta de texto se convierte a número", () => {
    const { result } = renderHook(() => useRangeSelection(true));

    act(() => result.current.handlers.onTouchStart({ activeLabel: "3" }));
    act(() => result.current.handlers.onTouchMove({ activeLabel: "1" }));
    expect(result.current.selection).toEqual({ start: 3, end: 1 });

    act(() => result.current.handlers.onTouchEnd());
    expect(result.current.selection).toBeNull();
  });

  it("no selecciona nada si está desactivada, sin punto activo o sin haber empezado a arrastrar", () => {
    const disabled = renderHook(() => useRangeSelection(false));
    act(() => disabled.result.current.handlers.onMouseDown({ activeLabel: 5 }));
    expect(disabled.result.current.selection).toBeNull();

    const { result } = renderHook(() => useRangeSelection(true));
    act(() => result.current.handlers.onMouseMove({ activeLabel: 5 }));
    act(() => result.current.handlers.onMouseDown(null));
    expect(result.current.selection).toBeNull();
  });
});
