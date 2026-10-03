"use client";

import { useState } from "react";

/** Range selected on a numeric X axis (e.g. years), in the order it was dragged. */
export type RangeSelection = { start: number; end: number };

/** What Recharts passes to its mouse and touch handlers: the X label under the pointer. */
type ChartPointerState = { activeLabel?: string | number } | null;

type Handlers = {
  onMouseDown: (state: ChartPointerState) => void;
  onMouseMove: (state: ChartPointerState) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  onTouchStart: (state: ChartPointerState) => void;
  onTouchMove: (state: ChartPointerState) => void;
  onTouchEnd: () => void;
};

/**
 * Drag-to-select a range of the X axis, by mouse or touch: while dragging, the range's growth is
 * shown, and it clears on release. Returns the selection and the handlers, which are passed as is
 * to the Recharts chart. With `enabled = false` the handlers do nothing (date axes, where a range
 * makes no sense).
 *
 * It is a hook (React state) rather than pure logic because the selection changes with every
 * pointer move and has to re-render the summary.
 */
export function useRangeSelection(enabled: boolean): { selection: RangeSelection | null; handlers: Handlers } {
  const [selection, setSelection] = useState<RangeSelection | null>(null);
  const [dragging, setDragging] = useState(false);

  const start = (state: ChartPointerState) => {
    if (!enabled || state?.activeLabel === undefined) return;
    const x = Number(state.activeLabel);
    setDragging(true);
    setSelection({ start: x, end: x });
  };
  const move = (state: ChartPointerState) => {
    if (!enabled || !dragging || state?.activeLabel === undefined) return;
    const x = Number(state.activeLabel);
    setSelection((prev) => (prev ? { ...prev, end: x } : prev));
  };
  // On touch, when the touch starts Recharts has not computed the active point yet (or carries
  // the previous touch's): the start only clears, the first move opens the selection and later
  // moves extend it.
  const touchMove = (state: ChartPointerState) => {
    if (!enabled || state?.activeLabel === undefined) return;
    const x = Number(state.activeLabel);
    setSelection((prev) => (prev ? { ...prev, end: x } : { start: x, end: x }));
  };
  // Reset on release or when leaving the chart.
  const stop = () => {
    setDragging(false);
    setSelection(null);
  };

  return {
    selection,
    handlers: {
      onMouseDown: start,
      onMouseMove: move,
      onMouseUp: stop,
      onMouseLeave: stop,
      onTouchStart: stop,
      onTouchMove: touchMove,
      onTouchEnd: stop,
    },
  };
}
