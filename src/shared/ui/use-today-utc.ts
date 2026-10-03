"use client";

import { useState } from "react";

import { todayUtc } from "@sextante/core/dates";

/**
 * Hoy en UTC (`YYYY-MM-DD`), leído UNA vez al montar. `useState` con inicializador guarda el valor
 * entre renders: así el reloj no se consulta en cada render, y todo lo que se deriva de "hoy"
 * (año en curso, ejercicio por defecto, punto final de una serie) es estable mientras el
 * componente vive. En UTC, como las fechas de lotes, cobros y precios.
 */
export function useTodayUtc(): string {
  const [today] = useState(todayUtc);
  return today;
}
