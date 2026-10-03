import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useRangeSelection } from "./use-range-selection";

describe("useRangeSelection", () => {
  it("follows a mouse drag and clears on release", () => {
    const { result } = renderHook(() => useRangeSelection(true));

    act(() => result.current.handlers.onMouseDown({ activeLabel: 5 }));
    act(() => result.current.handlers.onMouseMove({ activeLabel: 12 }));
    expect(result.current.selection).toEqual({ start: 5, end: 12 });

    act(() => result.current.handlers.onMouseUp());
    expect(result.current.selection).toBeNull();
  });

  it("on touch, the first move opens the selection (not the point the start event carries)", () => {
    const { result } = renderHook(() => useRangeSelection(true));

    // The start event may carry the active point of the previous touch: it is ignored.
    act(() => result.current.handlers.onTouchStart({ activeLabel: "20" }));
    act(() => result.current.handlers.onTouchMove({ activeLabel: "4" }));
    act(() => result.current.handlers.onTouchMove({ activeLabel: "9" }));
    expect(result.current.selection).toEqual({ start: 4, end: 9 });

    act(() => result.current.handlers.onTouchEnd());
    expect(result.current.selection).toBeNull();
  });

  it("selects nothing when disabled, without an active point or before a drag has started", () => {
    const disabled = renderHook(() => useRangeSelection(false));
    act(() => disabled.result.current.handlers.onMouseDown({ activeLabel: 5 }));
    expect(disabled.result.current.selection).toBeNull();

    const { result } = renderHook(() => useRangeSelection(true));
    act(() => result.current.handlers.onMouseMove({ activeLabel: 5 }));
    act(() => result.current.handlers.onMouseDown(null));
    expect(result.current.selection).toBeNull();
  });
});
