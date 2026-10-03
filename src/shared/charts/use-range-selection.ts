"use client";

import { useState } from "react";

/** Tramo seleccionado sobre un eje X numérico (p. ej. años), en el orden en que se arrastró. */
export type RangeSelection = { start: number; end: number };

/** Lo que Recharts pasa a sus manejadores de ratón y táctiles: la etiqueta X bajo el puntero. */
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
 * Selección por arrastre de un tramo del eje X, con ratón o con el dedo: mientras se arrastra se
 * enseña el crecimiento del tramo y al soltar se borra. Devuelve la selección y los manejadores
 * que se pasan tal cual al gráfico de Recharts. Con `enabled = false` los manejadores no hacen
 * nada (ejes de fechas, donde un tramo no tiene sentido).
 *
 * Es un hook (estado de React) y no lógica pura porque la selección cambia con cada movimiento
 * del puntero y tiene que provocar un nuevo render del resumen.
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
  // Con el dedo, al empezar el toque Recharts aún no ha calculado el punto activo (o trae el del
  // toque anterior): el inicio solo limpia, el primer movimiento abre la selección y los
  // siguientes la extienden.
  const touchMove = (state: ChartPointerState) => {
    if (!enabled || state?.activeLabel === undefined) return;
    const x = Number(state.activeLabel);
    setSelection((prev) => (prev ? { ...prev, end: x } : { start: x, end: x }));
  };
  // Se resetea al soltar o al salir del gráfico.
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
